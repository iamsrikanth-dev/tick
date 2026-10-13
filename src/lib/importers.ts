import { isVaultRecord, type VaultRecord } from './crypto';
import { isMigrationUri, parseMigrationUri } from './migration';
import { ImportError, parseAlgorithm, parseOtpauthUri, validateParams } from './otpauth';
import type { Account, OtpParams } from './types';

export type ImportResult =
  | { kind: 'accounts'; accounts: OtpParams[]; skipped: number; source: string }
  | { kind: 'backup'; record: VaultRecord };

/** Reads anything a person might paste, scan or drop: links, transfer codes and export files. */
export function parseImport(text: string): ImportResult {
  const trimmed = text.trim();
  if (!trimmed) throw new ImportError('There’s nothing to import.');

  if (trimmed.startsWith('{')) return parseJson(trimmed);

  const lines = trimmed.split(/\s+/).filter(Boolean);
  const accounts: OtpParams[] = [];
  let skipped = 0;
  let sawMigration = false;
  let lastError: unknown;
  for (const line of lines) {
    try {
      if (isMigrationUri(line)) {
        sawMigration = true;
        const result = parseMigrationUri(line);
        accounts.push(...result.accounts);
        skipped += result.skipped;
      } else if (line.toLowerCase().startsWith('otpauth://')) {
        accounts.push(parseOtpauthUri(line));
      } else {
        skipped++;
      }
    } catch (error) {
      lastError = error;
      skipped++;
    }
  }
  if (accounts.length === 0) {
    if (lastError instanceof ImportError) throw lastError;
    throw new ImportError('No codes found. Paste an otpauth:// link or upload a QR code.');
  }
  return { kind: 'accounts', accounts, skipped, source: sawMigration ? 'Google Authenticator' : 'link' };
}

interface AegisEntry {
  type?: string;
  name?: string;
  issuer?: string;
  info?: { secret?: string; algo?: string; digits?: number; period?: number };
}

interface TwoFasService {
  name?: string;
  secret?: string;
  otp?: { issuer?: string; account?: string; label?: string; digits?: number; period?: number; algorithm?: string; tokenType?: string };
}

function parseJson(text: string): ImportResult {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError('That file isn’t valid JSON.');
  }

  if (isVaultRecord(json)) return { kind: 'backup', record: json };

  // Aegis: { header: { slots }, db: { entries } }. An encrypted export has slots and a string db.
  if ('db' in json && 'header' in json) {
    const header = json.header as { slots?: unknown };
    if (header?.slots || typeof json.db === 'string') {
      throw new ImportError('This Aegis export is encrypted. Export again from Aegis without encryption.');
    }
    const entries = ((json.db as { entries?: AegisEntry[] })?.entries ?? []) as AegisEntry[];
    return collect('Aegis', entries, (e) => {
      if ((e.type ?? 'totp').toLowerCase() !== 'totp') return null;
      return validateParams({
        secret: e.info?.secret ?? '',
        issuer: e.issuer,
        label: e.name,
        algorithm: parseAlgorithm(e.info?.algo),
        digits: e.info?.digits,
        period: e.info?.period,
      });
    });
  }

  // 2FAS: { services: [...], servicesEncrypted? }
  if ('services' in json || 'servicesEncrypted' in json) {
    if (json.servicesEncrypted) {
      throw new ImportError('This 2FAS backup is encrypted. Export again from 2FAS without a password.');
    }
    const services = (json.services ?? []) as TwoFasService[];
    return collect('2FAS', services, (s) => {
      if ((s.otp?.tokenType ?? 'TOTP').toUpperCase() !== 'TOTP') return null;
      return validateParams({
        secret: s.secret ?? '',
        issuer: s.otp?.issuer || s.name,
        label: s.otp?.account || s.otp?.label || '',
        algorithm: parseAlgorithm(s.otp?.algorithm),
        digits: s.otp?.digits,
        period: s.otp?.period,
      });
    });
  }

  throw new ImportError('This file format isn’t supported. Try an Aegis, 2FAS or Tick export, or a list of otpauth links.');
}

function collect<T>(source: string, items: T[], map: (item: T) => OtpParams | null): ImportResult {
  const accounts: OtpParams[] = [];
  let skipped = 0;
  for (const item of items) {
    try {
      const params = map(item);
      if (params) accounts.push(params);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  if (accounts.length === 0) throw new ImportError(`No time-based codes found in this ${source} export.`);
  return { kind: 'accounts', accounts, skipped, source };
}

export function newAccount(params: OtpParams, now = Date.now()): Account {
  return { ...params, id: crypto.randomUUID(), createdAt: now };
}

/** Adds accounts whose secret isn't already in the vault. */
export function mergeAccounts(existing: Account[], incoming: OtpParams[]): { accounts: Account[]; added: number; duplicates: number } {
  const seen = new Set(existing.map((a) => `${a.secret}:${a.algorithm}:${a.digits}:${a.period}`));
  const added: Account[] = [];
  let duplicates = 0;
  for (const params of incoming) {
    const key = `${params.secret}:${params.algorithm}:${params.digits}:${params.period}`;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    added.push(newAccount(params));
  }
  return { accounts: [...existing, ...added], added: added.length, duplicates };
}

export function sortAccounts(accounts: Account[]): Account[] {
  return [...accounts].sort((a, b) => displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' }));
}

export function displayName(a: Pick<OtpParams, 'issuer' | 'label'>): string {
  return a.issuer || a.label;
}

/** Case-insensitive match on issuer and label; every word in the query must match. */
export function matchesQuery(a: Pick<OtpParams, 'issuer' | 'label'>, query: string): boolean {
  const haystack = `${a.issuer} ${a.label}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
