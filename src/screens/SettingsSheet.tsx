import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { ChevronIcon, ClipboardIcon, DownloadIcon, KeyIcon, LockIcon, TrashIcon, UploadIcon, WarningIcon } from '../components/icons';
import { Segmented, Sheet, spring, useToast } from '../components/ui';
import { unlockVault, WrongPasswordError, type VaultRecord } from '../lib/crypto';
import { mergeAccounts, parseImport } from '../lib/importers';
import { buildOtpauthUri, ImportError } from '../lib/otpauth';
import type { OtpParams } from '../lib/types';
import { dateStamp, downloadFile, passwordStrength } from '../lib/util';
import { useVault } from '../vault-context';

type Panel = null | 'password' | 'plain' | 'erase' | { backup: VaultRecord };

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const vault = useVault();
  const toast = useToast();
  const { settings } = vault.data;
  const [panel, setPanel] = useState<Panel>(null);
  const [importError, setImportError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const close = () => {
    setPanel(null);
    setImportError('');
    onClose();
  };

  const setSetting = (patch: Partial<typeof settings>) => vault.update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

  const addImported = async (incoming: OtpParams[], source: string) => {
    let result = { added: 0, duplicates: 0 };
    await vault.update((d) => {
      const merged = mergeAccounts(d.accounts, incoming);
      result = merged;
      return { ...d, accounts: merged.accounts };
    });
    close();
    toast({
      title: result.added ? `Imported ${result.added} account${result.added === 1 ? '' : 's'} from ${source}` : 'Nothing new to import',
      sub: result.duplicates ? `${result.duplicates} already in Tick` : undefined,
    }, 3600);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setImportError('');
    try {
      const result = parseImport(await file.text());
      if (result.kind === 'backup') setPanel({ backup: result.record });
      else await addImported(result.accounts, result.source === 'link' ? file.name : result.source);
    } catch (error) {
      setImportError(error instanceof ImportError ? error.message : 'That file couldn’t be read.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const exportEncrypted = () => {
    downloadFile(`tick-backup-${dateStamp()}.json`, JSON.stringify(vault.record(), null, 2));
    toast({ title: 'Backup downloaded', sub: 'Opens with your current master password' }, 3600);
  };

  const exportPlain = () => {
    downloadFile(`tick-links-${dateStamp()}.txt`, vault.data.accounts.map(buildOtpauthUri).join('\n') + '\n', 'text/plain');
    setPanel(null);
    toast({ title: 'Links downloaded', sub: 'Delete the file once you’ve used it' }, 3600);
  };

  return (
    <Sheet open={open} title="Settings" onClose={close}>
      <section className="section">
        <h3 className="section-title">Security</h3>
        <div className="group" style={{ padding: 14, gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LockIcon />
            <span className="grow">Lock after inactivity</span>
          </span>
          <Segmented
            label="Lock after inactivity"
            value={String(settings.autoLockMinutes)}
            onChange={(v) => setSetting({ autoLockMinutes: Number(v) })}
            options={[
              { value: '1', label: '1 min' },
              { value: '5', label: '5 min' },
              { value: '15', label: '15 min' },
              { value: '60', label: '1 hour' },
            ]}
          />
        </div>
        <div className="group" style={{ padding: 14, gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClipboardIcon />
            <span className="grow">
              Clear copied codes
              <span className="caption" style={{ display: 'block' }}>
                Works while Tick is the active tab
              </span>
            </span>
          </span>
          <Segmented
            label="Clear copied codes"
            value={String(settings.clearClipboardSeconds)}
            onChange={(v) => setSetting({ clearClipboardSeconds: Number(v) })}
            options={[
              { value: '0', label: 'Never' },
              { value: '15', label: '15 s' },
              { value: '30', label: '30 s' },
              { value: '60', label: '60 s' },
            ]}
          />
        </div>
        <div className="group">
          <button className="group-row" onClick={() => setPanel(panel === 'password' ? null : 'password')} aria-expanded={panel === 'password'}>
            <KeyIcon />
            <span className="grow">Change master password</span>
            <ChevronIcon className="icon chev" />
          </button>
        </div>
        <AnimatePresence initial={false}>{panel === 'password' && <ChangePassword onDone={() => setPanel(null)} />}</AnimatePresence>
      </section>

      <section className="section">
        <h3 className="section-title">Backup</h3>
        <div className="group">
          <button className="group-row" onClick={exportEncrypted}>
            <DownloadIcon />
            <span className="grow">
              Download encrypted backup
              <span className="sub">Restore it on any browser with your master password</span>
            </span>
          </button>
          <button className="group-row" onClick={() => fileInput.current?.click()}>
            <UploadIcon />
            <span className="grow">
              Import accounts
              <span className="sub">Tick backup, Aegis, 2FAS, or a list of otpauth links</span>
            </span>
          </button>
          <button className="group-row" onClick={() => setPanel(panel === 'plain' ? null : 'plain')} aria-expanded={panel === 'plain'}>
            <WarningIcon />
            <span className="grow">
              Export as plain links
              <span className="sub">To move to another authenticator app</span>
            </span>
          </button>
        </div>
        <input ref={fileInput} type="file" accept=".json,.txt,.2fas,application/json,text/plain" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        {importError && (
          <p className="field-error" role="alert">
            {importError}
          </p>
        )}
        <AnimatePresence initial={false}>
          {typeof panel === 'object' && panel !== null && <RestoreBackup key="restore" record={panel.backup} onRestore={(accounts) => addImported(accounts, 'backup')} onCancel={() => setPanel(null)} />}
          {panel === 'plain' && (
            <Reveal key="plain">
              <div className="confirm">
                <p className="body" style={{ color: 'var(--content)' }}>
                  This file isn’t encrypted. Anyone who opens it can generate your codes. Use it only to move to another app, then
                  delete it.
                </p>
                <div className="row-actions">
                  <button className="btn" onClick={() => setPanel(null)}>
                    Cancel
                  </button>
                  <button className="btn btn-danger-solid" onClick={exportPlain}>
                    Download Links
                  </button>
                </div>
              </div>
            </Reveal>
          )}
        </AnimatePresence>
      </section>

      <section className="section">
        <div className="group">
          <button className="group-row danger" onClick={() => setPanel(panel === 'erase' ? null : 'erase')} aria-expanded={panel === 'erase'}>
            <TrashIcon />
            <span className="grow">Erase Tick on this browser</span>
          </button>
        </div>
        <AnimatePresence initial={false}>
          {panel === 'erase' && (
            <Reveal key="erase">
              <div className="confirm">
                <p className="body" style={{ color: 'var(--content)' }}>
                  This removes all {vault.data.accounts.length} account{vault.data.accounts.length === 1 ? '' : 's'} from this browser. It can’t be undone,
                  so download a backup first if you might need them.
                </p>
                <div className="row-actions">
                  <button className="btn" onClick={() => setPanel(null)}>
                    Cancel
                  </button>
                  <button className="btn btn-danger-solid" onClick={() => vault.erase()}>
                    Erase Everything
                  </button>
                </div>
              </div>
            </Reveal>
          )}
        </AnimatePresence>
        <p className="caption" style={{ margin: 0 }}>
          Codes are generated on this device. Your vault is encrypted with AES-256 using a key derived from your master password,
          and it never leaves this browser.
        </p>
      </section>
    </Sheet>
  );
}

function Reveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring} style={{ overflow: 'hidden' }}>
      {children}
    </motion.div>
  );
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const vault = useVault();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const strength = passwordStrength(next);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError('Use at least 8 characters for the new password.');
    if (next !== confirm) return setError('The new passwords don’t match.');
    setBusy(true);
    try {
      await vault.changePassword(current, next);
      onDone();
      toast({ title: 'Master password changed' });
    } catch (err) {
      setError(err instanceof WrongPasswordError ? 'Your current password isn’t right.' : 'The password couldn’t be changed.');
      setBusy(false);
    }
  };

  return (
    <Reveal>
      <form className="form" onSubmit={submit} style={{ paddingTop: 4 }}>
        <input className="input" type="password" placeholder="Current password" aria-label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
        <input className="input" type="password" placeholder="New password" aria-label="New password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <input className="input" type="password" placeholder="Confirm new password" aria-label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <span className={error ? 'field-error' : 'field-hint'} role={error ? 'alert' : undefined}>
          {error || (next ? `${strength.label}.` : 'Your backups keep their old password.')}
        </span>
        <button className="btn btn-primary" type="submit" disabled={busy || !current || !next}>
          {busy ? 'Updating…' : 'Change Password'}
        </button>
      </form>
    </Reveal>
  );
}

function RestoreBackup({ record, onRestore, onCancel }: { record: VaultRecord; onRestore: (accounts: OtpParams[]) => Promise<void>; onCancel: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await unlockVault(record, password);
      await onRestore(data.accounts);
    } catch (err) {
      setError(err instanceof WrongPasswordError ? 'That isn’t the password this backup was made with.' : 'The backup couldn’t be opened.');
      setBusy(false);
    }
  };
  return (
    <Reveal>
      <form className="form" onSubmit={submit}>
        <p className="body">Enter the master password that was in use when this backup was made.</p>
        <input className="input" type="password" aria-label="Backup password" placeholder="Backup password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        {error && (
          <span className="field-error" role="alert">
            {error}
          </span>
        )}
        <div className="row-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={!password || busy}>
            {busy ? 'Opening…' : 'Restore Accounts'}
          </button>
        </div>
      </form>
    </Reveal>
  );
}
