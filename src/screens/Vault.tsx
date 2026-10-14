import { metricDeckUrl } from '../brand';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, ClockIcon, CloseIcon, EditIcon, GearIcon, ImageIcon, LinkIcon, LockIcon, Mark, PlusIcon, ScreenIcon, SearchIcon } from '../components/icons';
import { Odometer, Tick, Timer } from '../components/time';
import { Monogram, softSpring, spring, useToast } from '../components/ui';
import { EASE, gsap, pulse, useCountUp, useEntrance, useGSAP, withMotion } from '../gsap';
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
const compactQuery = () => window.matchMedia('(max-width: 600px)').matches;

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
  const clipboardTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useIdleLock(data.settings.autoLockMinutes, lock);

  const empty = data.accounts.length === 0;
  const sorted = useMemo(() => sortAccounts(data.accounts), [data.accounts]);
  const visible = useMemo(() => sorted.filter((a) => matchesQuery(a, query)), [sorted, query]);
  const sheetOpen = addSource !== null || editing !== null || settingsOpen;

  const scope = useEntrance<HTMLElement>([empty]);
  const countRef = useCountUp<HTMLSpanElement>(data.accounts.length);

  // Cards rise in a stagger the first time the grid appears.
  const gridRef = useRef<HTMLUListElement>(null);
  useGSAP(
    () => {
      if (!gridRef.current) return;
      withMotion(() => {
        gsap.from(gridRef.current!.querySelectorAll('.card'), {
          y: 48,
          scale: 0.96,
          autoAlpha: 0,
          duration: 1.1,
          ease: EASE,
          stagger: 0.06,
          delay: 0.35,
          clearProps: 'transform,opacity,visibility',
        });
      });
    },
    { dependencies: [empty] },
  );

  useEffect(() => setSelected(0), [query]);

  const copy = useCallback(
    async (account: Account, card?: HTMLElement | null) => {
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
      pulse(card ?? document.querySelector(`[data-account="${account.id}"] .card`));
      setCopiedId(account.id);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedId(null), 1600);
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
      const inSearch = target === searchRef.current;
      const typing = !inSearch && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (typing) return;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if ((e.key === '/' && !inSearch) || (mod && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'ArrowDown' || (e.key === 'ArrowRight' && !inSearch)) {
        e.preventDefault();
        setNavigating(true);
        setSelected((s) => Math.min(s + 1, visible.length - 1));
      } else if (e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && !inSearch)) {
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
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen, visible, selected, copy, query]);

  // Everything is usually on a 30 s cycle, so one shared tick tells the time for the whole grid.
  const tickPeriod = 30;
  const tickRemaining = secondsRemaining(now, tickPeriod);

  return (
    <div className="vault" onPointerMove={navigating ? () => setNavigating(false) : undefined}>
      <nav className="nav" aria-label="Tick">
        <span className="brand">
          <Mark />
          Tick
        </span>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => setAddSource(compactQuery() ? 'camera' : 'screen')} aria-label="Add account">
          <PlusIcon />
          <span className="btn-label">Add account</span>
        </button>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings">
          <GearIcon />
        </button>
        <button className="icon-btn" onClick={lock} aria-label="Lock" title="Lock">
          <LockIcon />
        </button>
      </nav>

      <main className="page" ref={scope}>
        {empty ? (
          <EmptyVault onAdd={setAddSource} />
        ) : (
          <section className="hero">
            <div className="hero-title">
              <h1 className="display" data-reveal>
                Your codes
              </h1>
              {/* Text is written by useCountUp so React and GSAP never fight over the node. */}
              <span className="count" ref={countRef} data-rise aria-label={`${data.accounts.length} accounts`} />
            </div>
            <p className="lead" data-rise>
              Start typing to find an account. Press Enter to copy its code.
            </p>
            <div className="search" data-rise>
              <SearchIcon />
              <input
                ref={searchRef}
                type="search"
                placeholder="Search accounts"
                aria-label="Search codes"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus={!compactQuery()}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="go"
              />
              {query ? (
                <button className="icon-btn clear" aria-label="Clear search" onClick={() => setQuery('')}>
                  <CloseIcon />
                </button>
              ) : (
                <span className="kbd" aria-hidden="true">
                  <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>
                  <kbd>K</kbd>
                </span>
              )}
            </div>
            <div data-rise>
              <Tick period={tickPeriod} remaining={tickRemaining} counter={counterAt(now, tickPeriod)} ending={tickRemaining <= ENDING_SECONDS} />
            </div>
          </section>
        )}

        {vault.clockOffset !== 0 && (
          <div className="banner" role="status">
            <ClockIcon />
            <span>
              This computer’s clock is {Math.round(Math.abs(vault.clockOffset) / 1000)} s {vault.clockOffset > 0 ? 'behind' : 'ahead'}. Tick is
              using corrected time so your codes still work.
            </span>
          </div>
        )}

        {!empty && visible.length === 0 && (
          <motion.div className="empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
            <p className="headline">No accounts match “{query}”</p>
            <p className="body">Check the spelling, or add this account.</p>
            <button className="btn btn-soft" onClick={() => setAddSource('screen')}>
              <PlusIcon />
              Add Account
            </button>
          </motion.div>
        )}

        {!empty && (
          <ul className="grid" ref={gridRef}>
            <AnimatePresence initial={false}>
              {visible.map((account, i) => (
                <motion.li
                  key={account.id}
                  layout={!reduced}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
                  transition={softSpring}
                >
                  <AccountCard
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
          </ul>
        )}

        {!empty && (
          <motion.div className="hints" aria-hidden="true" layout={!reduced} transition={softSpring}>
            <span>
              <kbd>/</kbd>Search
            </span>
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd>Choose
            </span>
            <span>
              <kbd>↵</kbd>Copy
            </span>
          </motion.div>
        )}
      </main>
      <footer className="credit">
        <a href={metricDeckUrl('app_vault')} target="_blank" rel="noopener">
          A free tool by <strong>MetricDeck</strong>
        </a>
      </footer>

      <AddSheet source={addSource} onSourceChange={setAddSource} onClose={() => setAddSource(null)} />
      <EditSheet account={editing} onClose={() => setEditing(null)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

interface CardProps {
  account: Account;
  state: CodeState | undefined;
  selected: boolean;
  copied: boolean;
  onCopy: (a: Account, card?: HTMLElement | null) => void;
  onEdit: (a: Account) => void;
}

const AccountCard = memo(function AccountCard({ account, state, selected, copied, onCopy, onEdit }: CardProps) {
  const name = displayName(account);
  const ending = !!state && state.remaining <= ENDING_SECONDS;
  const placeholder = '0'.repeat(account.digits);
  return (
    <div className={`card-wrap${selected ? ' selected' : ''}`} data-account={account.id}>
      <button
        className="card"
        onClick={(e) => onCopy(account, e.currentTarget)}
        aria-label={`${name}${account.label && account.issuer ? `, ${account.label}` : ''}. Code ${groupCode(state?.current ?? '')}. Copy code`}
      >
        <span className="card-head">
          <Monogram name={name} />
          <span className="who">
            <span className="issuer">{name}</span>
            {account.issuer && account.label && <span className="account">{account.label}</span>}
          </span>
        </span>
        <span>
          <Odometer value={state?.current ?? placeholder} className={`code${copied ? ' copied' : ending ? ' ending' : ''}`} />
          <span className="next">
            <AnimatePresence>
              {ending && state && (
                <motion.span initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                  Next {groupCode(state.next)}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </span>
        <span className="status">
          <AnimatePresence initial={false}>
            {copied ? (
              <motion.span key="copied" className="copied-pill" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring}>
                <CheckIcon />
                Copied
              </motion.span>
            ) : (
              state && (
                <motion.span key="timer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Timer period={account.period} remaining={state.remaining} counter={state.counter} ending={ending} />
                </motion.span>
              )
            )}
          </AnimatePresence>
        </span>
      </button>
      <button className="icon-btn card-edit" onClick={() => onEdit(account)} aria-label={`Edit ${name}`} title="Edit">
        <EditIcon />
      </button>
    </div>
  );
});

function EmptyVault({ onAdd }: { onAdd: (source: AddSource) => void }) {
  return (
    <section className="hero">
      <h1 className="display" data-reveal>
        Add your first code.
      </h1>
      <p className="lead" data-rise>
        Open a site’s two-factor setup page and scan its QR code right off your screen, or bring everything over from your
        phone’s authenticator.
      </p>
      <div className="empty-actions" data-rise>
        <button className="btn btn-primary btn-lg" onClick={() => onAdd('screen')}>
          <ScreenIcon />
          Scan From Screen
        </button>
        <button className="btn btn-soft btn-lg" onClick={() => onAdd('image')}>
          <ImageIcon />
          Upload QR Image
        </button>
        <button className="btn btn-soft btn-lg" onClick={() => onAdd('link')}>
          <LinkIcon />
          Paste Link
        </button>
      </div>
      <div className="ghost-grid" aria-hidden="true" data-rise>
        <div className="ghost" />
        <div className="ghost" />
        <div className="ghost" />
      </div>
    </section>
  );
}
