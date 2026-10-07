import "server-only";
import {
  BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient,
  http, isAddress, keccak256, parseAbi, toHex, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const escrowAbi = parseAbi([
  "function createCampaign(bytes32 id, address sponsor, address host, uint128 perHead, uint32 cap)",
  "function fund(bytes32 id, uint128 amount)",
  "function checkIn(bytes32 id, bytes32 checkinKey)",
  "function close(bytes32 id)",
  "function campaigns(bytes32 id) view returns (address sponsor, address host, uint128 perHead, uint128 balance, uint32 cap, uint32 verified, bool exists, bool closed)",
  "function paid(bytes32 checkinKey) view returns (bool)",
  "event CampaignCreated(bytes32 indexed id, address sponsor, address host, uint128 perHead, uint32 cap)",
  "event Funded(bytes32 indexed id, address from, uint128 amount)",
  "event CheckedIn(bytes32 indexed id, bytes32 indexed checkinKey, address indexed host, uint128 amount)",
  "event Closed(bytes32 indexed id, uint128 refunded)",
  "error NotOperator()", "error NotAuthorized()", "error Exists()", "error NoCampaign()",
  "error Closed()", "error AlreadyPaid()", "error CapReached()", "error Insufficient()",
  "error ZeroAddress()", "error InvalidAmount()", "error InvalidCap()",
]);
const tokenAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "error OwnableUnauthorizedAccount(address account)",
]);
const MAX_UINT128 = (1n << 128n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const zero = "0x0000000000000000000000000000000000000000";

// Next hot reload can reevaluate this module while a prior call is in flight.
// Symbol.for keeps one queue for the entire process, including those evaluations.
const queueKey = Symbol.for("headcount.operator.transaction.queue.v1");
const processState = globalThis as unknown as { [key: symbol]: { tail: Promise<unknown> } | undefined };
const queue = processState[queueKey] ??= { tail: Promise.resolve() };
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.tail.then(fn, fn);
  queue.tail = run.catch(() => undefined);
  return run;
}

function configuredClients() {
  const privateKey = process.env.OPERATOR_PRIVATE_KEY;
  const rpc = process.env.RPC_URL;
  const token = process.env.TOKEN_ADDRESS;
  const escrow = process.env.ESCROW_ADDRESS;
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey) || !rpc ||
      !token || !isValidAddress(token) || token.toLowerCase() === zero ||
      !escrow || !isValidAddress(escrow) || escrow.toLowerCase() === zero) {
    throw new ChainError("Chain configuration is incomplete or invalid");
  }
  try {
    const url = new URL(rpc);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    const account = privateKeyToAccount(privateKey as Hex);
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
    const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(rpc) });
    return { publicClient, walletClient, account, token: token as Hex, escrow: escrow as Hex };
  } catch { throw new ChainError("Chain configuration is incomplete or invalid"); }
}
type Clients = ReturnType<typeof configuredClients>;
class ChainError extends Error {}

function sanitized(error: unknown): Error {
  if (error instanceof ChainError) return error;
  if (error instanceof BaseError) {
    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName) {
      return new Error(reverted.data.errorName);
    }
  }
  // Transport errors can contain request URLs and signing inputs. Never persist them.
  return new Error("Chain request failed");
}
async function withChain<T>(fn: (clients: Clients) => Promise<T>): Promise<T> {
  try {
    const clients = configuredClients();
    if (await clients.publicClient.getChainId() !== baseSepolia.id) {
      throw new ChainError("Expected Base Sepolia (84532)");
    }
    return await fn(clients);
  } catch (error) { throw sanitized(error); }
}
async function successfulReceipt(clients: Clients, hash: Hex): Promise<Hex> {
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new ChainError("Transaction reverted");
  return hash;
}
function campaignKey(id: string): Hex {
  if (!id) throw new ChainError("Invalid campaign ID");
  return keccak256(toHex(id));
}
function ticketKey(campaignId: string, ticketId: string): Hex {
  if (!campaignId || !ticketId) throw new ChainError("Invalid ticket ID");
  return keccak256(toHex(`${campaignId}:${ticketId}`));
}
function validAmount(amount: bigint): void {
  if (typeof amount !== "bigint" || amount <= 0n || amount > MAX_UINT128) {
    throw new ChainError("InvalidAmount");
  }
}
async function campaign(clients: Clients, id: string) {
  const state = await clients.publicClient.readContract({ address: clients.escrow, abi: escrowAbi,
    functionName: "campaigns", args: [campaignKey(id)] });
  if (!state[6]) throw new ChainError("NoCampaign");
  return state;
}

