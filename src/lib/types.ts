export type Algorithm = 'SHA1' | 'SHA256' | 'SHA512';

/** What an importer or the add flow produces before it becomes a stored account. */
export interface OtpParams {
  issuer: string;
  label: string;
  /** Normalized base32, no spaces or padding. */
  secret: string;
  algorithm: Algorithm;
  digits: number;
  period: number;
}

export interface Account extends OtpParams {
  id: string;
  createdAt: number;
}

export interface Settings {
  autoLockMinutes: number;
  /** 0 turns clipboard clearing off. */
  clearClipboardSeconds: number;
}

export interface VaultData {
  version: 1;
  accounts: Account[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  autoLockMinutes: 5,
  clearClipboardSeconds: 30,
};

export function emptyVault(): VaultData {
  return { version: 1, accounts: [], settings: { ...DEFAULT_SETTINGS } };
}
