import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const STEP_MS = 30_000;
export function newTicketSecret(): string { return randomBytes(32).toString('hex'); }
export function makeCode(ticketId: string, secret: string, step = Math.floor(Date.now() / STEP_MS)): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(ticketId) || !/^[0-9a-f]{64}$/.test(secret) || !Number.isSafeInteger(step) || step < 0) throw new Error('invalid_ticket_code_input');
  const mac = createHmac('sha256', Buffer.from(secret, 'hex')).update(`${ticketId}.${step}`).digest('hex').slice(0, 16);
  return `HC1.${ticketId}.${step}.${mac}`;
}
type Verification = { ok: true; ticketId: string } | { ok: false; reason: 'malformed' | 'unknown' | 'expired' | 'bad_mac' };
export function verifyCode(code: string, lookupSecret: (ticketId: string) => string | null | undefined): Verification {
  if (typeof code !== 'string' || code.length > 180) return { ok: false, reason: 'malformed' };
  const match = /^HC1\.([A-Za-z0-9_-]{1,128})\.(0|[1-9][0-9]{0,15})\.([0-9a-f]{16})$/.exec(code);
  if (!match) return { ok: false, reason: 'malformed' };
  const [, ticketId, rawStep, mac] = match;
  const step = Number(rawStep);
  if (!Number.isSafeInteger(step)) return { ok: false, reason: 'malformed' };
  const secret = lookupSecret(ticketId);
  if (!secret || !/^[0-9a-f]{64}$/.test(secret)) return { ok: false, reason: 'unknown' };
  const current = Math.floor(Date.now() / STEP_MS);
  if (step !== current && step !== current - 1) return { ok: false, reason: 'expired' };
  const expected = makeCode(ticketId, secret, step).split('.')[3];
  return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex')) ? { ok: true, ticketId } : { ok: false, reason: 'bad_mac' };
}
