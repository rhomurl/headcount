import 'server-only';
import { db, type CheckinRow } from './db';
import { isPaid, payCheckin } from './chain';

const globalJobs = globalThis as typeof globalThis & { headcountPayoutJobs?: Map<string, Promise<void>> };
const jobs = globalJobs.headcountPayoutJobs ??= new Map<string, Promise<void>>();

async function perform(checkinId: string): Promise<void> {
  const row = db.prepare('SELECT * FROM checkins WHERE id=?').get(checkinId) as CheckinRow | undefined;
  if (!row || row.payout_status !== 'pending') return;
  const confirmed = (tx: string | null = null) => db.prepare("UPDATE checkins SET payout_status='confirmed',payout_tx=COALESCE(?,payout_tx),error=NULL WHERE id=? AND payout_status='pending'").run(tx, checkinId);
  const failed = (reason: string) => db.prepare("UPDATE checkins SET payout_status='failed',error=? WHERE id=? AND payout_status='pending'").run(reason, checkinId);
  // Retry and restart recovery must first reconcile a previous ambiguous write.
  try {
    if (await isPaid(row.campaign_id, row.ticket_id)) { confirmed(); return; }
  } catch { failed('payout_reconciliation_failed'); return; }
  try { confirmed(await payCheckin(row.campaign_id, row.ticket_id)); } catch {
    try {
      if (await isPaid(row.campaign_id, row.ticket_id)) confirmed(); else failed('payout_failed');
    } catch { failed('payout_reconciliation_failed'); }
  }
}

export function runPayout(checkinId: string): Promise<void> {
  const existing = jobs.get(checkinId);
  if (existing) return existing;
  // Defer one microtask so the promise is registered before any job can run.
  const job = Promise.resolve().then(() => perform(checkinId)).catch(() => {
    try { db.prepare("UPDATE checkins SET payout_status='failed',error='payout_internal_error' WHERE id=? AND payout_status='pending'").run(checkinId); } catch { /* Storage failure requires operator recovery; no raw errors are exposed. */ }
  }).finally(() => { jobs.delete(checkinId); });
  jobs.set(checkinId, job);
  return job;
}
