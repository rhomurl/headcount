// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Solidity shares event/error declaration names. A namespace preserves Closed()
// in the revert ABI alongside the required Closed(bytes32,uint128) event.
library EscrowErrors {
    error Closed();
}

contract HeadcountEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public immutable operator;

    struct Campaign {
        address sponsor;
        address host;
        uint128 perHead;
        uint128 balance;
        uint32 cap;
        uint32 verified;
        bool exists;
        bool closed;
    }
    mapping(bytes32 => Campaign) public campaigns;
    mapping(bytes32 => bool) public paid;

    error NotOperator();
    error NotAuthorized();
    error Exists();
    error NoCampaign();
    error AlreadyPaid();
    error CapReached();
    error Insufficient();
    error ZeroAddress();
    error InvalidAmount();
    error InvalidCap();

    event CampaignCreated(bytes32 indexed id, address sponsor, address host, uint128 perHead, uint32 cap);
    event Funded(bytes32 indexed id, address from, uint128 amount);
    event CheckedIn(bytes32 indexed id, bytes32 indexed checkinKey, address indexed host, uint128 amount);
    event Closed(bytes32 indexed id, uint128 refunded);

    constructor(IERC20 token_, address operator_) {
        if (address(token_) == address(0) || operator_ == address(0)) revert ZeroAddress();
        token = token_;
        operator = operator_;
    }

    function createCampaign(bytes32 id, address sponsor, address host, uint128 perHead, uint32 cap) external {
        if (campaigns[id].exists) revert Exists();
        if (sponsor == address(0) || host == address(0)) revert ZeroAddress();
        if (perHead == 0) revert InvalidAmount();
        if (cap == 0) revert InvalidCap();
        campaigns[id] = Campaign(sponsor, host, perHead, 0, cap, 0, true, false);
        emit CampaignCreated(id, sponsor, host, perHead, cap);
    }

    function fund(bytes32 id, uint128 amount) external nonReentrant {
        Campaign storage c = _campaign(id);
        if (c.closed) revert EscrowErrors.Closed();
        if (amount == 0) revert InvalidAmount();
        c.balance += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(id, msg.sender, amount);
    }

    function checkIn(bytes32 id, bytes32 checkinKey) external nonReentrant {
        if (msg.sender != operator) revert NotOperator();
        Campaign storage c = _campaign(id);
        if (c.closed) revert EscrowErrors.Closed();
        if (paid[checkinKey]) revert AlreadyPaid();
        if (c.verified >= c.cap) revert CapReached();
        if (c.balance < c.perHead) revert Insufficient();
        paid[checkinKey] = true;
        c.verified += 1;
        c.balance -= c.perHead;
        token.safeTransfer(c.host, c.perHead);
        emit CheckedIn(id, checkinKey, c.host, c.perHead);
    }

    function close(bytes32 id) external nonReentrant {
        Campaign storage c = _campaign(id);
        if (msg.sender != c.sponsor && msg.sender != operator) revert NotAuthorized();
        if (c.closed) revert EscrowErrors.Closed();
        uint128 refund = c.balance;
        c.closed = true;
        c.balance = 0;
        if (refund != 0) token.safeTransfer(c.sponsor, refund);
        emit Closed(id, refund);
    }

    function _campaign(bytes32 id) private view returns (Campaign storage c) {
        c = campaigns[id];
        if (!c.exists) revert NoCampaign();
    }
}
