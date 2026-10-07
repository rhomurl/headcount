'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ErrorNotice, Shell } from './shell';
const Camera = dynamic(() => import('./scanner-camera'), { ssr: false, loading: () => <p role="status" className="card p-6">Loading scanner…</p> });
export default function Scanner({ id }: { id: string }) {
  const [pin, setPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  function unlock(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const value = String(new FormData(event.currentTarget).get('pin') || ''); if (/^\d{6}$/.test(value)) { setPin(value); setError(null); } }
  return <Shell><div className="mb-7 flex items-center justify-between"><div><p className="eyebrow mb-3">At the door</p><h1 className="text-3xl font-semibold tracking-tight">Host scanner</h1></div><Link href={`/c/${id}/dashboard`} className="text-xs text-green-400">Dashboard ↗</Link></div>{pin ? <><Camera campaignId={id} pin={pin} onInvalidPin={() => { setPin(null); setError('That host PIN was not accepted. Please try again.'); }} /><button onClick={() => setPin(null)} className="secondary mt-5 w-full">Lock scanner</button></> : <div className="card p-6"><h2 className="text-xl font-semibold">Ready to welcome guests?</h2><p className="mt-3 text-sm leading-6 text-[#8da695]">Enter the campaign’s host PIN to open the camera. The PIN is checked when you scan a ticket.</p><form onSubmit={unlock} className="mt-6 space-y-5"><label>Host PIN<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="off" placeholder="6-digit host PIN" /></label><button className="primary w-full">Open camera →</button></form><div className="mt-4"><ErrorNotice message={error} /></div><p className="mt-5 text-xs text-[#708377]">Camera access requires HTTPS. Your PIN stays in memory for this session.</p></div>}</Shell>;
}
