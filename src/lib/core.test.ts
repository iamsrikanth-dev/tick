import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, normalizeBase32 } from './base32';
import { changePassword, createVault, saveVault, unlockVault, WrongPasswordError } from './crypto';
import { matchesQuery, mergeAccounts, parseImport } from './importers';
import { isMigrationUri, parseMigrationUri } from './migration';
import { buildOtpauthUri, ImportError, parseOtpauthUri } from './otpauth';
import { groupCode, hotp, secondsRemaining, totp } from './totp';
import { emptyVault } from './types';

const ascii = (s: string) => base32Encode(new TextEncoder().encode(s));

describe('base32', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64, 33, 7, 9]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });
  it('accepts lowercase, spaces, hyphens and padding', () => {
    expect(normalizeBase32('jbsw y3dp-ehpk 3pxp==')).toBe('JBSWY3DPEHPK3PXP');
    expect(base32Decode('jbsw y3dp ehpk 3pxp')).toEqual(base32Decode('JBSWY3DPEHPK3PXP'));
  });
  it('rejects invalid characters', () => {
    expect(() => base32Decode('ABC1')).toThrow();
  });
});

describe('HOTP (RFC 4226 appendix D)', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  const secret = ascii('12345678901234567890');
  expected.forEach((code, counter) => {
    it(`counter ${counter}`, async () => {
      expect(await hotp(secret, counter)).toBe(code);
    });
  });
});

describe('TOTP (RFC 6238 appendix B)', () => {
  const secrets = {
    SHA1: ascii('12345678901234567890'),
    SHA256: ascii('12345678901234567890123456789012'),
    SHA512: ascii('1234567890123456789012345678901234567890123456789012345678901234'),
  } as const;
  const vectors: [number, string, string, string][] = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ];
  for (const [t, sha1, sha256, sha512] of vectors) {
    it(`time ${t}`, async () => {
      const at = t * 1000;
      expect(await totp({ secret: secrets.SHA1, algorithm: 'SHA1', digits: 8, period: 30 }, at)).toBe(sha1);
      expect(await totp({ secret: secrets.SHA256, algorithm: 'SHA256', digits: 8, period: 30 }, at)).toBe(sha256);
      expect(await totp({ secret: secrets.SHA512, algorithm: 'SHA512', digits: 8, period: 30 }, at)).toBe(sha512);
    });
  }
  it('reports seconds remaining', () => {
    expect(secondsRemaining(59_000, 30)).toBe(1);
    expect(secondsRemaining(60_000, 30)).toBe(30);
  });
  it('groups codes for reading', () => {
    expect(groupCode('123456')).toBe('123 456');
    expect(groupCode('12345678')).toBe('1234 5678');
  });
});

