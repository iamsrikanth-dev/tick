import { base32Decode } from './base32';
import type { Algorithm, OtpParams } from './types';

const HASH: Record<Algorithm, string> = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' };

// Importing an HMAC key is the slow part, so keys are cached per secret and algorithm.
const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string, algorithm: Algorithm): Promise<CryptoKey> {
  const cacheKey = `${algorithm}:${secret}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    const raw = base32Decode(secret);
    key = crypto.subtle.importKey('raw', raw as BufferSource, { name: 'HMAC', hash: HASH[algorithm] }, false, [
      'sign',
    ]);
    keyCache.set(cacheKey, key);
  }
  return key;
}

export function clearKeyCache(): void {
  keyCache.clear();
}

/** RFC 4226 HOTP value for a counter. */
export async function hotp(secret: string, counter: number, algorithm: Algorithm = 'SHA1', digits = 6): Promise<string> {
  const message = new ArrayBuffer(8);
  const view = new DataView(message);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret, algorithm), message));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function counterAt(timeMs: number, period: number): number {
  return Math.floor(timeMs / 1000 / period);
}

/** RFC 6238 TOTP code at a given time. */
export function totp(params: Pick<OtpParams, 'secret' | 'algorithm' | 'digits' | 'period'>, timeMs: number): Promise<string> {
  return hotp(params.secret, counterAt(timeMs, params.period), params.algorithm, params.digits);
}

/** Seconds left in the current period, as a fraction-friendly float. */
export function secondsRemaining(timeMs: number, period: number): number {
  const elapsed = (timeMs / 1000) % period;
  return period - elapsed;
}

/** Groups a code for reading: 123456 → "123 456", 12345678 → "1234 5678". */
export function groupCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  if (code.length === 7) return `${code.slice(0, 3)} ${code.slice(3)}`;
  return code;
}
