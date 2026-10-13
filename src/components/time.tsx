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
                <span className="odo-strip" style={{ transform: `translateY(${-digit * 1.1}em)`, transitionDelay: `${i * 30}ms` }}>
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

/** Countdown pill for a single account: a draining ring and the seconds left. */
export function Timer({ period, remaining, counter, ending }: CycleProps) {
  const elapsed = useStartOffset(period, remaining, counter);
  return (
    <span className={`timer${ending ? ' ending' : ''}`} aria-hidden="true">
      <svg className="ring" viewBox="0 0 18 18">
        <circle className="track" cx="9" cy="9" r="6" />
        <circle
          key={counter}
          className="progress"
          cx="9"
          cy="9"
          r="6"
          style={{ animationDuration: `${period}s`, animationDelay: `${-elapsed}s` }}
        />
      </svg>
      {Math.ceil(remaining)}s
    </span>
  );
}

/** The shared tick: one progress pill for the 30-second cycle most codes follow. */
export function Tick({ period, remaining, counter, ending }: CycleProps) {
  const elapsed = useStartOffset(period, remaining, counter);
  return (
    <div className={`tick${ending ? ' ending' : ''}`} aria-hidden="true">
      <span>New codes in</span>
      <div className="tick-track">
        <div key={counter} className="tick-fill" style={{ animationDuration: `${period}s`, animationDelay: `${-elapsed}s` }} />
      </div>
      <span className="tick-seconds">{Math.ceil(remaining)}s</span>
    </div>
  );
}
