// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ScannerCamera from '../components/scanner-camera';

const camera = vi.hoisted(() => ({ decode: null as ((text: string) => void) | null, stop: vi.fn(), clear: vi.fn() }));
vi.mock('html5-qrcode', () => ({ Html5Qrcode: class {
  start(_device: unknown, _config: unknown, onScan: (text: string) => void) { camera.decode = onScan; return Promise.resolve(); }
  stop() { camera.stop(); return Promise.resolve(); }
  clear() { camera.clear(); }
} }));
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); camera.decode = null; Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } }); });
afterEach(async () => { cleanup(); await act(async () => {}); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('serializes submissions while a check-in request is pending and stops the camera on unmount', async () => {
  let finish: ((response: Response) => void) | undefined;
  let submitted = 0;
  vi.stubGlobal('fetch', () => { submitted++; return new Promise<Response>(resolve => { finish = resolve; }); });
  const view = render(<ScannerCamera campaignId="campaign" pin="test-only" onInvalidPin={() => {}} />);
  await act(async () => {});
  await act(async () => { camera.decode?.('code-one'); camera.decode?.('code-two'); });
  expect(submitted).toBe(1);
  await act(async () => { finish?.(new Response(JSON.stringify({ guestName: 'Guest', checkinId: 'checkin' }))); });
  expect(screen.getByRole('heading', { name: 'Verified' })).toBeTruthy();
  view.unmount();
  await act(async () => {});
  expect(camera.stop).toHaveBeenCalledTimes(1);
});
it('shows a clear secure-context error without trying to start a camera', async () => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  render(<ScannerCamera campaignId="campaign" pin="test-only" onInvalidPin={() => {}} />);
  await act(async () => {});
  expect(screen.getByRole('alert').textContent).toContain('HTTPS');
  expect(camera.decode).toBeNull();
});
it('returns to the PIN gate on authentication failure', async () => {
  const invalid = vi.fn();
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'invalid_pin' }), { status: 401 }));
  render(<ScannerCamera campaignId="campaign" pin="test-only" onInvalidPin={invalid} />);
  await act(async () => {});
  await act(async () => { camera.decode?.('code'); });
  expect(invalid).toHaveBeenCalledTimes(1);
  expect(camera.stop).toHaveBeenCalledTimes(1);
});
