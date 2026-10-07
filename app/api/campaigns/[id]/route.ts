import { toUi } from '@/lib/money';
import { handle, json, reconcileCampaign } from '@/lib/server-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const row = await reconcileCampaign((await context.params).id, false);
    return json({ id: row.id, name: row.name, perHead: toUi(row.per_head), cap: Number(row.cap), status: row.status, hostWallet: row.host_wallet, sponsorWallet: row.sponsor_wallet, createTx: row.create_tx });
  });
}
