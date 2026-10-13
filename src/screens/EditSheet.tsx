import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { TrashIcon } from '../components/icons';
import { Sheet, spring, useToast } from '../components/ui';
import { displayName } from '../lib/importers';
import type { Account } from '../lib/types';
import { useVault } from '../vault-context';

export function EditSheet({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const vault = useVault();
  const toast = useToast();
  const [issuer, setIssuer] = useState('');
  const [label, setLabel] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (account) {
      setIssuer(account.issuer);
      setLabel(account.label);
      setConfirming(false);
    }
  }, [account]);

  if (!account) return <Sheet open={false} title="" onClose={onClose}>{null}</Sheet>;

  const name = displayName(account);
  const valid = issuer.trim() !== '' || label.trim() !== '';
  const changed = issuer.trim() !== account.issuer || label.trim() !== account.label;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !changed) return onClose();
    await vault.update((d) => ({
      ...d,
      accounts: d.accounts.map((a) => (a.id === account.id ? { ...a, issuer: issuer.trim(), label: label.trim() } : a)),
    }));
    onClose();
    toast({ title: 'Changes saved' });
  };

  const remove = async () => {
    const removed = account;
    const index = vault.data.accounts.findIndex((a) => a.id === removed.id);
    await vault.update((d) => ({ ...d, accounts: d.accounts.filter((a) => a.id !== removed.id) }));
    onClose();
    toast(
      {
        title: `Deleted ${name}`,
        action: {
          label: 'Undo',
          run: () =>
            vault.update((d) => {
              const accounts = [...d.accounts];
              accounts.splice(Math.min(index, accounts.length), 0, removed);
              return { ...d, accounts };
            }),
        },
      },
      6000,
    );
  };

  return (
    <Sheet open title={`Edit ${name}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label className="field">
          <span className="field-label">Service</span>
          <input className="input" value={issuer} onChange={(e) => setIssuer(e.target.value)} data-autofocus />
        </label>
        <label className="field">
          <span className="field-label">Account</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        {!valid && <span className="field-error">Add a service or account name.</span>}
        <dl className="details">
          <dt>Code length</dt>
          <dd>{account.digits} digits</dd>
          <dt>Refreshes every</dt>
          <dd>{account.period} seconds</dd>
          <dt>Algorithm</dt>
          <dd>{account.algorithm.replace('SHA', 'SHA-')}</dd>
          <dt>Added</dt>
          <dd>{new Date(account.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</dd>
        </dl>
        <button className="btn btn-primary" type="submit" disabled={!valid}>
          Save Changes
        </button>
      </form>

      <AnimatePresence mode="wait" initial={false}>
        {confirming ? (
          <motion.div key="confirm" className="confirm" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring}>
            <p className="body" style={{ color: 'var(--content)' }}>
              Delete {name}? You’ll need a backup code or another authenticator to sign in to {name} after this.
            </p>
            <div className="row-actions">
              <button className="btn" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button className="btn btn-danger-solid" onClick={remove}>
                Delete
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.button key="delete" className="btn btn-danger" onClick={() => setConfirming(true)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <TrashIcon />
            Delete Account
          </motion.button>
        )}
      </AnimatePresence>
    </Sheet>
  );
}
