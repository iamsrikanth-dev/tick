import type { VaultData } from './types';

// The vault is encrypted with a random 256-bit data key (AES-GCM). That data key is wrapped with
// a key derived from the master password (PBKDF2-SHA256), so changing the password only re-wraps
// the data key. Nothing readable is ever written to storage.

export const PBKDF2_ITERATIONS = 600_000;

export interface Sealed {
  iv: string;
  ct: string;
}

export interface VaultRecord {
  app: 'tick';
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  wrappedKey: Sealed;
  data: Sealed;
}

export class WrongPasswordError extends Error {
  constructor() {
    super('That password isn’t right.');
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function deriveKek(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function seal(key: CryptoKey, plain: Uint8Array): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource);
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

async function open(key: CryptoKey, sealed: Sealed): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.iv) as BufferSource },
    key,
    fromBase64(sealed.ct) as BufferSource,
  );
  return new Uint8Array(plain);
}

async function importDataKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** An unlocked vault session: the data key lives only in memory. */
export interface Session {
  dataKey: CryptoKey;
  record: VaultRecord;
}

export async function createVault(
  password: string,
  data: VaultData,
  iterations = PBKDF2_ITERATIONS,
): Promise<Session> {
  const salt = randomBytes(16);
  const rawDataKey = randomBytes(32);
  const kek = await deriveKek(password, salt, iterations);
  const dataKey = await importDataKey(rawDataKey);
  const record: VaultRecord = {
    app: 'tick',
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    wrappedKey: await seal(kek, rawDataKey),
    data: await seal(dataKey, enc.encode(JSON.stringify(data))),
  };
  rawDataKey.fill(0);
  return { dataKey, record };
}

export async function unlockVault(record: VaultRecord, password: string): Promise<{ session: Session; data: VaultData }> {
  const kek = await deriveKek(password, fromBase64(record.kdf.salt), record.kdf.iterations);
  let rawDataKey: Uint8Array;
  try {
    rawDataKey = await open(kek, record.wrappedKey);
  } catch {
    throw new WrongPasswordError();
  }
  const dataKey = await importDataKey(rawDataKey);
  rawDataKey.fill(0);
  const data = JSON.parse(dec.decode(await open(dataKey, record.data))) as VaultData;
  return { session: { dataKey, record }, data };
}

export async function saveVault(session: Session, data: VaultData): Promise<Session> {
  const record: VaultRecord = { ...session.record, data: await seal(session.dataKey, enc.encode(JSON.stringify(data))) };
  return { dataKey: session.dataKey, record };
}

/** Re-wraps the data key under a new password. The encrypted accounts stay as they are. */
export async function changePassword(
  session: Session,
  currentPassword: string,
  newPassword: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<Session> {
  const oldKek = await deriveKek(currentPassword, fromBase64(session.record.kdf.salt), session.record.kdf.iterations);
  let rawDataKey: Uint8Array;
  try {
    rawDataKey = await open(oldKek, session.record.wrappedKey);
  } catch {
    throw new WrongPasswordError();
  }
  const salt = randomBytes(16);
  const kek = await deriveKek(newPassword, salt, iterations);
  const record: VaultRecord = {
    ...session.record,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    wrappedKey: await seal(kek, rawDataKey),
  };
  rawDataKey.fill(0);
  return { dataKey: session.dataKey, record };
}

export function isVaultRecord(value: unknown): value is VaultRecord {
  const v = value as VaultRecord;
  return (
    !!v &&
    v.app === 'tick' &&
    v.v === 1 &&
    v.kdf?.name === 'PBKDF2' &&
    typeof v.kdf.salt === 'string' &&
    typeof v.wrappedKey?.ct === 'string' &&
    typeof v.data?.ct === 'string'
  );
}
