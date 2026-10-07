import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request } from '../lib/api';

afterEach(() => vi.unstubAllGlobals());
describe('browser API boundary', () => {
  it('keeps the status and API error for rejected check-ins', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'expired' }), { status: 400 }));
    await expect(request('/api/checkin')).rejects.toMatchObject({ status: 400, message: 'expired' });
  });
  it('does not surface proxy HTML or internals in a non-JSON failure', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>private upstream details</html>', { status: 502 }));
    const error = await request('/api/checkin').catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) throw new Error('Expected an API error');
    expect(error.message).toBe('The server could not complete this request. Please try again.');
    expect(error.status).toBe(502);
  });
  it('rejects successful responses that are not JSON', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>proxy</html>', { status: 200 }));
    await expect(request('/api/checkin')).rejects.toThrow('The server returned an unreadable response.');
  });
});
