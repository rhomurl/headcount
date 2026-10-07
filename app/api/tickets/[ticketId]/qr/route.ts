import { db, type TicketRow } from '@/lib/db';
import { makeCode, STEP_MS } from '@/lib/qr';
import { ApiError, campaign, handle, json } from '@/lib/server-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ ticketId: string }> }): Promise<Response> {
  return handle(async () => {
    const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get((await context.params).ticketId) as TicketRow | undefined;
    if (!ticket) throw new ApiError(404, 'ticket_not_found');
    const now = Date.now();
    return json({ code: makeCode(ticket.id, ticket.secret, Math.floor(now / STEP_MS)), expiresInMs: STEP_MS - now % STEP_MS, checkedIn: !!db.prepare('SELECT id FROM checkins WHERE ticket_id=?').get(ticket.id), campaignName: campaign(ticket.campaign_id).name, guestName: ticket.name });
  });
}
