import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { db, type CampaignRow } from './db';
import { closeCampaignOnchain, isCampaignClosed } from './chain';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function handle(action: () => Promise<Response>): Promise<Response> {
  try { return await action(); } catch (error) {
    return error instanceof ApiError ? json({ error: error.message }, error.status) : json({ error: 'internal_error' }, 500);
  }
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try { value = await request.json(); } catch { throw new ApiError(400, 'invalid_json'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'invalid_body');
  return value as Record<string, unknown>;
}
export function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) throw new ApiError(400, `invalid_${field}`);
  return value.trim();
}
export function campaign(id: string): CampaignRow {
  const row = db.prepare('SELECT * FROM campaigns WHERE id=?').get(id) as CampaignRow | undefined;
  if (!row) throw new ApiError(404, 'campaign_not_found');
  return row;
}
export function ready(row: CampaignRow): void {
  if (!row.create_tx) throw new ApiError(409, 'campaign_creating');
}
export function open(row: CampaignRow): void {
  ready(row);
  if (row.status !== 'open') throw new ApiError(409, row.status === 'closing' ? 'closing' : 'closed');
}
export async function reconcileCampaign(id: string, strict = true): Promise<CampaignRow> {
  const initial = campaign(id);
  if (!initial.create_tx || initial.status === 'closed') return initial;
  let closed: boolean;
  try { closed = await isCampaignClosed(id); } catch {
    if (strict) throw new ApiError(503, 'campaign_state_unavailable');
    return campaign(id);
  }
  if (closed) {
    // Observing external closure fences acceptance immediately, even if receipt
    // recovery is temporarily unavailable. Chain close is idempotent here.
    db.prepare("UPDATE campaigns SET status='closing' WHERE id=? AND status!='closed'").run(id);
    try {
      const tx = await closeCampaignOnchain(id);
      db.prepare("UPDATE campaigns SET status='closed',close_tx=? WHERE id=?").run(tx, id);
    } catch { /* Keep closing until an explorer receipt can be reconciled. */ }
  }
  return campaign(id);
}
export function pin(value: unknown, expected: string): void {
  if (typeof value !== 'string' || !/^\d{6}$/.test(value) || !timingSafeEqual(Buffer.from(value), Buffer.from(expected))) throw new ApiError(401, 'bad_pin');
}
const globals = globalThis as typeof globalThis & { headcountCampaignGuards?: Set<string> };
const guards = globals.headcountCampaignGuards ??= new Set<string>();
export function guard<T>(id: string, action: () => T | Promise<T>): T | Promise<T> {
  if (guards.has(id)) throw new ApiError(409, 'campaign_busy');
  guards.add(id);
  try {
    const result = action();
    if (result instanceof Promise) return result.finally(() => { guards.delete(id); });
    guards.delete(id);
    return result;
  } catch (error) { guards.delete(id); throw error; }
}
