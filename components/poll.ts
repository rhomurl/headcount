'use client';
import { useEffect, useEffectEvent, useState } from 'react';
import { errorMessage, request } from '@/lib/api';

// Schedule only after the previous request finishes. Abort and ignore late responses on navigation.
export function usePoll<T>(url: string, delay: number, stop?: (value: T) => boolean) {
  const [snapshot, setSnapshot] = useState<{ data: T; updatedAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shouldStop = useEffectEvent((value: T) => Boolean(stop?.(value)));
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const poll = async () => {
      let finished = false;
      try { const value = await request<T>(url, { signal: controller.signal }); if (!active) return; setSnapshot({ data: value, updatedAt: Date.now() }); setError(null); finished = shouldStop(value); }
      catch (e) { if (active && !controller.signal.aborted) setError(errorMessage(e)); }
      if (active && !finished) timer = setTimeout(poll, delay);
    };
    void poll();
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [url, delay]);
  return { data: snapshot?.data ?? null, updatedAt: snapshot?.updatedAt ?? 0, error };
}
