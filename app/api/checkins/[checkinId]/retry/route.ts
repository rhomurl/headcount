import { db, type CheckinRow } from '@/lib/db';
import { runPayout } from '@/lib/payout';
import { ApiError, body, campaign, guard, handle, json, open, pin, reconcileCampaign } from '@/lib/server-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ checkinId: string }> }): Promise<Response> {
  return handle(async () => {
    const checkinId = (await context.params).checkinId; const input = await body(request);
    const checkin = db.prepare('SELECT * FROM checkins WHERE id=?').get(checkinId) as CheckinRow | undefined;
    if (!checkin) throw new ApiError(404, 'checkin_not_found');
    pin(input.hostPin, campaign(checkin.campaign_id).host_pin);
    await reconcileCampaign(checkin.campaign_id);
    return guard(checkin.campaign_id, () => {
      db.transaction(() => {
        open(campaign(checkin.campaign_id));
        const result = db.prepare("UPDATE checkins SET payout_status='pending',error=NULL WHERE id=? AND payout_status='failed'").run(checkinId);
        if (Number(result.changes) === 0) throw new ApiError(409, 'retry_requires_failed');
      })();
      void runPayout(checkinId);
      return json({ ok: true });
    });
  });
}
