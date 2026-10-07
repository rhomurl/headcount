// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Ticket from '../components/ticket';

vi.mock('qrcode.react', () => ({ QRCodeSVG: ({ value }: { value: string }) => <span data-testid="qr">{value}</span> }));
let calls = 0;
beforeEach(() => { vi.useFakeTimers(); calls = 0; });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('stops fetching and removes the QR once the guest checks in', async () => {
  vi.stubGlobal('fetch', async () => { calls++; return new Response(JSON.stringify({ code: 'live', expiresInMs: 12000, checkedIn: calls > 1, campaignName: 'Launch', guestName: 'Guest' }), { status: 200 }); });
  render(<Ticket ticketId="ticket" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(screen.getByTestId('qr').textContent).toBe('live');
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(screen.getByRole('heading', { name: 'Checked in' })).toBeTruthy();
  expect(screen.queryByTestId('qr')).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(calls).toBe(2);
});
it('hides an expired code during a network outage', async () => {
  vi.stubGlobal('fetch', async () => { calls++; if (calls > 1) throw new TypeError('offline'); return new Response(JSON.stringify({ code: 'old', expiresInMs: 1000, checkedIn: false, campaignName: 'Launch', guestName: 'Guest' })); });
  render(<Ticket ticketId="ticket" />);
  await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(screen.queryByTestId('qr')).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('connection');
});
it('aborts in-flight ticket requests when leaving the page', async () => {
  let signal: AbortSignal | undefined;
  vi.stubGlobal('fetch', (_url: string, options: RequestInit) => { signal = options.signal as AbortSignal; return new Promise(() => {}); });
  const view = render(<Ticket ticketId="ticket" />);
  await act(async () => {});
  expect(signal?.aborted).toBe(false);
  view.unmount();
  expect(signal?.aborted).toBe(true);
});
