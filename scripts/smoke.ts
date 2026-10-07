import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { config } from "dotenv";
import { toBase, toUi } from "../lib/money";

config({ path: ".env.local", quiet: true });

async function main() {
  // Explicit opt-in prevents an accidental test command from sending transactions.
  if (!process.argv.includes("--send-testnet-transactions")) {
    throw new Error("This smoke test sends Base Sepolia transactions. Run npm run smoke -- --send-testnet-transactions after configuring testnet credentials.");
  }
  const { createCampaignOnchain, fundCampaign, getCampaignBalance, payCheckin,
    isPaid, closeCampaignOnchain, explorerTx } = await import("../lib/chain");
  const address = () => `0x${randomBytes(20).toString("hex")}` as `0x${string}`;
  const id = `smoke-${randomUUID()}`;
  const sponsor = address();
  const host = address();
  await createCampaignOnchain(id, sponsor, host, toBase(5), 10);
  await fundCampaign(id, toBase(50));
  assert.equal(await getCampaignBalance(id), toBase(50));
  console.log("Funded escrow:", toUi(await getCampaignBalance(id)), "test hUSDC");
  const payout = await payCheckin(id, "t1");
  assert.equal(await getCampaignBalance(id), toBase(45));
  assert.equal(await isPaid(id, "t1"), true);
  console.log("CheckedIn receipt:", explorerTx(payout));
  await assert.rejects(() => payCheckin(id, "t1"), /AlreadyPaid/);
  const close = await closeCampaignOnchain(id);
  assert.equal(await getCampaignBalance(id), 0n);
  console.log("Closed/refunded receipt:", explorerTx(close));
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Smoke test failed");
  process.exitCode = 1;
});
