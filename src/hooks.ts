import { useEffect, useMemo, useState } from 'react';
import { counterAt, secondsRemaining, totp } from './lib/totp';
import type { Account } from './lib/types';

/**
 * Current time (corrected by a clock offset), re-rendering on every whole second.
 * Codes only change on period boundaries, so a 1 Hz tick is all the UI needs; the rings and the
 * rail animate continuously in CSS.
 */
export function useNow(offsetMs: number): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now() + offsetMs;
      setNow(t);
      timer = setTimeout(tick, 1000 - (t % 1000) + 5);
    };
    tick();
    return () => clearTimeout(timer);
  }, [offsetMs]);
  return now;
}

export interface CodeState {
  current: string;
  next: string;
  counter: number;
  remaining: number;
}

/** Current and next codes for every account, recomputed only when an account's period rolls over. */
export function useCodes(accounts: Account[], now: number): Map<string, CodeState> {
  const [codes, setCodes] = useState<Map<string, { current: string; next: string; counter: number }>>(new Map());

  // A key that changes only when some account enters a new period.
  const epoch = accounts.map((a) => `${a.id}:${counterAt(now, a.period)}`).join('|');

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      accounts.map(async (a) => {
        const counter = counterAt(now, a.period);
        const [current, next] = await Promise.all([totp(a, now), totp(a, now + a.period * 1000)]);
        return [a.id, { current, next, counter }] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setCodes(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
    // `now` is intentionally read through `epoch` so codes recompute once per period.
  }, [epoch]);

  return useMemo(() => {
    const out = new Map<string, CodeState>();
    for (const a of accounts) {
      const c = codes.get(a.id);
      if (!c) continue;
      out.set(a.id, { ...c, remaining: secondsRemaining(now, a.period) });
    }
    return out;
  }, [accounts, codes, now]);
}

/** Calls onIdle after `minutes` without pointer or keyboard activity, including while hidden. */
export function useIdleLock(minutes: number, onIdle: () => void): void {
  useEffect(() => {
    if (!minutes) return;
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const check = () => {
      if (Date.now() - last >= minutes * 60_000) onIdle();
    };
    const interval = setInterval(check, 5000);
    document.addEventListener('visibilitychange', check);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
    };
  }, [minutes, onIdle]);
}
