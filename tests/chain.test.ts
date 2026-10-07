import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  write: vi.fn(), receipt: vi.fn(), chainId: vi.fn(), read: vi.fn(), logs: vi.fn(), block: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("viem", async (original) => {
  const actual = await original<typeof import("viem")>();
  return { ...actual,
    createPublicClient: () => ({ getChainId: fake.chainId, waitForTransactionReceipt: fake.receipt, readContract: fake.read, getContractEvents: fake.logs, getBlockNumber: fake.block }),
    createWalletClient: () => ({ writeContract: fake.write }),
  };
});
const hash = `0x${"a".repeat(64)}` as const;
const sponsor = "0x0000000000000000000000000000000000000100";
const host = "0x0000000000000000000000000000000000000200";
const campaign = [sponsor, host, 5_000_000n, 50_000_000n, 10, 0, true, false];

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.RPC_URL = "http://127.0.0.1:8545";
  process.env.OPERATOR_PRIVATE_KEY = `0x${"1".repeat(64)}`;
  process.env.TOKEN_ADDRESS = "0x0000000000000000000000000000000000000300";
  process.env.ESCROW_ADDRESS = "0x0000000000000000000000000000000000000400";
  fake.chainId.mockResolvedValue(84532);
  fake.write.mockResolvedValue(hash);
  fake.receipt.mockResolvedValue({ status: "success" });
  fake.read.mockImplementation(({ functionName }) => Promise.resolve(functionName === "campaigns" ? campaign : functionName === "allowance" ? 2n ** 256n - 1n : false));
  fake.logs.mockResolvedValue([{ transactionHash: hash }]);
  fake.block.mockResolvedValue(100_000n);
});

