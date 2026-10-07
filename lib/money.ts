/** hUSDC uses six decimal places. JSON and SQLite boundaries stay within safe integers. */
export const DECIMALS = 6;
const SCALE = 1_000_000n;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export function toBase(ui: number): bigint {
  if (typeof ui !== "number" || !Number.isFinite(ui) || ui < 0) {
    throw new Error("Amount must be a finite nonnegative number");
  }
  // Parse the decimal representation rather than multiplying floating-point values.
  // Values with sub-base-unit precision are rejected instead of silently rounded.
  const match = /^(\d+)(?:\.(\d+))?$/.exec(ui.toString());
  if (!match || (match[2]?.length ?? 0) > DECIMALS) {
    throw new Error("Amount must have at most six decimal places");
  }
  const base = BigInt(match[1]) * SCALE + BigInt((match[2] ?? "").padEnd(DECIMALS, "0"));
  if (base > MAX_SAFE) throw new Error("Amount exceeds safe integer base units");
  return base;
}

export function toUi(base: bigint): number {
  if (typeof base !== "bigint" || base < 0n || base > MAX_SAFE) {
    throw new Error("Amount exceeds safe integer base units");
  }
  return Number(base) / Number(SCALE);
}
