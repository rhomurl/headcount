import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const chain = vi.hoisted(() => ({
  createCampaignOnchain: vi.fn(), fundCampaign: vi.fn(), closeCampaignOnchain: vi.fn(),
  payCheckin: vi.fn(), isPaid: vi.fn(), getCampaignBalance: vi.fn(), isCampaignClosed: vi.fn(),
  isValidAddress: (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s),
}));
vi.mock('../lib/chain', () => chain);
const folder = mkdtempSync(join(tmpdir(), 'headcount-api-'));
process.env.DB_PATH = join(folder, 'test.db');
const hash = `0x${'ab'.repeat(32)}`;
const wallet = `0x${'11'.repeat(20)}`;
type Route = (request: Request, context: { params: Promise<{ id: string; ticketId: string; checkinId: string }> }) => Promise<Response>;
let db: typeof import('../lib/db').db;
let code: typeof import('../lib/qr').makeCode;
let payout: typeof import('../lib/payout').runPayout;
const routes: Record<string, Route> = {};
async function call(route: string, id: string, body?: object) {
  return routes[route](new Request('http://localhost/api', body ? { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}), { params: Promise.resolve({ id, ticketId: id, checkinId: id }) });
}
function campaign(id = 'campaign', cap = 2, status = 'open', tx: string | null = hash) {
  db.prepare('INSERT INTO campaigns (id,name,sponsor_wallet,host_wallet,per_head,cap,host_pin,sponsor_pin,create_tx,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id, 'Test event', wallet, wallet, 1_000_000n, cap, '123456', '654321', tx, status, Date.now());
}
function ticket(id = 'ticket', campaignId = 'campaign') {
  db.prepare('INSERT INTO tickets VALUES (?,?,?,?,?,?)').run(id, campaignId, 'Test Guest', `${id}@example.invalid`, '12'.repeat(32), Date.now());
  return code(id, '12'.repeat(32));
}
function checkin(id = 'checkin', status = 'failed') {
  db.prepare('INSERT INTO checkins (id,campaign_id,ticket_id,scanned_at,payout_status) VALUES (?,?,?,?,?)').run(id, 'campaign', 'ticket', Date.now(), status);
}
beforeAll(async () => {
  db = (await import('../lib/db')).db; code = (await import('../lib/qr')).makeCode; payout = (await import('../lib/payout')).runPayout;
  routes.create = (await import('../app/api/campaigns/route')).POST;
  routes.get = (await import('../app/api/campaigns/[id]/route')).GET;
  routes.rsvp = (await import('../app/api/campaigns/[id]/rsvp/route')).POST;
  routes.scan = (await import('../app/api/campaigns/[id]/checkin/route')).POST;
  routes.close = (await import('../app/api/campaigns/[id]/close/route')).POST;
  routes.fund = (await import('../app/api/campaigns/[id]/fund/route')).POST;
  routes.stats = (await import('../app/api/campaigns/[id]/stats/route')).GET;
  routes.qr = (await import('../app/api/tickets/[ticketId]/qr/route')).GET;
  routes.retry = (await import('../app/api/checkins/[checkinId]/retry/route')).POST;
});
beforeEach(() => {
  vi.resetAllMocks();
  chain.createCampaignOnchain.mockResolvedValue(hash); chain.fundCampaign.mockResolvedValue(hash); chain.closeCampaignOnchain.mockResolvedValue(hash);
  chain.payCheckin.mockResolvedValue(hash); chain.isPaid.mockResolvedValue(false); chain.getCampaignBalance.mockResolvedValue(2_000_000n); chain.isCampaignClosed.mockResolvedValue(false);
  db.exec('DELETE FROM checkins; DELETE FROM tickets; DELETE FROM campaigns;');
});
afterAll(() => { db?.close(); rmSync(folder, { recursive: true, force: true }); });

describe('API against temporary real SQLite', () => {
  it('creates validated campaigns, funds exact base units and excludes secrets from public responses', async () => {
    const response = await call('create', '', { name: 'Demo', sponsorWallet: wallet, hostWallet: wallet, perHead: 1.25, cap: 2 });
    expect(response.status).toBe(200); const created = await response.json();
    expect(created.hostPin).toMatch(/^\d{6}$/); expect(created.sponsorPin).toMatch(/^\d{6}$/);
    expect(chain.createCampaignOnchain).toHaveBeenCalledWith(created.id, wallet, wallet, 1_250_000n, 2);
    expect((await call('fund', created.id, { sponsorPin: created.sponsorPin })).status).toBe(200);
    expect(chain.fundCampaign).toHaveBeenCalledWith(created.id, 2_500_000n);
    const pub = await (await call('get', created.id)).json();
    expect(pub).not.toHaveProperty('hostPin'); expect(pub).not.toHaveProperty('sponsorPin'); expect(pub.perHead).toBe(1.25);
    expect((await call('create', '', { name: 'Demo', sponsorWallet: wallet, hostWallet: wallet, perHead: 0.0000001, cap: 2 })).status).toBe(400);
  });
  it('rejects zero sponsor and host addresses before creating a chain campaign', async () => {
    const zero = `0x${'00'.repeat(20)}`;
    for (const field of ['sponsorWallet', 'hostWallet']) {
      const response = await call('create', '', { name: 'Demo', sponsorWallet: wallet, hostWallet: wallet, [field]: zero, perHead: 1, cap: 2 });
      expect(response.status).toBe(400);
    }
    expect(chain.createCampaignOnchain).not.toHaveBeenCalled();
    expect(db.prepare('SELECT count(*) AS n FROM campaigns').get()).toEqual({ n: 0n });
  });
  it('rejects RSVP before on-chain creation completes and sanitizes chain failure', async () => {
    let reject!: (error: Error) => void;
    chain.createCampaignOnchain.mockImplementation(() => new Promise((_, no) => { reject = no; }));
    const creating = call('create', '', { name: 'Demo', sponsorWallet: wallet, hostWallet: wallet, perHead: 1, cap: 2 });
    await vi.waitFor(() => expect(reject).toBeTypeOf('function'));
    const row = db.prepare('SELECT id FROM campaigns').get() as { id: string };
    expect((await call('rsvp', row.id, { name: 'Guest', contact: 'guest@example.invalid' })).status).toBe(409);
    reject(new Error('private key and RPC secret')); const response = await creating;
    expect(response.status).toBe(502); expect(await response.text()).not.toContain('private key');
    expect(db.prepare('SELECT count(*) AS n FROM campaigns').get()).toEqual({ n: 0n });
  });
  it('deduplicates RSVP, generates a code without secrets and rejects closed RSVP', async () => {
    campaign();
    const a = await (await call('rsvp', 'campaign', { name: 'Guest', contact: 'a@example.invalid' })).json();
    const b = await (await call('rsvp', 'campaign', { name: 'Other', contact: 'a@example.invalid' })).json();
    expect(a).toEqual(b);
    const qr = await (await call('qr', a.ticketId)).json();
    expect(qr.code).toMatch(/^HC1\./); expect(qr.checkedIn).toBe(false); expect(qr).not.toHaveProperty('secret');
    db.prepare("UPDATE campaigns SET status='closed'").run();
    expect((await call('rsvp', 'campaign', { name: 'Guest', contact: 'b@example.invalid' })).status).toBe(409);
  });
  it('returns the existing ticket for simultaneous duplicate RSVP requests', async () => {
    campaign();
    const responses = await Promise.all([call('rsvp', 'campaign', { name: 'Guest', contact: 'a@example.invalid' }), call('rsvp', 'campaign', { name: 'Guest', contact: 'a@example.invalid' })]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(await responses[0].json()).toEqual(await responses[1].json());
    expect(db.prepare('SELECT count(*) AS n FROM tickets').get()).toEqual({ n: 1n });
  });
  it('checks PIN before QR and membership before insertion; duplicate and capacity checks are atomic', async () => {
    campaign('campaign', 1); campaign('other'); const first = ticket(); const second = ticket('second'); const foreign = ticket('foreign', 'other');
    expect((await call('scan', 'campaign', { hostPin: 'bad', code: 'bad' })).status).toBe(401);
    expect((await call('scan', 'campaign', { hostPin: '123456', code: 'bad' })).status).toBe(400);
    expect((await call('scan', 'campaign', { hostPin: '123456', code: foreign })).status).toBe(403);
    const [a, b] = await Promise.all([call('scan', 'campaign', { hostPin: '123456', code: first }), call('scan', 'campaign', { hostPin: '123456', code: second })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const accepted = await a.json(); await payout(accepted.checkinId);
    const repeated = await call('scan', 'campaign', { hostPin: '123456', code: first });
    expect(await repeated.json()).toEqual({ error: 'already_checked_in' });
    expect(db.prepare('SELECT count(*) AS n FROM checkins').get()).toEqual({ n: 1n });
  });
  it('prevents scans and retry during an awaited close; failure remains fenced for sponsor recovery', async () => {
    campaign(); const qr = ticket();
    let reject!: (error: Error) => void;
    chain.closeCampaignOnchain.mockImplementation(() => new Promise((_, no) => { reject = no; }));
    const closing = call('close', 'campaign', { sponsorPin: '654321' });
    await vi.waitFor(() => expect(reject).toBeTypeOf('function'));
    expect((await call('scan', 'campaign', { hostPin: '123456', code: qr })).status).toBe(409);
    reject(new Error('RPC token secret'));
    expect((await closing).status).toBe(502);
    expect((await call('rsvp', 'campaign', { name: 'Guest', contact: 'b@example.invalid' })).status).toBe(409);
    chain.closeCampaignOnchain.mockResolvedValue(hash);
    expect((await call('close', 'campaign', { sponsorPin: '654321' })).status).toBe(200);
  });
  it('fences every unsettled accepted ticket and blocks retries in closing campaigns', async () => {
    campaign(); ticket(); checkin();
    const close = await call('close', 'campaign', { sponsorPin: '654321' });
    expect(close.status).toBe(409); expect(await close.json()).toEqual({ error: 'payouts_unsettled' });
    expect(chain.closeCampaignOnchain).not.toHaveBeenCalled();
    db.prepare("UPDATE campaigns SET status='closing'").run();
    expect((await call('retry', 'checkin', { hostPin: '123456' })).status).toBe(409);
  });
  it('blocks close while payout pending; reconciles uncertain success and reports safe public stats', async () => {
    campaign(); ticket(); checkin('checkin', 'pending');
    expect((await call('close', 'campaign', { sponsorPin: '654321' })).status).toBe(409);
    chain.payCheckin.mockRejectedValue(new Error('RPC secret')); chain.isPaid.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await payout('checkin');
    const row = db.prepare('SELECT payout_status,error FROM checkins').get();
    expect(row).toEqual({ payout_status: 'confirmed', error: null });
    chain.getCampaignBalance.mockRejectedValue(new Error('RPC secret'));
    const stats = await (await call('stats', 'campaign')).json();
    expect(stats.escrowUi).toBeNull(); expect(stats.paidUi).toBe(1); expect(stats.pendingCount).toBe(0);
    expect(stats.feed[0]).not.toHaveProperty('contact'); expect(JSON.stringify(stats)).not.toContain('RPC secret');
  });
  it('claims retry atomically and deduplicates concurrent payout jobs', async () => {
    campaign(); ticket(); checkin();
    let resolve!: (value: string) => void;
    chain.payCheckin.mockImplementation(() => new Promise(yes => { resolve = yes; }));
    const results = await Promise.all([call('retry', 'checkin', { hostPin: '123456' }), call('retry', 'checkin', { hostPin: '123456' })]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    const duplicate = payout('checkin'); resolve(hash); await duplicate;
    expect(chain.payCheckin).toHaveBeenCalledTimes(1);
    expect(db.prepare('SELECT payout_status FROM checkins').get()).toEqual({ payout_status: 'confirmed' });
  });
  it('recovers interrupted pending work on database reopen and checks paid before resending', async () => {
    campaign(); ticket(); checkin('checkin', 'pending'); db.close();
    expect(db.prepare('SELECT payout_status,error FROM checkins').get()).toEqual({ payout_status: 'failed', error: 'payout_interrupted' });
    expect((await call('close', 'campaign', { sponsorPin: '654321' })).status).toBe(409);
    chain.isPaid.mockResolvedValue(true);
    expect((await call('retry', 'checkin', { hostPin: '123456' })).status).toBe(200);
    await payout('checkin');
    expect(chain.payCheckin).not.toHaveBeenCalled();
    expect(db.prepare('SELECT payout_status FROM checkins').get()).toEqual({ payout_status: 'confirmed' });
    expect((await call('close', 'campaign', { sponsorPin: '654321' })).status).toBe(200);
  });
  it('observes sponsor-direct chain closure before accepting scans, RSVP or funding', async () => {
    campaign(); const qr = ticket(); chain.isCampaignClosed.mockResolvedValue(true);
    expect((await call('scan', 'campaign', { hostPin: '123456', code: qr })).status).toBe(409);
    expect((await call('rsvp', 'campaign', { name: 'Guest', contact: 'new@example.invalid' })).status).toBe(409);
    expect((await call('fund', 'campaign', { sponsorPin: '654321' })).status).toBe(409);
    expect(chain.payCheckin).not.toHaveBeenCalled(); expect(chain.fundCampaign).not.toHaveBeenCalled();
    expect(await (await call('stats', 'campaign')).json()).toMatchObject({ status: 'closed', closeTx: hash });
  });
  it('blocks acceptance on unknown chain state while preserving public stats', async () => {
    campaign(); const qr = ticket(); chain.isCampaignClosed.mockRejectedValue(new Error('sensitive RPC config'));
    expect((await call('scan', 'campaign', { hostPin: '123456', code: qr })).status).toBe(503);
    expect((await call('rsvp', 'campaign', { name: 'Guest', contact: 'new@example.invalid' })).status).toBe(503);
    expect((await call('fund', 'campaign', { sponsorPin: '654321' })).status).toBe(503);
    const stats = await call('stats', 'campaign'); expect(stats.status).toBe(200); expect(await stats.text()).not.toContain('sensitive');
  });
  it('exposes all failed accepted tickets beyond the latest twenty feed entries', async () => {
    campaign('campaign', 1000);
    for (let index = 0; index < 25; index++) {
      const ticketId = `ticket${index}`; ticket(ticketId);
      db.prepare('INSERT INTO checkins (id,campaign_id,ticket_id,scanned_at,payout_status) VALUES (?,?,?,?,?)').run(`checkin${index}`, 'campaign', ticketId, Date.now() + index, 'failed');
    }
    const stats = await (await call('stats', 'campaign')).json();
    expect(stats.feed).toHaveLength(20); expect(stats.failedFeed).toHaveLength(25);
    expect(stats.failedFeed.every((entry: { payoutStatus: string }) => entry.payoutStatus === 'failed')).toBe(true);
    expect(stats.failedFeed[0]).not.toHaveProperty('contact');
  });
});
