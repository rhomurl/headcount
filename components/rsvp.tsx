'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { campaignPath, errorMessage, post, type Campaign } from '@/lib/api';
import { ErrorNotice, Loading, Shell } from './shell';
import { usePoll } from './poll';
export default function Rsvp({ id }: { id: string }) {
  const router = useRouter();
  const { data: campaign, error: loadError } = usePoll<Campaign>(campaignPath(id), 5000);
  const [ticket, setTicket] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.abort(); }; }, []);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { try { const saved = localStorage.getItem(`hc_ticket_${id}`); if (active && saved && /^[A-Za-z0-9_-]+$/.test(saved)) setTicket(saved); } catch { /* storage is optional */ } }); return () => { active = false; }; }, [id]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return; submitting.current = true; pending.current = new AbortController(); setBusy(true); setError(null);
    const fields = new FormData(event.currentTarget);
    try { const result = await post<{ ticketId: string }>(`${campaignPath(id)}/rsvp`, { name: fields.get('name'), contact: fields.get('contact') }, pending.current.signal); if (!mounted.current) return; try { localStorage.setItem(`hc_ticket_${id}`, result.ticketId); } catch { /* ticket navigation still works */ } router.push(`/t/${encodeURIComponent(result.ticketId)}`); }
    catch (e) { if (mounted.current) setError(errorMessage(e)); } finally { submitting.current = false; if (mounted.current) setBusy(false); }
  }
  return <Shell><p className="eyebrow mb-4">You’re invited</p>{!campaign ? <><Loading text="Finding your event…" /><div className="mt-4"><ErrorNotice message={loadError} /></div></> : <><h1 className="text-4xl font-semibold leading-tight tracking-[-.04em]">{campaign.name}</h1><p className="mt-4 text-[#8da695]">Sponsored check-in. Free. No wallet needed.</p><div className="card mt-8 p-6"><div className="mb-6 flex items-center gap-3"><span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15 text-xl text-green-400">↗</span><div><h2 className="font-semibold">Your place starts here</h2><p className="mt-1 text-xs text-[#8da695]">A live QR ticket for the door.</p></div></div>{ticket ? <div><p className="mb-4 text-sm">You already have a ticket.</p><Link className="primary w-full" href={`/t/${encodeURIComponent(ticket)}`}>Open my ticket →</Link></div> : campaign.status !== 'open' ? <p role="status" className="text-sm text-amber-200">This campaign is {campaign.status}. New RSVPs are unavailable.</p> : <form onSubmit={submit} className="space-y-5"><label>Your name<input name="name" autoComplete="name" required maxLength={80} placeholder="What should we call you?" /></label><label>Email or @Telegram<input name="contact" autoComplete="email" required maxLength={80} placeholder="you@example.com or @yourname" /></label><button disabled={busy} className="primary w-full">{busy ? 'Creating your ticket…' : 'Get my free ticket →'}</button><p className="text-center text-xs leading-5 text-[#708377]">Save your ticket link. Your contact identifies your RSVP for this event.</p></form>}<div className="mt-4"><ErrorNotice message={error || loadError} /></div></div><p className="mt-6 text-center text-xs text-[#708377]">Bring your live ticket to the door. No app download.</p></>}</Shell>;
}
