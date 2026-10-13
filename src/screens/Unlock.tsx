import { useRef, useState } from 'react';
import { ArrowIcon, Mark } from '../components/icons';
import { gsap, prefersReducedMotion, shake, useEntrance } from '../gsap';
import { WrongPasswordError } from '../lib/crypto';

export function UnlockScreen({ onUnlock, onErase }: { onUnlock: (password: string) => Promise<void>; onErase: () => Promise<void> }) {
  const scope = useEntrance<HTMLDivElement>();
  const field = useRef<HTMLDivElement>(null);
  const forgotPanel = useRef<HTMLDivElement>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [forgot, setForgot] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await onUnlock(password);
    } catch (err) {
      setBusy(false);
      setError(err instanceof WrongPasswordError ? 'That password isn’t right. Try again.' : 'Tick couldn’t open the vault.');
      setPassword('');
      shake(field.current);
      requestAnimationFrame(() => field.current?.querySelector('input')?.focus());
    }
  };

  const toggleForgot = () => {
    const opening = !forgot;
    setForgot(opening);
    if (opening && !prefersReducedMotion()) {
      requestAnimationFrame(() => gsap.from(forgotPanel.current, { autoAlpha: 0, y: 12, duration: 0.6, ease: 'expo.out' }));
    }
  };

  return (
    <main className="auth">
      <header className="auth-top">
        <span className="brand">
          <Mark />
          Tick
        </span>
      </header>
      <div className="auth-hero" ref={scope}>
        <h1 className="display" data-reveal>
          Welcome back.
        </h1>
        <p className="lead" data-rise>
          Enter your master password to unlock your codes.
        </p>
        <form className="auth-form" onSubmit={submit} data-rise>
          <div className="input-action" ref={field}>
            <input
              className="input"
              type="password"
              placeholder="Master password"
              aria-label="Master password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? 'unlock-error' : undefined}
              autoFocus
              disabled={busy}
            />
            <button className="go" type="submit" disabled={!password || busy} aria-label="Unlock">
              <ArrowIcon />
            </button>
          </div>
          {error && (
            <span className="field-error" id="unlock-error" role="alert" style={{ textAlign: 'center' }}>
              {error}
            </span>
          )}
          {busy && (
            <span className="field-hint" role="status" style={{ textAlign: 'center' }}>
              Unlocking…
            </span>
          )}
        </form>
        <div data-rise>
          <button className="btn btn-plain" onClick={toggleForgot} aria-expanded={forgot}>
            Forgot Password?
          </button>
        </div>
        {forgot && (
          <div className="confirm" ref={forgotPanel} style={{ width: 'min(460px, 100%)', textAlign: 'left' }}>
            <p className="body">
              Your password can’t be recovered because only you know it. You can erase Tick on this browser and start again,
              which removes every code stored here. Keep your sites’ backup codes handy before you do.
            </p>
            <div className="row-actions">
              <button className="btn" onClick={() => setForgot(false)}>
                Cancel
              </button>
              <button className="btn btn-danger-solid" onClick={onErase}>
                Erase and Start Over
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