export function isValidAddress(s: string): boolean { return typeof s === "string" && isAddress(s); }
export function explorerTx(hash: string): string { return `https://sepolia.basescan.org/tx/${hash}`; }
export function explorerAddr(address: string): string { return `https://sepolia.basescan.org/address/${address}`; }

export function createCampaignOnchain(campaignId: string, sponsor: Hex, host: Hex, perHead: bigint, cap: number): Promise<Hex> {
  return enqueue(() => withChain(async (clients) => {
    validAmount(perHead);
    if (!isValidAddress(sponsor) || !isValidAddress(host) || sponsor.toLowerCase() === zero || host.toLowerCase() === zero) {
      throw new ChainError("ZeroAddress");
    }
    if (!Number.isInteger(cap) || cap <= 0 || cap > 0xffff_ffff) throw new ChainError("InvalidCap");
    const hash = await clients.walletClient.writeContract({ address: clients.escrow, abi: escrowAbi,
      functionName: "createCampaign", args: [campaignKey(campaignId), sponsor, host, perHead, cap] });
    return successfulReceipt(clients, hash);
  }));
}

export function fundCampaign(campaignId: string, amount: bigint): Promise<Hex> {
  return enqueue(() => withChain(async (clients) => {
    validAmount(amount);
    const state = await campaign(clients, campaignId);
    if (state[7]) throw new ChainError("Closed");
    if (state[3] + amount > MAX_UINT128) throw new ChainError("InvalidAmount");
    // Approval, mint and fund are one queue job. Each stage must confirm before
    // the next stage or another operator transaction can begin.
    const allowance = await clients.publicClient.readContract({ address: clients.token, abi: tokenAbi,
      functionName: "allowance", args: [clients.account.address, clients.escrow] });
    if (allowance < amount) {
      await successfulReceipt(clients, await clients.walletClient.writeContract({ address: clients.token,
        abi: tokenAbi, functionName: "approve", args: [clients.escrow, MAX_UINT256] }));
    }
    await successfulReceipt(clients, await clients.walletClient.writeContract({ address: clients.token,
      abi: tokenAbi, functionName: "mint", args: [clients.account.address, amount] }));
    const hash = await clients.walletClient.writeContract({ address: clients.escrow, abi: escrowAbi,
      functionName: "fund", args: [campaignKey(campaignId), amount] });
    return successfulReceipt(clients, hash);
  }));
}

export function getCampaignBalance(campaignId: string): Promise<bigint> {
  return withChain(async (clients) => (await campaign(clients, campaignId))[3]);
}
export function isCampaignClosed(campaignId: string): Promise<boolean> {
  return withChain(async (clients) => (await campaign(clients, campaignId))[7]);
}
export function isPaid(campaignId: string, ticketId: string): Promise<boolean> {
  return withChain((clients) => clients.publicClient.readContract({ address: clients.escrow, abi: escrowAbi,
    functionName: "paid", args: [ticketKey(campaignId, ticketId)] }));
}
export function payCheckin(campaignId: string, ticketId: string): Promise<Hex> {
  return enqueue(() => withChain(async (clients) => {
    const hash = await clients.walletClient.writeContract({ address: clients.escrow, abi: escrowAbi,
      functionName: "checkIn", args: [campaignKey(campaignId), ticketKey(campaignId, ticketId)] });
    return successfulReceipt(clients, hash);
  }));
}
export function closeCampaignOnchain(campaignId: string): Promise<Hex> {
  return enqueue(() => withChain(async (clients) => {
    const state = await campaign(clients, campaignId);
    if (state[7]) {
      // A prior close may have landed before its RPC response was lost. Recover
      // recent receipts in bounded ranges acceptable to hosted RPC providers.
      let end = await clients.publicClient.getBlockNumber();
      for (let window = 0; window < 10; window++) {
        const start = end > 1_999n ? end - 1_999n : 0n;
        const logs = await clients.publicClient.getContractEvents({ address: clients.escrow, abi: escrowAbi,
          eventName: "Closed", args: { id: campaignKey(campaignId) }, fromBlock: start, toBlock: end });
        const hash = logs.at(-1)?.transactionHash;
        if (hash) return successfulReceipt(clients, hash);
        if (start === 0n) break;
        end = start - 1n;
      }
      throw new ChainError("Closed transaction recovery unavailable");
    }
    const hash = await clients.walletClient.writeContract({ address: clients.escrow, abi: escrowAbi,
      functionName: "close", args: [campaignKey(campaignId)] });
    return successfulReceipt(clients, hash);
  }));
}
