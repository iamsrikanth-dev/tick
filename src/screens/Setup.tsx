import { metricDeckUrl } from '../brand';
import { useState } from 'react';
import { Mark } from '../components/icons';
import { shake, useEntrance } from '../gsap';
import { passwordStrength } from '../lib/util';

const STRENGTH_COLORS = ['var(--danger)', 'var(--danger)', 'var(--danger)', 'var(--ink)', 'var(--success)'];

// The landing page already explains Tick, so the app opens straight on the password step.
export function SetupScreen({ onCreate }: { onCreate: (password: string) => Promise<void> }) {
  return (
    <main className="auth">
      <header className="auth-top">
        <a className="brand" href="/" aria-label="Tick home">
          <Mark />
          Tick
        </a>
      </header>
      <CreatePassword onCreate={onCreate} />
      <footer className="credit">
        <a href={metricDeckUrl('app_setup')} target="_blank" rel="noopener">
          A free tool by <strong>MetricDeck</strong>
        </a>
      </footer>
    </main>
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
