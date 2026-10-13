import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { LockIcon, Mark } from '../components/icons';
import { spring } from '../components/ui';
import { WrongPasswordError } from '../lib/crypto';

export function UnlockScreen({ onUnlock, onErase }: { onUnlock: (password: string) => Promise<void>; onErase: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
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
      setShakeKey((k) => k + 1);
      setPassword('');
    }
  };

  return (
    <main className="auth">
      <motion.div className="auth-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <div>
          <motion.div animate={busy ? { rotate: 360 } : { rotate: 0 }} transition={busy ? { duration: 1.1, repeat: Infinity, ease: 'linear' } : spring} style={{ width: 64 }}>
            <Mark className="auth-mark" />
          </motion.div>
          <h1 className="title">Tick is locked</h1>
        </div>
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Master password</span>
            <input
              key={shakeKey}
              className={`input${shakeKey ? ' shake' : ''}`}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? 'unlock-error' : undefined}
              autoFocus
              disabled={busy}
            />
            {error && (
              <span className="field-error" id="unlock-error" role="alert">
                {error}
              </span>
            )}
          </label>
          <button className="btn btn-primary btn-block" type="submit" disabled={!password || busy}>
            <LockIcon />
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>
        <button className="btn btn-plain" style={{ justifySelf: 'center' }} onClick={() => setForgot((f) => !f)} aria-expanded={forgot}>
          Forgot Password?
        </button>
        <AnimatePresence>
          {forgot && (
            <motion.div
              className="confirm"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring}
              style={{ overflow: 'hidden' }}
            >
              <p className="body" style={{ color: 'var(--content)' }}>
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
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  );
}
