import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { DeviceIcon, Mark, OfflineIcon, ShieldIcon } from '../components/icons';
import { spring } from '../components/ui';
import { passwordStrength } from '../lib/util';

const STRENGTH_COLORS = ['var(--danger)', 'var(--danger)', 'var(--warn)', 'var(--accent)', 'var(--success)'];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const rise = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: spring },
};

export function SetupScreen({ onCreate }: { onCreate: (password: string) => Promise<void> }) {
  const [step, setStep] = useState<'welcome' | 'password'>('welcome');
  return (
    <main className="auth">
      <AnimatePresence mode="wait">
        {step === 'welcome' ? (
          <Welcome key="welcome" onNext={() => setStep('password')} />
        ) : (
          <CreatePassword key="password" onCreate={onCreate} />
        )}
      </AnimatePresence>
    </main>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <motion.div className="auth-card" variants={stagger} initial="hidden" animate="show" exit={{ opacity: 0, x: -24 }}>
      <motion.div variants={rise}>
        <Mark className="auth-mark" />
        <h1 className="title">Your codes, one keystroke away.</h1>
      </motion.div>
      <motion.p className="body" variants={rise}>
        Tick keeps your two-factor codes in this browser, so signing in no longer means reaching for your phone.
      </motion.p>
      <motion.ul className="auth-points" variants={stagger}>
        <Point icon={<DeviceIcon />} title="Stays on this device" text="Codes are generated here. Nothing is sent to a server." />
        <Point icon={<ShieldIcon />} title="Encrypted with your password" text="AES-256 encryption. Locks itself when you step away." />
        <Point icon={<OfflineIcon />} title="Works offline" text="Install it as an app and open it without a connection." />
      </motion.ul>
      <motion.div variants={rise}>
        <button className="btn btn-primary btn-block" onClick={onNext} autoFocus>
          Get Started
        </button>
      </motion.div>
    </motion.div>
  );
}

function Point({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <motion.li variants={rise}>
      <span className="bullet">{icon}</span>
      <span>
        <strong>{title}</strong>
        <span className="caption" style={{ display: 'block' }}>
          {text}
        </span>
      </span>
    </motion.li>
  );
}

function CreatePassword({ onCreate }: { onCreate: (password: string) => Promise<void> }) {
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
    if (tooShort || confirm !== password) return;
    setBusy(true);
    try {
      await onCreate(password);
    } catch {
      setError('Tick couldn’t save to this browser. Check that site storage is allowed, then try again.');
      setBusy(false);
    }
  };

  return (
    <motion.form
      className="auth-card"
      onSubmit={submit}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={spring}
      noValidate
    >
      <div>
        <Mark className="auth-mark" />
        <h1 className="title">Choose a master password</h1>
      </div>
      <p className="body">
        It unlocks Tick and encrypts your codes. There’s no way to recover it, so pick one you’ll remember.
      </p>
      <div className="form">
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
          <div className="strength" aria-hidden="true">
            {[1, 2, 3, 4].map((n) => (
              <span key={n} style={{ background: strength.score >= n ? STRENGTH_COLORS[strength.score] : undefined }} />
            ))}
          </div>
          <span id="strength-hint" className={touched && tooShort ? 'field-error' : 'field-hint'}>
            {password ? `${strength.label}. ` : ''}
            {tooShort ? 'Use at least 8 characters.' : 'Longer is stronger: a short sentence works well.'}
          </span>
        </label>
        <label className="field">
          <span className="field-label">Confirm password</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch || (touched && confirm !== password)}
          />
          {(mismatch || (touched && confirm !== password)) && (
            <span className="field-error">The passwords don’t match.</span>
          )}
        </label>
        {error && <p className="field-error">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Encrypting…' : 'Create Vault'}
        </button>
      </div>
    </motion.form>
  );
}
