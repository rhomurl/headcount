'use client';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ApiError, campaignPath, errorMessage, post } from '@/lib/api';
import { ErrorNotice } from './shell';

type Result = { kind: 'success' | 'warning' | 'error'; title: string; detail?: string };
export default function ScannerCamera({ campaignId, pin, onInvalidPin }: { campaignId: string; pin: string; onInvalidPin: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [count, setCount] = useState(0);
  const [starting, setStarting] = useState(true);
  const lifecycle = useRef<Promise<void>>(Promise.resolve());
  const invalidPin = useEffectEvent(onInvalidPin);
  useEffect(() => {
    let disposed = false;
    let locked = false;
    let lastCode = '';
    let lastAt = 0;
    let scanner: import('html5-qrcode').Html5Qrcode | undefined;
    let started = false;
    let overlayTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const stop = async () => { if (scanner && started) { started = false; try { await scanner.stop(); } catch { /* camera may already be stopped */ } } if (scanner) { try { scanner.clear(); } catch { /* stopped navigation */ } } };
    const decode = async (code: string) => {
      if (disposed || locked || (code === lastCode && Date.now() - lastAt < 3000)) return;
      locked = true; lastCode = code; lastAt = Date.now();
      try { const checked = await post<{ guestName: string; checkinId: string }>(`${campaignPath(campaignId)}/checkin`, { code, hostPin: pin }, controller.signal); if (disposed) return; setResult({ kind: 'success', title: 'Verified', detail: checked.guestName }); setCount(current => current + 1); }
      catch (e) {
        if (disposed) return;
        if (e instanceof ApiError && e.status === 401) { await stop(); if (!disposed) invalidPin(); return; }
        if (e instanceof ApiError && e.message === 'already_checked_in') setResult({ kind: 'warning', title: 'Already checked in', detail: 'This ticket has already been accepted.' });
        else if (e instanceof ApiError && e.message === 'expired') setResult({ kind: 'error', title: 'Expired code', detail: 'Ask the guest to show their live ticket.' });
        else setResult({ kind: 'error', title: 'Check-in rejected', detail: errorMessage(e) });
      }
      if (!disposed) overlayTimer = setTimeout(() => { locked = false; setResult(null); }, 1500);
    };
    const start = async () => {
      if (disposed) return;
      if (!navigator.mediaDevices?.getUserMedia) { setError('Camera access needs HTTPS (or localhost) and a supported browser. Open this page using a secure URL.'); setStarting(false); return; }
      try { const { Html5Qrcode } = await import('html5-qrcode'); if (disposed) return; scanner = new Html5Qrcode('headcount-camera', { verbose: false }); await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }, code => { void decode(code); }, () => {}); started = true; if (disposed) await stop(); else setStarting(false); }
      catch { if (!disposed) { setError('Camera could not start. Allow camera access in your browser, close other camera apps, then reopen the scanner.'); setStarting(false); } }
    };
    lifecycle.current = lifecycle.current.then(start);
    return () => { disposed = true; controller.abort(); clearTimeout(overlayTimer); lifecycle.current = lifecycle.current.then(stop); };
  }, [campaignId, pin]);
  return <><div className="card relative min-h-[320px] overflow-hidden p-3"><div id="headcount-camera" className="min-h-[296px]" />{starting && <div role="status" className="absolute inset-0 flex items-center justify-center bg-[#111b15] text-sm text-[#8da695]">Starting your camera…</div>}{result && <div role="status" className={`fixed inset-0 z-40 flex flex-col items-center justify-center p-6 text-center ${result.kind === 'success' ? 'bg-green-500 text-green-950' : result.kind === 'warning' ? 'bg-amber-400 text-amber-950' : 'bg-red-500 text-white'}`}><span aria-hidden className="text-6xl">{result.kind === 'success' ? '✓' : '!'}</span><h2 className="mt-5 text-3xl font-bold">{result.title}</h2><p className="mt-3 text-lg">{result.detail}</p></div>}</div><div className="mt-5"><ErrorNotice message={error} /></div><div className="mt-6 flex justify-between rounded-xl border border-[#2a3d30] bg-[#111b15] p-5"><span className="text-sm text-[#8da695]">Verified this session</span><span className="amount text-2xl font-semibold text-green-400">{count}</span></div><p className="mt-5 text-center text-xs leading-5 text-[#708377]">Hold the guest’s live QR code in view. Accepted check-ins are submitted for payout; the dashboard tracks confirmation.</p></>;
}
