export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'ApiError'; }
}
export type CampaignStatus = 'open' | 'closing' | 'closed';
export type Campaign = { id: string; name: string; perHead: number; cap: number; status: CampaignStatus; hostWallet: string; sponsorWallet: string; createTx: string | null };
export type CreateResult = { id: string; hostPin: string; sponsorPin: string; createTx: string };
export type TicketQr = { code: string; expiresInMs: number; checkedIn: boolean; campaignName: string; guestName: string };
export type FeedItem = { checkinId: string; name: string; scannedAt: number; payoutStatus: 'pending' | 'confirmed' | 'failed'; payoutTx: string | null };
export type Stats = { verified: number; cap: number; paidUi: number; escrowUi: number | null; pendingCount: number; failedCount: number; status: CampaignStatus; closeTx: string | null; feed: FeedItem[]; failedFeed: FeedItem[] };
export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...options.headers } });
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new ApiError(response.ok ? 'The server returned an unreadable response.' : 'The server could not complete this request. Please try again.', response.status); }
  if (!response.ok) { const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error : 'The request failed. Please try again.'; throw new ApiError(message, response.status); }
  return payload as T;
}
export function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> { return request<T>(url, { method: 'POST', body: JSON.stringify(body), signal }); }
export function errorMessage(error: unknown): string { return error instanceof ApiError ? error.message.replaceAll('_', ' ') : 'Check your connection and try again.'; }
export function campaignPath(id: string): string { return `/api/campaigns/${encodeURIComponent(id)}`; }
