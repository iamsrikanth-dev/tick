import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraIcon, ChevronIcon, ImageIcon, KeyIcon, LinkIcon, ScreenIcon } from '../components/icons';
import { Odometer } from '../components/time';
import { Monogram, Segmented, Sheet, spring, useToast } from '../components/ui';
import { useNow } from '../hooks';
import { displayName, mergeAccounts, parseImport } from '../lib/importers';
import { ImportError, validateParams } from '../lib/otpauth';
import { decodeImageBlob, decodeVideoFrame, loadDecoder } from '../lib/qr';
import { totp } from '../lib/totp';
import type { Algorithm, OtpParams } from '../lib/types';
import { useVault } from '../vault-context';

export type AddSource = 'screen' | 'camera' | 'image' | 'link' | 'manual';

interface Props {
  source: AddSource | null;
  onSourceChange: (s: AddSource) => void;
  onClose: () => void;
}

const canCaptureScreen = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
const canUseCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export function AddSheet({ source, onSourceChange, onClose }: Props) {
  const vault = useVault();
  const toast = useToast();
  const [found, setFound] = useState<OtpParams[] | null>(null);
  const [skipped, setSkipped] = useState(0);

  // Start fresh each time the sheet opens.
  useEffect(() => {
    if (source === null) {
      setFound(null);
      setSkipped(0);
    }
  }, [source]);

  const handleText = useCallback((text: string): string | null => {
    try {
      const result = parseImport(text);
      if (result.kind === 'backup') return 'That’s a Tick backup. Import it from Settings → Import.';
      setFound(result.accounts);
      setSkipped(result.skipped);
      return null;
    } catch (error) {
      return error instanceof ImportError ? error.message : 'That code couldn’t be read.';
    }
  }, []);

  const save = async (selected: OtpParams[]) => {
    let summary = { added: 0, duplicates: 0 };
    await vault.update((data) => {
      const merged = mergeAccounts(data.accounts, selected);
      summary = merged;
      return { ...data, accounts: merged.accounts };
    });
    onClose();
    const first = selected[0];
    if (summary.added === 1 && first) toast({ title: `Added ${displayName(first)}` });
    else if (summary.added > 1) toast({ title: `Added ${summary.added} accounts` });
    if (summary.duplicates) toast({ title: summary.added ? `Added ${summary.added}, skipped ${summary.duplicates} already in Tick` : 'Already in Tick' }, 3200);
  };

  const sources = useMemo(() => {
    const list: { value: AddSource; label: string; icon: React.ReactNode }[] = [];
    if (canCaptureScreen) list.push({ value: 'screen', label: 'Screen', icon: <ScreenIcon className="icon" /> });
    if (canUseCamera) list.push({ value: 'camera', label: 'Camera', icon: <CameraIcon className="icon" /> });
    list.push({ value: 'image', label: 'Image', icon: <ImageIcon className="icon" /> });
    list.push({ value: 'link', label: 'Link', icon: <LinkIcon className="icon" /> });
    list.push({ value: 'manual', label: 'Key', icon: <KeyIcon className="icon" /> });
    return list;
  }, []);

  const active = source && sources.some((s) => s.value === source) ? source : sources[0].value;
  const reviewing = found !== null;

  return (
    <Sheet
      open={source !== null}
      title={reviewing ? (found.length === 1 ? 'Add Account' : `Found ${found.length} Accounts`) : 'Add Account'}
      onClose={onClose}
      leading={
        reviewing ? (
          <button className="icon-btn" aria-label="Back" onClick={() => setFound(null)} style={{ transform: 'scaleX(-1)' }}>
            <ChevronIcon />
          </button>
        ) : undefined
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {reviewing ? (
          <motion.div key="review" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={spring}>
            <Review accounts={found} skipped={skipped} existing={vault.data.accounts} onAdd={save} />
          </motion.div>
        ) : (
          <motion.div key="pick" className="section" style={{ gap: 18 }} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={spring}>
            <Segmented label="How to add" value={active} options={sources} onChange={onSourceChange} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={active} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
                {active === 'screen' && <StreamSource kind="screen" onText={handleText} />}
                {active === 'camera' && <StreamSource kind="camera" onText={handleText} />}
                {active === 'image' && <ImageSource onText={handleText} />}
                {active === 'link' && <LinkSource onText={handleText} />}
                {active === 'manual' && <ManualSource onFound={(p) => { setFound([p]); setSkipped(0); }} />}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

/* ---------- Screen and camera ---------- */

function StreamSource({ kind, onText }: { kind: 'screen' | 'camera'; onText: (text: string) => string | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const stop = useCallback(() => {
    setStream((s) => {
      s?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    setError('');
    loadDecoder();
    try {
      const media =
        kind === 'screen'
          ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
          : await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      media.getVideoTracks()[0]?.addEventListener('ended', stop);
      setStream(media);
    } catch (e) {
      const denied = e instanceof DOMException && e.name === 'NotAllowedError';
      setError(denied ? (kind === 'screen' ? 'Screen sharing was cancelled.' : 'Camera access was blocked. Allow it in your browser’s site settings.') : 'Couldn’t start the ' + (kind === 'screen' ? 'screen capture.' : 'camera.'));
    }
  };

  useEffect(() => {
    if (!stream || !video.current) return;
    const el = video.current;
    el.srcObject = stream;
    el.play().catch(() => {});
    let lastText = '';
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      const text = await decodeVideoFrame(el).finally(() => {
        busy = false;
      });
      if (!text || text === lastText) return;
      lastText = text;
      const problem = onText(text);
      if (problem) setStatus(problem);
      else stop();
    }, 250);
    return () => clearInterval(timer);
  }, [stream, onText, stop]);

  if (stream) {
    return (
      <div className="section">
        <div className="scanner">
          <video ref={video} muted playsInline />
          <div className="scan-line" />
        </div>
        <p className="small" role="status" style={{ textAlign: 'center', margin: 0 }}>
          {status || (kind === 'screen' ? 'Looking for a QR code on the shared screen…' : 'Hold the QR code up to the camera…')}
        </p>
        <button className="btn" onClick={stop}>
          Stop {kind === 'screen' ? 'Sharing' : 'Camera'}
        </button>
      </div>
    );
  }

  return (
    <div className="source-intro">
      <span className="big-icon">{kind === 'screen' ? <ScreenIcon /> : <CameraIcon />}</span>
      <p className="headline">{kind === 'screen' ? 'Scan a QR code on your screen' : 'Scan with your camera'}</p>
      <p className="body" style={{ maxWidth: 360 }}>
        {kind === 'screen'
          ? 'Open the site’s two-factor setup page, then share that tab or window. Tick reads the code and stops sharing right away.'
          : 'Point the camera at a QR code, such as the transfer code from Google Authenticator on your phone.'}
      </p>
      <button className="btn btn-primary" onClick={start} data-autofocus>
        {kind === 'screen' ? 'Choose Screen to Scan' : 'Start Camera'}
      </button>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

/* ---------- Image ---------- */

function ImageSource({ onText }: { onText: (text: string) => string | null }) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const read = useCallback(
    async (blob: Blob | null | undefined) => {
      if (!blob) return;
      if (!blob.type.startsWith('image/')) {
        setError('That file isn’t an image. Try a PNG or JPEG screenshot.');
        return;
      }
      setBusy(true);
      setError('');
      try {
        const text = await decodeImageBlob(blob);
        if (!text) setError('No QR code found in that image. Try a sharper or closer screenshot.');
        else {
          const problem = onText(text);
          if (problem) setError(problem);
        }
      } catch {
        setError('That image couldn’t be opened.');
      } finally {
        setBusy(false);
      }
    },
    [onText],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      if (item) {
        e.preventDefault();
        read(item.getAsFile());
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [read]);

  return (
    <div
      className={`dropzone${over ? ' over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        read(e.dataTransfer.files[0]);
      }}
    >
      <span className="big-icon">
        <ImageIcon />
      </span>
      <p className="headline">{busy ? 'Reading…' : 'Drop a QR code screenshot'}</p>
      <p className="body">or paste one with {navigator.platform.includes('Mac') ? '⌘V' : 'Ctrl+V'}</p>
      <button className="btn" onClick={() => input.current?.click()} data-autofocus>
        Choose Image
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => read(e.target.files?.[0])} />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------- Link ---------- */

function LinkSource({ onText }: { onText: (text: string) => string | null }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onText(text) ?? '');
      }}
    >
      <label className="field">
        <span className="field-label">Setup link</span>
        <textarea
          className="input"
          placeholder="otpauth://totp/GitHub:you@example.com?secret=…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError('');
          }}
          aria-invalid={!!error}
          spellCheck={false}
          data-autofocus
        />
        <span className={error ? 'field-error' : 'field-hint'}>
          {error || 'Paste one or more otpauth:// links, or a Google Authenticator transfer link.'}
        </span>
      </label>
      <button className="btn btn-primary" type="submit" disabled={!text.trim()}>
        Continue
      </button>
    </form>
  );
}

/* ---------- Manual ---------- */

function ManualSource({ onFound }: { onFound: (p: OtpParams) => void }) {
  const [issuer, setIssuer] = useState('');
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [algorithm, setAlgorithm] = useState<Algorithm>('SHA1');
  const [digits, setDigits] = useState('6');
  const [period, setPeriod] = useState('30');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      onFound(validateParams({ issuer, label, secret, algorithm, digits: Number(digits), period: Number(period) }));
    } catch (err) {
      setError(err instanceof ImportError ? err.message : 'Check the details and try again.');
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Service</span>
        <input className="input" placeholder="GitHub" value={issuer} onChange={(e) => setIssuer(e.target.value)} data-autofocus />
      </label>
      <label className="field">
        <span className="field-label">Account</span>
        <input className="input" placeholder="you@example.com" value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Setup key</span>
        <input
          className="input mono"
          placeholder="JBSW Y3DP EHPK 3PXP"
          value={secret}
          onChange={(e) => {
            setSecret(e.target.value);
            setError('');
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={!!error}
        />
        <span className={error ? 'field-error' : 'field-hint'}>{error || 'Sites show this under “Can’t scan the code?”'}</span>
      </label>
      <button type="button" className="disclosure" aria-expanded={advanced} onClick={() => setAdvanced((a) => !a)}>
        <ChevronIcon />
        Advanced
      </button>
      <AnimatePresence initial={false}>
        {advanced && (
          <motion.div className="form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring} style={{ overflow: 'hidden' }}>
            <div className="field">
              <span className="field-label">Algorithm</span>
              <Segmented label="Algorithm" value={algorithm} onChange={setAlgorithm} options={[{ value: 'SHA1', label: 'SHA-1' }, { value: 'SHA256', label: 'SHA-256' }, { value: 'SHA512', label: 'SHA-512' }]} />
            </div>
            <div className="field">
              <span className="field-label">Digits</span>
              <Segmented label="Digits" value={digits} onChange={setDigits} options={[{ value: '6', label: '6' }, { value: '7', label: '7' }, { value: '8', label: '8' }]} />
            </div>
            <div className="field">
              <span className="field-label">Refresh every</span>
              <Segmented label="Refresh period" value={period} onChange={setPeriod} options={[{ value: '30', label: '30 s' }, { value: '60', label: '60 s' }]} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button className="btn btn-primary" type="submit" disabled={!secret.trim() || (!issuer.trim() && !label.trim())}>
        Continue
      </button>
    </form>
  );
}

/* ---------- Review ---------- */

function Review({ accounts, skipped, existing, onAdd }: { accounts: OtpParams[]; skipped: number; existing: OtpParams[]; onAdd: (a: OtpParams[]) => Promise<void> }) {
  const existingKeys = useMemo(() => new Set(existing.map((a) => `${a.secret}:${a.algorithm}:${a.digits}:${a.period}`)), [existing]);
  const isDuplicate = (a: OtpParams) => existingKeys.has(`${a.secret}:${a.algorithm}:${a.digits}:${a.period}`);
  const [checked, setChecked] = useState(() => accounts.map((a) => !isDuplicate(a)));
  const [busy, setBusy] = useState(false);
  const count = checked.filter(Boolean).length;

  if (accounts.length === 1) {
    const a = accounts[0];
    const dup = isDuplicate(a);
    return (
      <div className="section" style={{ gap: 18 }}>
        <div className="account-head">
          <Monogram name={displayName(a)} />
          <div className="who">
            <span className="issuer">{displayName(a)}</span>
            {a.issuer && a.label && <span className="account">{a.label}</span>}
          </div>
        </div>
        <LivePreview params={a} />
        {dup && <p className="field-hint">This account is already in Tick.</p>}
        <button className="btn btn-primary" disabled={busy || dup} onClick={async () => { setBusy(true); await onAdd([a]); }} data-autofocus>
          Add {displayName(a)}
        </button>
      </div>
    );
  }

  return (
    <div className="section" style={{ gap: 16 }}>
      {skipped > 0 && <p className="field-hint">{skipped} item{skipped === 1 ? '' : 's'} couldn’t be imported (counter-based or unreadable).</p>}
      <ul className="review-list">
        {accounts.map((a, i) => {
          const dup = isDuplicate(a);
          return (
            <motion.li key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i * 0.03, 0.3) }}>
              <label className="review-item">
                <input type="checkbox" checked={checked[i]} disabled={dup} onChange={(e) => setChecked((c) => c.map((v, j) => (j === i ? e.target.checked : v)))} />
                <Monogram name={displayName(a)} />
                <span className="who" style={{ flex: 1 }}>
                  <span className="issuer">{displayName(a)}</span>
                  <span className="account">{dup ? 'Already in Tick' : a.label || ' '}</span>
                </span>
              </label>
            </motion.li>
          );
        })}
      </ul>
      <button className="btn btn-primary" disabled={!count || busy} onClick={async () => { setBusy(true); await onAdd(accounts.filter((_, i) => checked[i])); }} data-autofocus>
        Add {count} Account{count === 1 ? '' : 's'}
      </button>
    </div>
  );
}

/** Shows the code this account produces now, so people can finish the site's setup check. */
function LivePreview({ params }: { params: OtpParams }) {
  const vault = useVault();
  const now = useNow(vault.clockOffset);
  const [code, setCode] = useState('');
  const counter = Math.floor(now / 1000 / params.period);
  useEffect(() => {
    let live = true;
    totp(params, now).then((c) => live && setCode(c));
    return () => {
      live = false;
    };
    // Recompute only when the period rolls over.
  }, [params, counter]);
  return (
    <div className="preview-code">
      <span className="small">Current code</span>
      <Odometer value={code || '0'.repeat(params.digits)} />
      <span className="small">Enter it on the site to finish turning on two-factor.</span>
    </div>
  );
}
