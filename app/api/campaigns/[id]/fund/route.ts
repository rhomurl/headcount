import { fundCampaign } from '@/lib/chain';
import { toUi } from '@/lib/money';
import { ApiError, body, campaign, guard, handle, json, open, pin, reconcileCampaign } from '@/lib/server-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const id = (await context.params).id; const input = await body(request);
    pin(input.sponsorPin, campaign(id).sponsor_pin);
    await reconcileCampaign(id);
    return guard(id, async () => {
      const row = campaign(id); open(row);
      const amount = row.per_head * row.cap;
      let tx: string;
      try { tx = await fundCampaign(id, amount); } catch { throw new ApiError(502, 'funding_failed'); }
      return json({ tx, amount: toUi(amount) });
    });
  });
}
