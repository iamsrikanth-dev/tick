import { createContext, useContext } from 'react';
import type { VaultRecord } from './lib/crypto';
import type { VaultData } from './lib/types';

export interface VaultApi {
  data: VaultData;
  /** Applies a change and saves the re-encrypted vault. */
  update: (change: (data: VaultData) => VaultData) => Promise<void>;
  lock: () => void;
  erase: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  /** The encrypted record as stored, for backups. */
  record: () => VaultRecord;
  /** Milliseconds to add to Date.now() to correct this computer's clock. */
  clockOffset: number;
}

export const VaultContext = createContext<VaultApi | null>(null);

export function useVault(): VaultApi {
  const api = useContext(VaultContext);
  if (!api) throw new Error('useVault outside an unlocked vault');
  return api;
}
