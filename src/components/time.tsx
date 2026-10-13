import { memo, useMemo } from 'react';
import { groupCode } from '../lib/totp';

/** A code whose digits roll like an odometer whenever the value changes. */
export const Odometer = memo(function Odometer({ value, className = 'code' }: { value: string; className?: string }) {
  const groups = groupCode(value).split(' ');
  let index = 0;
  return (
    <span className={`${className} odo`} role="text" aria-label={groupCode(value)}>
      {groups.map((group, g) => (
        <span className="odo-group" key={g} aria-hidden="true">
          {[...group].map((char) => {
            const i = index++;
            const digit = Number(char);
            return (
              <span className="odo-digit" key={i}>
                <span
                  className="odo-strip"
                  style={{ transform: `translateY(${-digit * 1.2}em)`, transitionDelay: `${i * 22}ms` }}
                >
                  {DIGITS}
                </span>
              </span>
            );
          })}
        </span>
      ))}
    </span>
  );
});

const DIGITS = Array.from({ length: 10 }, (_, d) => <span key={d}>{d}</span>);

interface CycleProps {
  period: number;
  /** Seconds left, used to start the CSS animation at the right point. */
  remaining: number;
  /** Changes every period so the animation restarts. */
  counter: number;
  ending: boolean;
}

/**
 * Elapsed seconds captured once per cycle. Changing animation-delay on a running animation would
 * shift its progress, so the delay is only set when a new cycle (and a new element) starts.
 */
function useStartOffset(period: number, remaining: number, counter: number): number {
  return useMemo(() => period - remaining, [counter, period]);
}

/** Small countdown ring for a single account. Driven by CSS, so it costs nothing per frame. */
export function Ring({ period, remaining, counter, ending }: CycleProps) {
  const elapsed = useStartOffset(period, remaining, counter);
  return (
    <svg className={`ring${ending ? ' ending' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle className="track" cx="12" cy="12" r="8" />
      <circle
        key={counter}
        className="progress"
        cx="12"
        cy="12"
        r="8"
        style={{ animationDuration: `${period}s`, animationDelay: `${-elapsed}s` }}
      />
    </svg>
  );
}

/** The shared tick rail under the top bar. */
export function Rail({ period, remaining, counter, ending }: CycleProps) {
  const elapsed = useStartOffset(period, remaining, counter);
  return (
    <div className="rail" aria-hidden="true">
      <div
        key={counter}
        className={`rail-fill${ending ? ' ending' : ''}`}
        style={{ animationDuration: `${period}s`, animationDelay: `${-elapsed}s` }}
      />
    </div>
  );
}
