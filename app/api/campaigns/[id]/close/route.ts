import { closeCampaignOnchain } from '@/lib/chain';
import { db } from '@/lib/db';
import { ApiError, body, campaign, guard, handle, json, pin, ready } from '@/lib/server-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const id = (await context.params).id; const input = await body(request);
    pin(input.sponsorPin, campaign(id).sponsor_pin);
    return guard(id, async () => {
      const previous = db.transaction(() => {
        const row = campaign(id); ready(row);
        if (row.status === 'closed') return row.close_tx;
        if (db.prepare("SELECT id FROM checkins WHERE campaign_id=? AND payout_status='pending' LIMIT 1").get(id)) throw new ApiError(409, 'payouts_pending');
        if (db.prepare("SELECT id FROM checkins WHERE campaign_id=? AND payout_status!='confirmed' LIMIT 1").get(id)) throw new ApiError(409, 'payouts_unsettled');
        // Persist before the await; ambiguous chain errors and process restarts
        // must not permit new accepted check-ins into a possibly closed escrow.
        db.prepare("UPDATE campaigns SET status='closing' WHERE id=?").run(id);
        return null;
      })();
      if (previous) return json({ tx: previous });
      let tx: string;
      try { tx = await closeCampaignOnchain(id); } catch { throw new ApiError(502, 'close_failed_retry_required'); }
      db.prepare("UPDATE campaigns SET status='closed',close_tx=? WHERE id=?").run(tx, id);
      return json({ tx });
    });
  });
}
