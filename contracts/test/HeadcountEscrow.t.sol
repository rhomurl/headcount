// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {HeadcountEscrow} from "../src/HeadcountEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

interface Vm {
    function prank(address) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function expectEmit(bool, bool, bool, bool, address) external;
}

contract HeadcountEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockUSDC token;
    HeadcountEscrow escrow;
    address sponsor = address(0x100);
    address host = address(0x200);
    bytes32 id = keccak256("campaign");
    bytes32 key = keccak256("campaign:ticket");
    event CheckedIn(bytes32 indexed id, bytes32 indexed checkinKey, address indexed host, uint128 amount);

    function setUp() public {
        token = new MockUSDC(address(this));
        escrow = new HeadcountEscrow(token, address(this));
        token.mint(address(this), 50e6);
        token.approve(address(escrow), type(uint256).max);
        escrow.createCampaign(id, sponsor, host, 5e6, 2);
        escrow.fund(id, 50e6);
    }

    function testHostPaidAndBalanceFalls() public {
        vm.expectEmit(true, true, true, true, address(escrow));
        emit CheckedIn(id, key, host, 5e6);
        escrow.checkIn(id, key);
        require(token.balanceOf(host) == 5e6, "host payout");
        (,,, uint128 balance,, uint32 verified,,) = escrow.campaigns(id);
        require(balance == 45e6 && verified == 1, "campaign accounting");
        require(escrow.paid(key), "ticket paid");
        require(token.decimals() == 6, "six decimals");
    }

    function testDuplicateKeyAcrossCampaignsReverts() public {
        escrow.checkIn(id, key);
        bytes32 another = keccak256("another");
        escrow.createCampaign(another, sponsor, host, 1e6, 1);
        token.mint(address(this), 1e6);
        escrow.fund(another, 1e6);
        vm.expectRevert(HeadcountEscrow.AlreadyPaid.selector);
        escrow.checkIn(another, key);
    }

    function testNonOperatorReverts() public {
        vm.prank(host);
        vm.expectRevert(HeadcountEscrow.NotOperator.selector);
        escrow.checkIn(id, key);
    }

    function testCapReachedReverts() public {
        escrow.checkIn(id, key);
        escrow.checkIn(id, keccak256("second"));
        vm.expectRevert(HeadcountEscrow.CapReached.selector);
        escrow.checkIn(id, keccak256("third"));
    }

    function testOperatorCloseRefundsSponsorOnly() public {
        escrow.checkIn(id, key);
        escrow.close(id);
        require(token.balanceOf(sponsor) == 45e6, "sponsor refund");
        require(token.balanceOf(host) == 5e6, "fixed host");
        (,,, uint128 balance,,,, bool closed) = escrow.campaigns(id);
        require(balance == 0 && closed, "closed accounting");
    }

    function testThirdPartyFundingStillRefundsOnlySponsor() public {
        address funder = address(0x300);
        token.mint(funder, 3e6);
        vm.prank(funder);
        token.approve(address(escrow), 3e6);
        vm.prank(funder);
        escrow.fund(id, 3e6);
        escrow.close(id);
        require(token.balanceOf(sponsor) == 53e6, "all funds refund sponsor");
        require(token.balanceOf(funder) == 0, "funder cannot redirect refund");
    }

    function testSponsorMayClose() public {
        vm.prank(sponsor);
        escrow.close(id);
        require(token.balanceOf(sponsor) == 50e6, "sponsor refund");
    }

    function testRandomCallerCannotClose() public {
        vm.prank(host);
        vm.expectRevert(HeadcountEscrow.NotAuthorized.selector);
        escrow.close(id);
    }

    function testCheckinAndFundAfterCloseRevert() public {
        escrow.close(id);
        vm.expectRevert(bytes4(keccak256("Closed()")));
        escrow.checkIn(id, key);
        vm.expectRevert(bytes4(keccak256("Closed()")));
        escrow.fund(id, 1);
        vm.expectRevert(bytes4(keccak256("Closed()")));
        escrow.close(id);
    }

    function testMissingCampaignReverts() public {
        bytes32 missing = keccak256("missing");
        vm.expectRevert(HeadcountEscrow.NoCampaign.selector);
        escrow.fund(missing, 1);
        vm.expectRevert(HeadcountEscrow.NoCampaign.selector);
        escrow.checkIn(missing, key);
        vm.expectRevert(HeadcountEscrow.NoCampaign.selector);
        escrow.close(missing);
    }

    function testInsufficientFundsLeaveTicketUnpaid() public {
        bytes32 empty = keccak256("empty");
        escrow.createCampaign(empty, sponsor, host, 1e6, 1);
        vm.expectRevert(HeadcountEscrow.Insufficient.selector);
        escrow.checkIn(empty, key);
        require(!escrow.paid(key), "failed payout cannot consume key");
    }

    function testDuplicateCampaignReverts() public {
        vm.expectRevert(HeadcountEscrow.Exists.selector);
        escrow.createCampaign(id, sponsor, host, 5e6, 2);
    }

    function testZeroAddressesRevert() public {
        vm.expectRevert(HeadcountEscrow.ZeroAddress.selector);
        new HeadcountEscrow(token, address(0));
        vm.expectRevert(HeadcountEscrow.ZeroAddress.selector);
        new HeadcountEscrow(MockUSDC(address(0)), address(this));
        vm.expectRevert(HeadcountEscrow.ZeroAddress.selector);
        escrow.createCampaign(keccak256("zero1"), address(0), host, 1, 1);
        vm.expectRevert(HeadcountEscrow.ZeroAddress.selector);
        escrow.createCampaign(keccak256("zero2"), sponsor, address(0), 1, 1);
    }

    function testZeroAmountsAndCapRevert() public {
        vm.expectRevert(HeadcountEscrow.InvalidAmount.selector);
        escrow.createCampaign(keccak256("zero"), sponsor, host, 0, 1);
        vm.expectRevert(HeadcountEscrow.InvalidCap.selector);
        escrow.createCampaign(keccak256("cap"), sponsor, host, 1, 0);
        vm.expectRevert(HeadcountEscrow.InvalidAmount.selector);
        escrow.fund(id, 0);
    }

    function testOnlyOwnerMints() public {
        vm.prank(host);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("OwnableUnauthorizedAccount(address)")), host));
        token.mint(host, 1e6);
    }
}
