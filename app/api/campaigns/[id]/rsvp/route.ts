import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { newTicketSecret } from '@/lib/qr';
import { body, campaign, guard, handle, json, open, text, reconcileCampaign } from '@/lib/server-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const id = (await context.params).id; const input = await body(request);
    const name = text(input.name, 'name'); const contact = text(input.contact, 'contact');
    await reconcileCampaign(id);
    return guard(id, () => {
      open(campaign(id));
      const ticketId = db.transaction(() => {
        const existing = db.prepare('SELECT id FROM tickets WHERE campaign_id=? AND contact=?').get(id, contact) as { id: string } | undefined;
        if (existing) return existing.id;
        const ticketId = nanoid();
        db.prepare('INSERT INTO tickets (id,campaign_id,name,contact,secret,created_at) VALUES (?,?,?,?,?,?)').run(ticketId, id, name, contact, newTicketSecret(), Date.now());
        return ticketId;
      })();
      return json({ ticketId });
    });
  });
}