describe('otpauth links', () => {
  it('parses a typical link', () => {
    const p = parseOtpauthUri('otpauth://totp/GitHub:srikanth%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub');
    expect(p).toEqual({ issuer: 'GitHub', label: 'srikanth@example.com', secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA1', digits: 6, period: 30 });
  });
  it('takes the issuer from the label when the parameter is missing', () => {
    expect(parseOtpauthUri('otpauth://totp/ACME%20Co:john?secret=JBSWY3DPEHPK3PXP').issuer).toBe('ACME Co');
  });
  it('reads algorithm, digits and period', () => {
    const p = parseOtpauthUri('otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256&digits=8&period=60');
    expect([p.algorithm, p.digits, p.period]).toEqual(['SHA256', 8, 60]);
  });
  it('rejects HOTP and missing secrets', () => {
    expect(() => parseOtpauthUri('otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=1')).toThrow(ImportError);
    expect(() => parseOtpauthUri('otpauth://totp/x')).toThrow(/no secret/);
  });
  it('round-trips through buildOtpauthUri', () => {
    const p = { issuer: 'Ex Ample', label: 'me:you', secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA512' as const, digits: 8, period: 60 };
    expect(parseOtpauthUri(buildOtpauthUri(p))).toEqual(p);
  });
});

// Minimal protobuf writer, used only to build Google Authenticator transfer payloads for tests.
function varint(n: number): number[] {
  const out: number[] = [];
  while (n > 127) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}
const field = (num: number, bytes: Uint8Array | number[]) => [...varint(num * 8 + 2), ...varint(bytes.length), ...bytes];
const intField = (num: number, value: number) => [...varint(num * 8), ...varint(value)];

function migrationUri(entries: { secret: string; name: string; issuer: string; algorithm?: number; digits?: number; type?: number }[]) {
  const te = new TextEncoder();
  const payload: number[] = [];
  for (const e of entries) {
    const otp = [
      ...field(1, te.encode(e.secret)),
      ...field(2, te.encode(e.name)),
      ...field(3, te.encode(e.issuer)),
      ...intField(4, e.algorithm ?? 1),
      ...intField(5, e.digits ?? 1),
      ...intField(6, e.type ?? 2),
    ];
    payload.push(...field(1, otp));
  }
  payload.push(...intField(2, 1), ...intField(3, 1), ...intField(4, 0));
  const b64 = btoa(String.fromCharCode(...payload));
  return `otpauth-migration://offline?data=${encodeURIComponent(b64)}`;
}

describe('Google Authenticator transfer codes', () => {
  it('decodes accounts and skips HOTP', () => {
    const uri = migrationUri([
      { secret: 'Hello!Þ­', name: 'GitHub:me@example.com', issuer: '' },
      { secret: 'abcdefghij', name: 'alice', issuer: 'Slack', algorithm: 2, digits: 2 },
      { secret: 'abcdefghij', name: 'counter', issuer: 'Old', type: 1 },
    ]);
    expect(isMigrationUri(uri)).toBe(true);
    const result = parseMigrationUri(uri);
    expect(result.skipped).toBe(1);
    expect(result.accounts.map((a) => [a.issuer, a.label, a.algorithm, a.digits])).toEqual([
      ['GitHub', 'me@example.com', 'SHA1', 6],
      ['Slack', 'alice', 'SHA256', 8],
    ]);
    expect(result.accounts[1].secret).toBe(ascii('abcdefghij'));
  });
});

describe('importers', () => {
  it('reads a list of links', () => {
    const r = parseImport('otpauth://totp/A:a?secret=JBSWY3DPEHPK3PXP\n\notpauth://totp/B:b?secret=KRSXG5CTMVRXEZLU\nnonsense');
    expect(r.kind === 'accounts' && [r.accounts.length, r.skipped]).toEqual([2, 1]);
  });
  it('reads an Aegis plain export', () => {
    const aegis = { version: 1, header: { slots: null, params: null }, db: { version: 2, entries: [
      { type: 'totp', name: 'me', issuer: 'Proton', info: { secret: 'JBSWY3DPEHPK3PXP', algo: 'SHA1', digits: 6, period: 30 } },
      { type: 'hotp', name: 'x', issuer: 'y', info: { secret: 'JBSWY3DPEHPK3PXP' } },
    ] } };
    const r = parseImport(JSON.stringify(aegis));
    expect(r.kind === 'accounts' && [r.source, r.accounts[0].issuer, r.skipped]).toEqual(['Aegis', 'Proton', 1]);
  });
  it('refuses encrypted Aegis and 2FAS exports with a clear message', () => {
    expect(() => parseImport(JSON.stringify({ header: { slots: [{}] }, db: 'xyz' }))).toThrow(/encrypted/);
    expect(() => parseImport(JSON.stringify({ services: [], servicesEncrypted: 'abc' }))).toThrow(/encrypted/);
  });
  it('reads a 2FAS export', () => {
    const r = parseImport(JSON.stringify({ schemaVersion: 4, services: [
      { name: 'Dropbox', secret: 'JBSWY3DPEHPK3PXP', otp: { account: 'me', digits: 6, period: 30, algorithm: 'SHA1', tokenType: 'TOTP' } },
    ] }));
    expect(r.kind === 'accounts' && [r.accounts[0].issuer, r.accounts[0].label]).toEqual(['Dropbox', 'me']);
  });
  it('merges without duplicates', () => {
    const p = parseOtpauthUri('otpauth://totp/A:a?secret=JBSWY3DPEHPK3PXP');
    const first = mergeAccounts([], [p, p]);
    expect([first.added, first.duplicates]).toEqual([1, 1]);
    expect(mergeAccounts(first.accounts, [p]).added).toBe(0);
  });
  it('searches across issuer and label', () => {
    const a = { issuer: 'GitHub', label: 'work@acme.com' };
    expect(matchesQuery(a, 'git')).toBe(true);
    expect(matchesQuery(a, 'git acme')).toBe(true);
    expect(matchesQuery(a, 'slack')).toBe(false);
  });
});

describe('vault encryption', () => {
  const ITER = 1000; // fast for tests; the app uses 600,000
  it('round-trips data and rejects a wrong password', async () => {
    const data = emptyVault();
    data.accounts.push({ id: '1', createdAt: 0, ...parseOtpauthUri('otpauth://totp/A:a?secret=JBSWY3DPEHPK3PXP') });
    const { record } = await createVault('correct horse', data, ITER);
    expect(JSON.stringify(record)).not.toContain('JBSWY3DPEHPK3PXP');
    const { data: opened } = await unlockVault(record, 'correct horse');
    expect(opened).toEqual(data);
    await expect(unlockVault(record, 'wrong')).rejects.toBeInstanceOf(WrongPasswordError);
  });
  it('saves new data and changes the password', async () => {
    const created = await createVault('one', emptyVault(), ITER);
    const next = emptyVault();
    next.settings.autoLockMinutes = 15;
    const saved = await saveVault(created, next);
    const changed = await changePassword(saved, 'one', 'two', ITER);
    await expect(unlockVault(changed.record, 'one')).rejects.toBeInstanceOf(WrongPasswordError);
    expect((await unlockVault(changed.record, 'two')).data.settings.autoLockMinutes).toBe(15);
    await expect(changePassword(saved, 'nope', 'three', ITER)).rejects.toBeInstanceOf(WrongPasswordError);
  });
});
