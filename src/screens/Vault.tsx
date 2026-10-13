import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, ClockIcon, CloseIcon, EditIcon, GearIcon, ImageIcon, KeyIcon, LinkIcon, LockIcon, Mark, PlusIcon, ScreenIcon, SearchIcon } from '../components/icons';
import { Odometer, Rail, Ring } from '../components/time';
import { Monogram, softSpring, spring, useToast } from '../components/ui';
import { useCodes, useIdleLock, useNow, type CodeState } from '../hooks';
import { displayName, matchesQuery, sortAccounts } from '../lib/importers';
import { counterAt, groupCode, secondsRemaining } from '../lib/totp';
import type { Account } from '../lib/types';
import { isMac } from '../lib/util';
import { useVault } from '../vault-context';
import { AddSheet, type AddSource } from './AddSheet';
import { EditSheet } from './EditSheet';
import { SettingsSheet } from './SettingsSheet';

const ENDING_SECONDS = 5;

export function VaultScreen() {
  const vault = useVault();
  const { data, lock } = vault;
  const now = useNow(vault.clockOffset);
  const codes = useCodes(data.accounts, now);
  const toast = useToast();
  const reduced = useReducedMotion();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [addSource, setAddSource] = useState<AddSource | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const clipboardTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useIdleLock(data.settings.autoLockMinutes, lock);

  const sorted = useMemo(() => sortAccounts(data.accounts), [data.accounts]);
  const visible = useMemo(() => sorted.filter((a) => matchesQuery(a, query)), [sorted, query]);
  const sheetOpen = addSource !== null || editing !== null || settingsOpen;

  useEffect(() => setSelected(0), [query]);

  const copy = useCallback(
    async (account: Account) => {
      const state = codes.get(account.id);
      if (!state) return;
      // In the last second, hand out the next code so it doesn't expire mid-paste.
      const code = state.remaining < 1.5 ? state.next : state.current;
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        toast({ title: 'Couldn’t copy', sub: 'Allow clipboard access for this site' });
        return;
      }
      setCopiedId(account.id);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedId(null), 1400);
      const seconds = data.settings.clearClipboardSeconds;
      toast({ title: `Copied ${displayName(account)} code`, sub: seconds ? `Clears in ${seconds} s` : undefined });
      clearTimeout(clipboardTimer.current);
      if (seconds) {
        clipboardTimer.current = setTimeout(() => {
          // Browsers only allow clipboard writes while the page has focus, so this is best effort.
          if (document.hasFocus()) navigator.clipboard.writeText('').catch(() => {});
        }, seconds * 1000);
      }
    },
    [codes, data.settings.clearClipboardSeconds, toast],
  );

  // Keyboard: type to search, arrows to move, Enter to copy, Esc to clear.
  useEffect(() => {
    if (sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inSearch = target === searchRef.current || target === mobileSearchRef.current;
      const typing = !inSearch && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (typing) return;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if ((e.key === '/' && !inSearch) || (mod && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        focusSearch();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setNavigating(true);
        setSelected((s) => Math.min(s + 1, visible.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setNavigating(true);
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === 'Enter' && (inSearch || target === document.body)) {
        const account = visible[selected];
        if (account) {
          e.preventDefault();
          copy(account);
        }
      } else if (e.key === 'Escape' && query) {
        setQuery('');
      } else if (!inSearch && !mod && !e.altKey && e.key.length === 1 && /\S/.test(e.key)) {
        // Typing anywhere starts a search; the keystroke lands in the field.
        focusSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen, visible, selected, copy, query]);

  function focusSearch() {
    const input = window.matchMedia('(max-width: 600px)').matches ? mobileSearchRef.current : searchRef.current;
    input?.focus();
  }

  // Everything is usually on a 30 s cycle, so one shared rail tells the time for the whole list.
  const railPeriod = 30;
  const railRemaining = secondsRemaining(now, railPeriod);

  const searchField = (ref: React.RefObject<HTMLInputElement | null>, autoFocus: boolean) => (
    <div className="search">
      <SearchIcon />
      <input
        ref={ref}
        type="search"
        placeholder="Search codes"
        aria-label="Search codes"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
      />
      {query ? (
        <button className="icon-btn clear" aria-label="Clear search" onClick={() => setQuery('')}>
          <CloseIcon />
        </button>
      ) : (
        <kbd className="kbd" aria-hidden="true">
          /
        </kbd>
      )}
    </div>
  );

  return (
    <div className="vault" onPointerMove={navigating ? () => setNavigating(false) : undefined}>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="mark">
            <Mark />
            Tick
          </span>
          <span className="spacer" />
          {searchField(searchRef, !window.matchMedia('(max-width: 600px)').matches)}
          <button className="icon-btn filled add-btn" onClick={() => setAddSource('screen')} aria-label="Add account" title="Add account">
            <PlusIcon />
          </button>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings">
            <GearIcon />
          </button>
          <button className="icon-btn" onClick={lock} aria-label="Lock" title="Lock">
            <LockIcon />
          </button>
        </div>
        {data.accounts.length > 0 ? (
          <Rail period={railPeriod} remaining={railRemaining} counter={counterAt(now, railPeriod)} ending={railRemaining <= ENDING_SECONDS} />
        ) : (
          <div className="rail" aria-hidden="true" />
        )}
      </header>

      <main className="content">
        {vault.clockOffset !== 0 && (
          <div className="banner" role="status">
            <ClockIcon />
            <span>
              This computer’s clock is {Math.round(Math.abs(vault.clockOffset) / 1000)} s {vault.clockOffset > 0 ? 'behind' : 'ahead'}. Tick is using
              corrected time so your codes still work.
            </span>
          </div>
        )}

        {data.accounts.length === 0 ? (
          <EmptyVault onAdd={setAddSource} />
        ) : visible.length === 0 ? (
          <motion.div className="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SearchIcon className="icon" />
            <p className="headline">No codes match “{query}”</p>
            <p className="body">Check the spelling, or add this account.</p>
            <button className="btn" onClick={() => setAddSource('screen')}>
              <PlusIcon />
              Add Account
            </button>
          </motion.div>
        ) : (
          <motion.ul className="list" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.035 } } }}>
            <AnimatePresence initial={false}>
              {visible.map((account, i) => (
                <motion.li
                  key={account.id}
                  layout={!reduced}
                  variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
                  initial="hidden"
                  animate="show"
                  exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                  transition={softSpring}
                >
                  <AccountRow
                    account={account}
                    state={codes.get(account.id)}
                    selected={(query !== '' || navigating) && i === selected}
                    copied={copiedId === account.id}
                    onCopy={copy}
                    onEdit={setEditing}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}

        {data.accounts.length > 0 && (
          <motion.div className="hints" aria-hidden="true" layout={!reduced} transition={softSpring}>
            <span>
              <kbd>/</kbd>search
            </span>
            <span>
              <kbd>↑↓</kbd>choose
            </span>
            <span>
              <kbd>↵</kbd>copy
            </span>
          </motion.div>
        )}
      </main>

      <nav className="bottombar" aria-label="Search and add">
        {searchField(mobileSearchRef, false)}
        <button className="icon-btn filled" onClick={() => setAddSource('camera')} aria-label="Add account">
          <PlusIcon />
        </button>
      </nav>

      <AddSheet source={addSource} onSourceChange={setAddSource} onClose={() => setAddSource(null)} />
      <EditSheet account={editing} onClose={() => setEditing(null)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

interface RowProps {
  account: Account;
  state: CodeState | undefined;
  selected: boolean;
  copied: boolean;
  onCopy: (a: Account) => void;
  onEdit: (a: Account) => void;
}

const AccountRow = memo(function AccountRow({ account, state, selected, copied, onCopy, onEdit }: RowProps) {
  const name = displayName(account);
  const ending = !!state && state.remaining <= ENDING_SECONDS;
  const placeholder = '0'.repeat(account.digits);
  return (
    <div className={`row${selected ? ' selected' : ''}`}>
      <button
        className="row-main"
        onClick={() => onCopy(account)}
        aria-label={`${name}${account.label && account.issuer ? `, ${account.label}` : ''}. Code ${groupCode(state?.current ?? '')}. Copy code`}
      >
        <Monogram name={name} />
        <span className="who">
          <span className="issuer">{name}</span>
          {account.issuer && account.label && <span className="label">{account.label}</span>}
        </span>
        <span className="code-wrap">
          <span className="code-line">
            <Odometer value={state?.current ?? placeholder} className={`code${copied ? ' copied' : ending ? ' ending' : ''}`} />
            <span className="status">
            <AnimatePresence initial={false}>
              {copied ? (
                <motion.span key="check" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring}>
                  <CheckIcon className="check" />
                </motion.span>
              ) : (
                <motion.span key="ring" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {state && <Ring period={account.period} remaining={state.remaining} counter={state.counter} ending={ending} />}
                </motion.span>
              )}
            </AnimatePresence>
            </span>
          </span>
          <span className="next mono" aria-hidden={!ending}>
            <AnimatePresence>
              {ending && state && (
                <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  next {groupCode(state.next)}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </span>
      </button>
      <button className="icon-btn row-edit" onClick={() => onEdit(account)} aria-label={`Edit ${name}`} title="Edit">
        <EditIcon />
      </button>
    </div>
  );
});

function EmptyVault({ onAdd }: { onAdd: (source: AddSource) => void }) {
  return (
    <motion.div className="empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <span className="empty-icon" aria-hidden="true">
        <KeyIcon />
      </span>
      <h1 className="title" style={{ fontSize: 24 }}>
        Add your first code
      </h1>
      <p className="body" style={{ maxWidth: 380 }}>
        Open a site’s two-factor setup page and scan its QR code from your screen, or move everything over from your phone’s
        authenticator.
      </p>
      <div className="empty-actions">
        <button className="btn btn-primary" onClick={() => onAdd('screen')}>
          <ScreenIcon />
          Scan From Screen
        </button>
        <button className="btn" onClick={() => onAdd('image')}>
          <ImageIcon />
          Upload QR Image
        </button>
        <button className="btn" onClick={() => onAdd('link')}>
          <LinkIcon />
          Paste Link
        </button>
      </div>
    </motion.div>
  );
}
