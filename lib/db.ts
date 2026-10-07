import 'server-only';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Connection = Database.Database;
const state = globalThis as typeof globalThis & { headcountDb?: { path: string; connection: Connection } };

export function getDb(): Connection {
  // Runtime attendee storage is external to the build and must never be traced
  // into a deployment bundle alongside other workspace files.
  const path = process.env.DB_PATH === ':memory:' ? ':memory:' : resolve(/* turbopackIgnore: true */ process.env.DB_PATH ?? './data/headcount.db');
  if (state.headcountDb?.path === path && state.headcountDb.connection.open) return state.headcountDb.connection;
  if (state.headcountDb?.connection.open) state.headcountDb.connection.close();
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const connection = new Database(path);
  connection.defaultSafeIntegers(true);
  connection.pragma('journal_mode = WAL');
  connection.pragma('foreign_keys = ON');
  connection.pragma('busy_timeout = 5000');
  connection.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sponsor_wallet TEXT NOT NULL,
      host_wallet TEXT NOT NULL, per_head INTEGER NOT NULL, cap INTEGER NOT NULL,
      host_pin TEXT NOT NULL, sponsor_pin TEXT NOT NULL, create_tx TEXT,
      status TEXT NOT NULL DEFAULT 'open', close_tx TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      name TEXT NOT NULL, contact TEXT NOT NULL, secret TEXT NOT NULL,
      created_at INTEGER NOT NULL, UNIQUE(campaign_id, contact)
    );
    CREATE TABLE IF NOT EXISTS checkins (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id), scanned_at INTEGER NOT NULL,
      payout_status TEXT NOT NULL DEFAULT 'pending', payout_tx TEXT, error TEXT
    );
    CREATE INDEX IF NOT EXISTS checkins_campaign_time ON checkins(campaign_id, scanned_at DESC);
    CREATE INDEX IF NOT EXISTS checkins_campaign_status ON checkins(campaign_id, payout_status);
    UPDATE checkins SET payout_status='failed', error='payout_interrupted' WHERE payout_status='pending';
  `);
  state.headcountDb = { path, connection };
  return connection;
}

// Lazy access avoids creating attendee storage during import/build. Methods remain
// bound to their actual SQLite connection, including after dev hot reload.
export const db = new Proxy({} as Connection, {
  get(_target, property) {
    const connection = getDb();
    const value = Reflect.get(connection, property, connection);
    return typeof value === 'function' ? value.bind(connection) : value;
  },
});

export interface CampaignRow {
  id: string; name: string; sponsor_wallet: string; host_wallet: string;
  per_head: bigint; cap: bigint; host_pin: string; sponsor_pin: string;
  create_tx: string | null; status: 'open' | 'closing' | 'closed'; close_tx: string | null; created_at: bigint;
}
export interface TicketRow { id: string; campaign_id: string; name: string; contact: string; secret: string; created_at: bigint }
export interface CheckinRow {
  id: string; campaign_id: string; ticket_id: string; scanned_at: bigint;
  payout_status: 'pending' | 'failed' | 'confirmed'; payout_tx: string | null; error: string | null;
}
