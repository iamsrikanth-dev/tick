import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { initial, monogramColors } from '../lib/util';
import { CheckCircleIcon, CloseIcon } from './icons';

export const spring = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 } as const;
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 } as const;

const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
export function usePrefersDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      darkQuery?.addEventListener('change', cb);
      return () => darkQuery?.removeEventListener('change', cb);
    },
    () => darkQuery?.matches ?? false,
  );
}

const compactQuery = typeof window !== 'undefined' ? window.matchMedia('(max-width: 600px)') : null;
export function useCompact(): boolean {
  return useSyncExternalStore(
    (cb) => {
      compactQuery?.addEventListener('change', cb);
      return () => compactQuery?.removeEventListener('change', cb);
    },
    () => compactQuery?.matches ?? false,
  );
}

export function Monogram({ name }: { name: string }) {
  const dark = usePrefersDark();
  return (
    <span className="monogram" style={monogramColors(name, dark)} aria-hidden="true">
      {initial(name)}
    </span>
  );
}

/* ---------- Sheet ---------- */

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Shown left of the close button, e.g. a Back button. */
  leading?: ReactNode;
}

/** A focused, dismissible task: centered panel on desktop, bottom sheet on compact widths. */
export function Sheet({ open, title, onClose, children, leading }: SheetProps) {
  const compact = useCompact();
  const reduced = useReducedMotion();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab' && panel.current) {
        // Keep focus inside the sheet while it is open.
        const focusable = panel.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => {
      const target = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current;
      target?.focus();
    });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      restoreFocus.current?.focus?.();
    };
  }, [open, onClose]);

  const hidden = reduced ? { opacity: 0 } : compact ? { y: '100%' } : { opacity: 0, scale: 0.96, y: 12 };

  return (
    <AnimatePresence>
      {open && (
        <>
          <Scrim key="scrim" onClose={onClose} />
          <div className="sheet-wrap" key="sheet">
            <Panel
              ref={panel}
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              initial={hidden}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={hidden}
              transition={reduced ? { duration: 0.15 } : spring}
              drag={compact && !reduced ? 'y' : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 120 || info.velocity.y > 600) onClose();
              }}
            >
              <div className="grabber" aria-hidden="true" />
              <div className="sheet-head">
                {leading}
                <h2 className="headline" id={titleId}>
                  {title}
                </h2>
                <button className="icon-btn" onClick={onClose} aria-label="Close">
                  <CloseIcon />
                </button>
              </div>
              <div className="sheet-body">{children}</div>
            </Panel>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// While a sheet animates out, it must not catch clicks meant for the page underneath.
function Scrim({ onClose }: { onClose: () => void }) {
  const present = useIsPresent();
  return (
    <motion.div
      className="scrim"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ pointerEvents: present ? 'auto' : 'none' }}
      onClick={present ? onClose : undefined}
    />
  );
}

const Panel = function Panel({ ref, style, ...props }: React.ComponentProps<typeof motion.div>) {
  const present = useIsPresent();
  return <motion.div ref={ref} {...props} style={{ ...style, pointerEvents: present ? 'auto' : 'none' }} />;
};

/* ---------- Segmented control ---------- */

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  const id = useId();
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.value === value && <motion.span layoutId={`thumb-${id}`} className="thumb" transition={spring} />}
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Toasts ---------- */

interface Toast {
  id: number;
  title: string;
  sub?: string;
  action?: { label: string; run: () => void };
}

type ShowToast = (toast: Omit<Toast, 'id'>, ms?: number) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const reduced = useReducedMotion();

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback<ShowToast>(
    (toast, ms = 2600) => {
      const id = nextId.current++;
      // One toast at a time keeps feedback calm when people copy several codes quickly.
      setToasts([{ ...toast, id }]);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              className="toast"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={reduced ? { duration: 0.12 } : spring}
            >
              <CheckCircleIcon />
              <span>
                {t.title}
                {t.sub && <span className="sub"> · {t.sub}</span>}
              </span>
              {t.action ? (
                <button
                  className="btn btn-plain"
                  onClick={() => {
                    t.action?.run();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              ) : (
                <span style={{ width: 4 }} />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
