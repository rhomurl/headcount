import { nanoid } from 'nanoid';
import { db, type TicketRow } from '@/lib/db';
import { runPayout } from '@/lib/payout';
import { verifyCode } from '@/lib/qr';
import { ApiError, body, campaign, guard, handle, json, open, pin, reconcileCampaign } from '@/lib/server-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const id = (await context.params).id; const input = await body(request);
    pin(input.hostPin, campaign(id).host_pin);
    const verification = verifyCode(typeof input.code === 'string' ? input.code : '', ticketId => (db.prepare('SELECT secret FROM tickets WHERE id=?').get(ticketId) as { secret: string } | undefined)?.secret);
    if (!verification.ok) throw new ApiError(400, verification.reason);
    const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(verification.ticketId) as TicketRow;
    if (ticket.campaign_id !== id) throw new ApiError(403, 'wrong_campaign');
    await reconcileCampaign(id);
    return guard(id, () => {
      const checkinId = db.transaction(() => {
        const row = campaign(id); open(row);
        if (db.prepare('SELECT id FROM checkins WHERE ticket_id=?').get(ticket.id)) throw new ApiError(409, 'already_checked_in');
        const { count } = db.prepare('SELECT count(*) AS count FROM checkins WHERE campaign_id=?').get(id) as { count: bigint };
        if (count >= row.cap) throw new ApiError(409, 'cap_reached');
        const checkinId = nanoid();
        db.prepare('INSERT INTO checkins (id,campaign_id,ticket_id,scanned_at) VALUES (?,?,?,?)').run(checkinId, id, ticket.id, Date.now());
        return checkinId;
      })();
      void runPayout(checkinId);
      return json({ guestName: ticket.name, checkinId });
    });
  });
}
