import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToastProvider } from './components/ui';
import {
  changePassword as rewrapPassword,
  createVault,
  saveVault,
  unlockVault,
  type Session,
  type VaultRecord,
} from './lib/crypto';
import { eraseRecord, loadRecord, requestPersistence, storeRecord } from './lib/storage';
import { clearKeyCache } from './lib/totp';
import { emptyVault, type VaultData } from './lib/types';
import { measureClockOffset } from './lib/util';
import { SetupScreen } from './screens/Setup';
import { UnlockScreen } from './screens/Unlock';
import { VaultScreen } from './screens/Vault';
import { VaultContext, type VaultApi } from './vault-context';

type Phase =
  | { name: 'loading' }
  | { name: 'setup' }
  | { name: 'locked'; record: VaultRecord }
  | { name: 'unlocked'; session: Session; data: VaultData };

export function App() {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [clockOffset, setClockOffset] = useState(0);
  // Saves run one after another so a fast second edit can't overwrite a slower first one.
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const sessionRef = useRef<Session | null>(null);
  const dataRef = useRef<VaultData | null>(null);

  useEffect(() => {
    loadRecord()
      .then((record) => setPhase(record ? { name: 'locked', record } : { name: 'setup' }))
      .catch(() => setPhase({ name: 'setup' }));
    measureClockOffset().then((offset) => offset !== null && setClockOffset(offset));
  }, []);

  const enter = useCallback((session: Session, data: VaultData) => {
    sessionRef.current = session;
    dataRef.current = data;
    setPhase({ name: 'unlocked', session, data });
    requestPersistence();
  }, []);

  const create = useCallback(
    async (password: string) => {
      const session = await createVault(password, emptyVault());
      await storeRecord(session.record);
      enter(session, emptyVault());
    },
    [enter],
  );

  const unlock = useCallback(
    async (record: VaultRecord, password: string) => {
      const { session, data } = await unlockVault(record, password);
      enter(session, data);
    },
    [enter],
  );

  const lock = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    dataRef.current = null;
    clearKeyCache();
    setPhase(session ? { name: 'locked', record: session.record } : { name: 'setup' });
  }, []);

  const erase = useCallback(async () => {
    await eraseRecord();
    sessionRef.current = null;
    dataRef.current = null;
    clearKeyCache();
    setPhase({ name: 'setup' });
  }, []);

  const api = useMemo<VaultApi | null>(() => {
    if (phase.name !== 'unlocked') return null;
    return {
      data: phase.data,
      clockOffset,
      lock,
      erase,
      record: () => sessionRef.current!.record,
      update: (change) => {
        const run = saveQueue.current.then(async () => {
          const session = sessionRef.current;
          const current = dataRef.current;
          if (!session || !current) return;
          const nextData = change(current);
          dataRef.current = nextData;
          setPhase((p) => (p.name === 'unlocked' ? { ...p, data: nextData } : p));
          const saved = await saveVault(session, nextData);
          await storeRecord(saved.record);
          sessionRef.current = saved;
        });
        saveQueue.current = run.catch(() => {});
        return run;
      },
      changePassword: async (current, next) => {
        const session = sessionRef.current;
        if (!session) return;
        const changed = await rewrapPassword(session, current, next);
        await storeRecord(changed.record);
        sessionRef.current = changed;
      },
    };
  }, [phase, clockOffset, lock, erase]);

  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <AnimatePresence mode="wait">
          {phase.name === 'setup' && (
            <Screen key="setup">
              <SetupScreen onCreate={create} />
            </Screen>
          )}
          {phase.name === 'locked' && (
            <Screen key="locked">
              <UnlockScreen onUnlock={(pw) => unlock(phase.record, pw)} onErase={erase} />
            </Screen>
          )}
          {phase.name === 'unlocked' && api && (
            <Screen key="vault">
              <VaultContext.Provider value={api}>
                <VaultScreen />
              </VaultContext.Provider>
            </Screen>
          )}
        </AnimatePresence>
      </ToastProvider>
    </MotionConfig>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      style={{ minHeight: '100%' }}
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.01, filter: 'blur(4px)' }}
      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
