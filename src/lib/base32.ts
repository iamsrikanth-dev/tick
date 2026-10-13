const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Uppercases and strips spaces, hyphens and padding so pasted secrets decode cleanly. */
export function normalizeBase32(input: string): string {
  return input.toUpperCase().replace(/[\s\-=]/g, '');
}

export function isValidBase32(input: string): boolean {
  const s = normalizeBase32(input);
  return s.length > 0 && /^[A-Z2-7]+$/.test(s);
}

export function base32Decode(input: string): Uint8Array {
  const s = normalizeBase32(input);
  if (!isValidBase32(s)) throw new Error('Secret contains characters outside A–Z and 2–7');
  const out = new Uint8Array(Math.floor((s.length * 5) / 8));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of s) {
    buffer = (buffer << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (buffer >>> bits) & 0xff;
    }
  }
  return out;
}

export function base32Encode(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}
