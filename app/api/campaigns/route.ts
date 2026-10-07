import { randomInt } from 'node:crypto';
import { nanoid } from 'nanoid';
import { createCampaignOnchain, isValidAddress } from '@/lib/chain';
import { db } from '@/lib/db';
import { toBase } from '@/lib/money';
import { ApiError, body, handle, json, text } from '@/lib/server-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const input = await body(request);
    const name = text(input.name, 'name');
    if (typeof input.sponsorWallet !== 'string' || !isValidAddress(input.sponsorWallet) || /^0x0{40}$/i.test(input.sponsorWallet)) throw new ApiError(400, 'invalid_sponsor_wallet');
    if (typeof input.hostWallet !== 'string' || !isValidAddress(input.hostWallet) || /^0x0{40}$/i.test(input.hostWallet)) throw new ApiError(400, 'invalid_host_wallet');
    if (typeof input.perHead !== 'number' || !Number.isFinite(input.perHead) || input.perHead <= 0 || input.perHead > 1000) throw new ApiError(400, 'invalid_per_head');
    if (typeof input.cap !== 'number' || !Number.isInteger(input.cap) || input.cap < 1 || input.cap > 1000) throw new ApiError(400, 'invalid_cap');
    let perHead: bigint;
    try { perHead = toBase(input.perHead); } catch { throw new ApiError(400, 'invalid_per_head'); }
    const id = nanoid();
    const hostPin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const sponsorPin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const sponsor = input.sponsorWallet.toLowerCase() as `0x${string}`;
    const host = input.hostWallet.toLowerCase() as `0x${string}`;
    db.prepare('INSERT INTO campaigns (id,name,sponsor_wallet,host_wallet,per_head,cap,host_pin,sponsor_pin,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id, name, sponsor, host, perHead, input.cap, hostPin, sponsorPin, Date.now());
    let createTx: string;
    try { createTx = await createCampaignOnchain(id, sponsor, host, perHead, input.cap); } catch {
      db.prepare('DELETE FROM campaigns WHERE id=? AND create_tx IS NULL').run(id);
      throw new ApiError(502, 'campaign_creation_failed');
    }
    db.prepare('UPDATE campaigns SET create_tx=? WHERE id=?').run(createTx, id);
    return json({ id, hostPin, sponsorPin, createTx });
  });
}
