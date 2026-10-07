// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Dashboard from '../components/dashboard';

vi.mock('qrcode.react', () => ({ QRCodeSVG: () => <span>RSVP QR</span> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('keeps a failed payout retryable after twenty newer check-ins hide it from the recent feed', async () => {
  const recent = Array.from({ length: 20 }, (_, index) => ({ checkinId: `new-${index}`, name: `New guest ${index}`, scannedAt: Date.now(), payoutStatus: 'confirmed', payoutTx: null }));
  const oldFailure = { checkinId: 'old-failed', name: 'Earlier guest awaiting payout', scannedAt: Date.now() - 60000, payoutStatus: 'failed', payoutTx: null };
  vi.stubGlobal('fetch', async (url: string) => new Response(JSON.stringify(url.endsWith('/stats')
    ? { verified: 21, cap: 100, paidUi: 100, escrowUi: 400, pendingCount: 0, failedCount: 1, status: 'open', closeTx: null, feed: recent, failedFeed: [oldFailure] }
    : { id: 'campaign', name: 'Meetup', perHead: 5, cap: 100, status: 'open', hostWallet: '', sponsorWallet: '', createTx: null })));
  render(<Dashboard id="campaign" />);
  const unresolved = await screen.findByRole('region', { name: 'Unresolved payouts' });
  expect(within(unresolved).getByText(oldFailure.name)).toBeTruthy();
  const retry = within(unresolved).getByRole('button', { name: 'Retry' });
  expect((retry as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(retry);
  expect(screen.getByRole('dialog', { name: 'Retry failed payout' })).toBeTruthy();
  expect(screen.getByLabelText('Host PIN')).toBeTruthy();
});
