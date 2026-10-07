'use client';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { TicketQr } from '@/lib/api';
import { ErrorNotice, Loading, Shell } from './shell';
import { usePoll } from './poll';
export default function Ticket({ ticketId }: { ticketId: string }) {
  const { data, updatedAt, error } = usePoll<TicketQr>(`/api/tickets/${encodeURIComponent(ticketId)}/qr`, 3000, value => value.checkedIn);
  const [clock, setClock] = useState(() => Date.now());
  const remaining = data ? Math.max(0, Math.min(data.expiresInMs, updatedAt + data.expiresInMs - clock)) : 0;
  useEffect(() => {
    if (!data || data.checkedIn) return;
    const timer = setInterval(() => setClock(Date.now()), 100);
    return () => clearInterval(timer);
  }, [data]);
  if (data?.checkedIn) return <Shell><div className="rounded-3xl bg-green-500 px-6 py-16 text-center text-green-950"><span aria-hidden className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-green-950 text-5xl">✓</span><p className="mt-8 text-xs font-bold uppercase tracking-widest">Welcome, {data.guestName}</p><h1 className="mt-3 text-4xl font-bold tracking-tight">Checked in</h1><p className="mt-4 text-sm">You’re all set. Enjoy {data.campaignName}.</p></div><p className="mt-6 text-center text-xs text-[#8da695]">Your accepted check-in is recorded. Payout confirmation appears on the campaign dashboard.</p></Shell>;
  return <Shell><p className="eyebrow mb-4 text-center">Your door pass</p><h1 className="text-center text-3xl font-semibold tracking-tight">{data?.campaignName || 'Your live ticket'}</h1>{!data ? <div className="mt-8"><Loading text="Preparing your ticket…" /></div> : <div className="card mt-8 p-6 text-center"><div className="mb-5 flex items-center justify-between text-xs"><span className="rounded-full bg-green-500/10 px-3 py-1.5 font-semibold text-green-400">LIVE TICKET</span><span className="text-[#8da695]">{Math.ceil(remaining / 1000)}s to refresh</span></div><div className="mx-auto flex aspect-square w-full max-w-[320px] items-center justify-center rounded-2xl bg-white p-5">{remaining > 0 ? <QRCodeSVG value={data.code} size={280} level="M" title="Live check-in code" style={{ width: '100%', height: 'auto' }} /> : <p role="status" className="text-sm text-gray-600">Refreshing live code…</p>}</div><div role="progressbar" aria-label="Time until code refresh" aria-valuemin={0} aria-valuemax={30} aria-valuenow={Math.ceil(remaining / 1000)} className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#26382c]"><div className="h-full rounded-full bg-green-500 transition-[width] duration-100" style={{ width: `${Math.min(100, remaining / 30000 * 100)}%` }} /></div><h2 className="mt-7 text-xl font-semibold">{data.guestName}</h2><p className="mt-2 text-sm text-[#8da695]">Show this screen to the host at the door.</p><p className="mt-6 border-t border-[#27392e] pt-5 text-xs leading-5 text-[#708377]">Codes refresh every 30 seconds. Old screenshots expire within 60 seconds. Keep your live ticket open.</p></div>}<div className="mt-4"><ErrorNotice message={error} /></div></Shell>;
}
