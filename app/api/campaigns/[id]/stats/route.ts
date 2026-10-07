import { getCampaignBalance } from '@/lib/chain';
import { db } from '@/lib/db';
import { toUi } from '@/lib/money';
import { handle, json, reconcileCampaign } from '@/lib/server-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const id = (await context.params).id; const row = await reconcileCampaign(id, false);
    const counts = db.prepare("SELECT count(*) AS verified,coalesce(sum(payout_status='confirmed'),0) AS confirmed,coalesce(sum(payout_status='pending'),0) AS pending,coalesce(sum(payout_status='failed'),0) AS failed FROM checkins WHERE campaign_id=?").get(id) as { verified: bigint; confirmed: bigint; pending: bigint; failed: bigint };
    const feedRows = db.prepare('SELECT c.id AS checkinId,t.name,c.scanned_at AS scannedAt,c.payout_status AS payoutStatus,c.payout_tx AS payoutTx FROM checkins c JOIN tickets t ON t.id=c.ticket_id WHERE c.campaign_id=? ORDER BY c.scanned_at DESC,c.id DESC LIMIT 20').all(id) as Array<{ checkinId: string; name: string; scannedAt: bigint; payoutStatus: string; payoutTx: string | null }>;
    const failedRows = db.prepare("SELECT c.id AS checkinId,t.name,c.scanned_at AS scannedAt,c.payout_status AS payoutStatus,c.payout_tx AS payoutTx FROM checkins c JOIN tickets t ON t.id=c.ticket_id WHERE c.campaign_id=? AND c.payout_status='failed' ORDER BY c.scanned_at DESC,c.id DESC LIMIT 1000").all(id) as typeof feedRows;
    let escrowUi: number | null = null;
    if (row.create_tx) { try { escrowUi = toUi(await getCampaignBalance(id)); } catch { /* Read outage should keep the dashboard usable. */ } }
    const publicFeed = (entries: typeof feedRows) => entries.map(entry => ({ ...entry, scannedAt: Number(entry.scannedAt) }));
    return json({ verified: Number(counts.verified), cap: Number(row.cap), paidUi: toUi(counts.confirmed * row.per_head), escrowUi, pendingCount: Number(counts.pending), failedCount: Number(counts.failed), status: row.status, closeTx: row.close_tx, feed: publicFeed(feedRows), failedFeed: publicFeed(failedRows) });
  });
}