describe("real chain boundary with test-only transport doubles", () => {
  it("loads without secrets and fails only when a configured operation is attempted", async () => {
    delete process.env.OPERATOR_PRIVATE_KEY;
    const chain = await import("../lib/chain");
    expect(chain.isValidAddress(host)).toBe(true);
    await expect(chain.payCheckin("c", "t")).rejects.toThrow("configuration");
    expect(fake.write).not.toHaveBeenCalled();
  });
  it("rejects a reverted receipt and the queue recovers for the next write", async () => {
    const chain = await import("../lib/chain");
    fake.receipt.mockResolvedValueOnce({ status: "reverted" });
    const first = chain.payCheckin("c", "t1");
    const next = chain.payCheckin("c", "t2");
    await expect(first).rejects.toThrow("reverted");
    await expect(next).resolves.toBe(hash);
    expect(fake.write).toHaveBeenCalledTimes(2);
  });
  it("serializes through receipt completion and across a module reload", async () => {
    let finish!: (value: { status: string }) => void;
    fake.receipt.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const chain = await import("../lib/chain");
    const first = chain.payCheckin("c", "t1");
    await vi.waitFor(() => expect(fake.receipt).toHaveBeenCalledTimes(1));
    vi.resetModules();
    const reloaded = await import("../lib/chain");
    const second = reloaded.closeCampaignOnchain("c");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fake.write).toHaveBeenCalledTimes(1);
    finish({ status: "success" });
    await Promise.all([first, second]);
    expect(fake.write).toHaveBeenCalledTimes(2);
  });
  it("holds mint and funding inside one queued job and checks both receipts", async () => {
    const chain = await import("../lib/chain");
    await Promise.all([chain.fundCampaign("c", 50_000_000n), chain.payCheckin("c", "t")]);
    expect(fake.write.mock.calls.map(([call]) => call.functionName)).toEqual(["mint", "fund", "checkIn"]);
    expect(fake.receipt).toHaveBeenCalledTimes(3);
  });
  it("never funds if mint reverted and permits the next queued job", async () => {
    const chain = await import("../lib/chain");
    fake.receipt.mockResolvedValueOnce({ status: "reverted" });
    await expect(chain.fundCampaign("c", 1n)).rejects.toThrow("reverted");
    await expect(chain.payCheckin("c", "t")).resolves.toBe(hash);
    expect(fake.write.mock.calls.map(([call]) => call.functionName)).toEqual(["mint", "checkIn"]);
  });
  it("checks an approval receipt before minting when allowance is missing", async () => {
    const chain = await import("../lib/chain");
    fake.read.mockImplementation(({ functionName }) => Promise.resolve(functionName === "campaigns" ? campaign : 0n));
    fake.receipt.mockResolvedValueOnce({ status: "reverted" });
    await expect(chain.fundCampaign("c", 1n)).rejects.toThrow("reverted");
    expect(fake.write.mock.calls.map(([call]) => call.functionName)).toEqual(["approve"]);
  });
  it("rejects a reverted fund receipt instead of returning a success hash", async () => {
    const chain = await import("../lib/chain");
    fake.receipt.mockResolvedValueOnce({ status: "success" }).mockResolvedValueOnce({ status: "reverted" });
    await expect(chain.fundCampaign("c", 1n)).rejects.toThrow("reverted");
    expect(fake.write.mock.calls.map(([call]) => call.functionName)).toEqual(["mint", "fund"]);
  });
  it("rejects invalid contract-sized inputs before broadcasting", async () => {
    const chain = await import("../lib/chain");
    for (const perHead of [0n, -1n, 1n << 128n]) {
      await expect(chain.createCampaignOnchain("c", sponsor, host, perHead, 1)).rejects.toThrow("InvalidAmount");
    }
    for (const cap of [0, -1, 0.5, 2 ** 32]) {
      await expect(chain.createCampaignOnchain("c", sponsor, host, 1n, cap)).rejects.toThrow("InvalidCap");
    }
    expect(fake.write).not.toHaveBeenCalled();
  });
  it("rejects the wrong chain before broadcasting", async () => {
    const chain = await import("../lib/chain");
    fake.chainId.mockResolvedValue(1);
    await expect(chain.createCampaignOnchain("c", sponsor, host, 5_000_000n, 10)).rejects.toThrow("Base Sepolia");
    expect(fake.write).not.toHaveBeenCalled();
  });
  it("returns the existing close event for an uncertain close retry", async () => {
    const chain = await import("../lib/chain");
    fake.read.mockResolvedValue([...campaign.slice(0, 7), true]);
    await expect(chain.closeCampaignOnchain("c")).resolves.toBe(hash);
    expect(fake.write).not.toHaveBeenCalled();
    expect(fake.logs).toHaveBeenCalledWith(expect.objectContaining({ eventName: "Closed", args: expect.any(Object) }));
  });
  it("bounds recovery when a closed campaign has no recent receipt", async () => {
    const chain = await import("../lib/chain");
    fake.read.mockResolvedValue([...campaign.slice(0, 7), true]);
    fake.logs.mockResolvedValue([]);
    await expect(chain.closeCampaignOnchain("c")).rejects.toThrow("Closed transaction recovery unavailable");
    expect(fake.logs).toHaveBeenCalledTimes(10);
    expect(fake.write).not.toHaveBeenCalled();
  });
  it("rejects nonexistent campaigns before minting", async () => {
    const chain = await import("../lib/chain");
    fake.read.mockResolvedValue([...campaign.slice(0, 6), false, false]);
    await expect(chain.fundCampaign("missing", 1n)).rejects.toThrow("NoCampaign");
    expect(fake.write).not.toHaveBeenCalled();
  });
  it("rejects funding after closure before minting", async () => {
    const chain = await import("../lib/chain");
    fake.read.mockResolvedValue([...campaign.slice(0, 7), true]);
    await expect(chain.fundCampaign("c", 1n)).rejects.toThrow("Closed");
    expect(fake.write).not.toHaveBeenCalled();
  });
  it("returns balance and paid state from the real ABI fields", async () => {
    const chain = await import("../lib/chain");
    await expect(chain.getCampaignBalance("c")).resolves.toBe(50_000_000n);
    fake.read.mockResolvedValue(true);
    await expect(chain.isPaid("c", "t")).resolves.toBe(true);
  });
  it("reads campaign closure for direct sponsor-close reconciliation", async () => {
    const chain = await import("../lib/chain");
    await expect(chain.isCampaignClosed("c")).resolves.toBe(false);
    fake.read.mockResolvedValue([...campaign.slice(0, 7), true]);
    await expect(chain.isCampaignClosed("c")).resolves.toBe(true);
    expect(fake.write).not.toHaveBeenCalled();
  });
  it("does not surface transport secrets in chain failures", async () => {
    const chain = await import("../lib/chain");
    fake.write.mockRejectedValue(new Error("request failed private-key=secret RPC_URL=secret"));
    await expect(chain.payCheckin("c", "t")).rejects.toThrow("Chain request failed");
  });
});
