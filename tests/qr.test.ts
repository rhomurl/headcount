import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeCode, newTicketSecret, STEP_MS, verifyCode } from '../lib/qr';

afterEach(() => vi.useRealTimers());
describe('rotating ticket codes', () => {
  it('uses secret bytes, accepts only current and previous step, and authenticates the ticket', () => {
    vi.useFakeTimers(); vi.setSystemTime(300_000);
    const secret = '12'.repeat(32);
    const expected = createHmac('sha256', Buffer.from(secret, 'hex')).update('ticket.10').digest('hex').slice(0, 16);
    expect(makeCode('ticket', secret)).toBe(`HC1.ticket.10.${expected}`);
    const lookup = (id: string) => id === 'ticket' ? secret : undefined;
    expect(verifyCode(makeCode('ticket', secret, 10), lookup)).toEqual({ ok: true, ticketId: 'ticket' });
    expect(verifyCode(makeCode('ticket', secret, 9), lookup)).toEqual({ ok: true, ticketId: 'ticket' });
    expect(verifyCode(makeCode('ticket', secret, 8), lookup)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyCode(makeCode('ticket', secret, 11), lookup)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyCode('HC1.ticket.10.0000000000000000', lookup)).toEqual({ ok: false, reason: 'bad_mac' });
    expect(verifyCode('HC1.unknown.10.0000000000000000', lookup)).toEqual({ ok: false, reason: 'unknown' });
    expect(verifyCode('HC1.ticket.010.0000000000000000', lookup)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyCode('HC1.ticket.10.0', lookup)).toEqual({ ok: false, reason: 'malformed' });
    expect(STEP_MS).toBe(30_000);
  });
  it('generates independent 32 byte secrets', () => {
    const a = newTicketSecret(); const b = newTicketSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/); expect(b).not.toBe(a);
  });
});
