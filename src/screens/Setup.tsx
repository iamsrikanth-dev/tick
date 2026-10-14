import { metricDeckUrl } from '../brand';
import { useEffect, useRef, useState } from 'react';
import { ArrowIcon, DeviceIcon, Mark, OfflineIcon, ShieldIcon } from '../components/icons';
import { Odometer } from '../components/time';
import { Monogram } from '../components/ui';
import { EASE, gsap, prefersReducedMotion, shake, useEntrance, useGSAP, withMotion } from '../gsap';
import { passwordStrength } from '../lib/util';

const STRENGTH_COLORS = ['var(--danger)', 'var(--danger)', 'var(--danger)', 'var(--ink)', 'var(--success)'];

export function SetupScreen({ onCreate }: { onCreate: (password: string) => Promise<void> }) {
  const [step, setStep] = useState<'welcome' | 'password'>('welcome');
  const root = useRef<HTMLDivElement>(null);

  // Leaving the welcome hero: lift it away before the password step rises in.
  const next = () => {
    const hero = root.current?.querySelector('.auth-hero');
    if (!hero || prefersReducedMotion()) return setStep('password');
    gsap.to(hero, { y: -24, autoAlpha: 0, duration: 0.45, ease: 'power2.in', onComplete: () => setStep('password') });
  };

  return (
    <main className="auth" ref={root}>
      <header className="auth-top">
        <span className="brand">
          <Mark />
          Tick
        </span>
      </header>
      {step === 'welcome' ? <Welcome onNext={next} /> : <CreatePassword onCreate={onCreate} />}
      <footer className="credit">
        <a href={metricDeckUrl('app_setup')} target="_blank" rel="noopener">
          A free tool by <strong>MetricDeck</strong>
        </a>
      </footer>
    </main>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const scope = useEntrance<HTMLDivElement>();
  return (
    <>
      <div className="auth-hero" ref={scope}>
        <span className="pill-label" data-rise>
          <span className="dot" />
          Private, encrypted, offline
        </span>
        <h1 className="display" data-reveal>
          Your 2FA codes, one keystroke away.
        </h1>
        <p className="lead" data-rise>
          Tick keeps your two-factor codes in this browser. Type a few letters, press Enter, and the code is on your
          clipboard. No more reaching for your phone.
        </p>
        <div data-rise>
          <button className="btn btn-primary btn-lg" onClick={onNext} autoFocus>
            Get Started
            <ArrowIcon />
          </button>
        </div>
        <ul className="features" data-rise>
          <li>
            <DeviceIcon />
            Stays on this device
          </li>
          <li>
            <ShieldIcon />
            AES-256 encrypted
          </li>
          <li>
            <OfflineIcon />
            Works offline
          </li>
        </ul>
      </div>
      <Marquee />
    </>
  );
}

const SERVICES = [
  ['GitHub', 'work'],
  ['Google', 'personal'],
  ['AWS', 'root'],
  ['Stripe', 'billing'],
  ['Figma', 'design'],
  ['Notion', 'team'],
  ['Vercel', 'deploys'],
  ['Discord', 'gaming'],
  ['Cloudflare', 'dns'],
  ['Linear', 'issues'],
  ['Slack', 'acme'],
  ['Dropbox', 'files'],
] as const;

function demoCode(seed: number, tick: number): string {
  // Illustrative digits only: a cheap hash so each tile changes on the tick.
  let x = (seed * 2654435761 + tick * 40503) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0x5bd1e995) >>> 0;
  return String(x % 1_000_000).padStart(6, '0');
}

/** Two rows of example tiles drifting in opposite directions, with codes that roll every few seconds. */
function Marquee() {
  const scope = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => setTick((t) => t + 1), 3200);
    return () => clearInterval(id);
  }, []);

  useGSAP(
    () => {
      withMotion(() => {
        gsap.from(scope.current, { autoAlpha: 0, y: 40, duration: 1.4, ease: EASE, delay: 0.5 });
        const tracks = gsap.utils.toArray<HTMLElement>('.marquee-track');
        const loops = tracks.map((track, i) =>
          gsap.fromTo(track, { xPercent: i % 2 ? -50 : 0 }, { xPercent: i % 2 ? 0 : -50, duration: 60, ease: 'none', repeat: -1 }),
        );
        const el = scope.current!;
        const slow = () => loops.forEach((l) => gsap.to(l, { timeScale: 0.2, duration: 0.6 }));
        const resume = () => loops.forEach((l) => gsap.to(l, { timeScale: 1, duration: 0.6 }));
        el.addEventListener('pointerenter', slow);
        el.addEventListener('pointerleave', resume);
        return () => {
          el.removeEventListener('pointerenter', slow);
          el.removeEventListener('pointerleave', resume);
        };
      });
    },
    { scope },
  );

  const rows = [SERVICES.slice(0, 6), SERVICES.slice(6)];
  return (
    <div className="marquee" ref={scope} aria-hidden="true">
      {rows.map((row, r) => (
        <div className="marquee-track" key={r}>
          {/* Two copies so the loop is seamless at -50%. */}
          {[...row, ...row].map(([name, label], i) => (
            <div className="tile" key={i}>
              <Monogram name={name} size="sm" />
              <span>
                <span className="tile-name">{name}</span>
                <span className="small">{label}</span>
              </span>
              <Odometer value={demoCode(r * 100 + (i % row.length) + 7, tick + (i % row.length))} className="tile-code" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CreatePassword({ onCreate }: { onCreate: (password: string) => Promise<void> }) {
  const scope = useEntrance<HTMLFormElement>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const strength = passwordStrength(password);
  const tooShort = password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (tooShort || confirm !== password) {
      shake(scope.current?.querySelector('.auth-form') ?? null);
      return;
    }
    setBusy(true);
    try {
      await onCreate(password);
    } catch {
      setError('Tick couldn’t save to this browser. Check that site storage is allowed, then try again.');
      setBusy(false);
    }
  };

  return (
    <form className="auth-hero" onSubmit={submit} ref={scope} noValidate>
      <h1 className="h1" data-reveal>
        Choose a master password.
      </h1>
      <p className="lead" data-rise>
        It unlocks Tick and encrypts your codes. It can’t be recovered, so pick one you’ll remember.
      </p>
      <div className="auth-form" data-rise>
        <label className="field">
          <span className="field-label">Master password</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={touched && tooShort}
            aria-describedby="strength-hint"
            autoFocus
          />
        </label>
        <div className="strength" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} style={{ background: strength.score >= n ? STRENGTH_COLORS[strength.score] : undefined }} />
          ))}
        </div>
        <span id="strength-hint" className={touched && tooShort ? 'field-error' : 'field-hint'}>
          {password ? `${strength.label}. ` : ''}
          {tooShort ? 'Use at least 8 characters.' : 'Longer is stronger: a short sentence works well.'}
        </span>
        <label className="field" style={{ marginTop: 6 }}>
          <span className="field-label">Confirm password</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch || (touched && confirm !== password)}
          />
        </label>
        {(mismatch || (touched && confirm !== password)) && <span className="field-error">The passwords don’t match.</span>}
        {error && <p className="field-error">{error}</p>}
        <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
          {busy ? 'Encrypting…' : 'Create Vault'}
        </button>
      </div>
    </form>
  );
}
