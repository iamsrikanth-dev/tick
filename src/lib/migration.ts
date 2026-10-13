import { base32Encode } from './base32';
import { ImportError, validateParams } from './otpauth';
import type { Algorithm, OtpParams } from './types';

// Google Authenticator's "Transfer accounts" QR codes carry an otpauth-migration:// link whose
// data parameter is a base64 protobuf (MigrationPayload). Only the fields we need are decoded.

interface Field {
  num: number;
  wire: number;
  value: number | Uint8Array;
}

function readVarint(buf: Uint8Array, pos: { i: number }): number {
  let result = 0;
  let shift = 0;
  while (pos.i < buf.length) {
    const byte = buf[pos.i++];
    result += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return result;
    shift += 7;
    if (shift > 63) break;
  }
  throw new ImportError('The transfer code is damaged.');
}

function readFields(buf: Uint8Array): Field[] {
  const fields: Field[] = [];
  const pos = { i: 0 };
  while (pos.i < buf.length) {
    const tag = readVarint(buf, pos);
    const num = Math.floor(tag / 8);
    const wire = tag & 7;
    if (wire === 0) {
      fields.push({ num, wire, value: readVarint(buf, pos) });
    } else if (wire === 2) {
      const len = readVarint(buf, pos);
      if (pos.i + len > buf.length) throw new ImportError('The transfer code is damaged.');
      fields.push({ num, wire, value: buf.subarray(pos.i, pos.i + len) });
      pos.i += len;
    } else if (wire === 1) {
      pos.i += 8;
    } else if (wire === 5) {
      pos.i += 4;
    } else {
      throw new ImportError('The transfer code is damaged.');
    }
  }
  return fields;
}

const ALGORITHMS: Record<number, Algorithm | undefined> = { 0: 'SHA1', 1: 'SHA1', 2: 'SHA256', 3: 'SHA512' };
const DIGITS: Record<number, number | undefined> = { 0: 6, 1: 6, 2: 8 };
const TEXT = new TextDecoder();

export interface MigrationResult {
  accounts: OtpParams[];
  skipped: number;
  batchIndex: number;
  batchSize: number;
}

function base64ToBytes(b64: string): Uint8Array {
  const normalized = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function isMigrationUri(text: string): boolean {
  return text.trim().toLowerCase().startsWith('otpauth-migration://');
}

export function parseMigrationUri(uri: string): MigrationResult {
  let data: string | null;
  try {
    data = new URL(uri.trim()).searchParams.get('data');
  } catch {
    throw new ImportError('That isn’t a valid transfer code.');
  }
  if (!data) throw new ImportError('The transfer code is empty.');
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(data);
  } catch {
    throw new ImportError('The transfer code is damaged.');
  }

  const result: MigrationResult = { accounts: [], skipped: 0, batchIndex: 0, batchSize: 1 };
  for (const field of readFields(bytes)) {
    if (field.num === 3 && typeof field.value === 'number') result.batchSize = field.value;
    if (field.num === 4 && typeof field.value === 'number') result.batchIndex = field.value;
    if (field.num !== 1 || !(field.value instanceof Uint8Array)) continue;

    let secret: Uint8Array | undefined;
    let name = '';
    let issuer = '';
    let algorithm: Algorithm | undefined = 'SHA1';
    let digits: number | undefined = 6;
    let type = 2;
    for (const f of readFields(field.value)) {
      if (f.num === 1 && f.value instanceof Uint8Array) secret = f.value;
      else if (f.num === 2 && f.value instanceof Uint8Array) name = TEXT.decode(f.value);
      else if (f.num === 3 && f.value instanceof Uint8Array) issuer = TEXT.decode(f.value);
      else if (f.num === 4 && typeof f.value === 'number') algorithm = ALGORITHMS[f.value];
      else if (f.num === 5 && typeof f.value === 'number') digits = DIGITS[f.value];
      else if (f.num === 6 && typeof f.value === 'number') type = f.value;
    }
    // Type 1 is HOTP. Unknown algorithms (MD5) and digit counts are skipped rather than guessed.
    if (!secret || type === 1 || !algorithm || !digits) {
      result.skipped++;
      continue;
    }
    // Names often arrive as "Issuer:account"; split them the same way otpauth labels are.
    let label = name;
    const colon = name.indexOf(':');
    if (colon !== -1) {
      if (!issuer) issuer = name.slice(0, colon).trim();
      label = name.slice(colon + 1).trim();
    }
    try {
      result.accounts.push(validateParams({ secret: base32Encode(secret), issuer, label, algorithm, digits, period: 30 }));
    } catch {
      result.skipped++;
    }
  }
  return result;
}
