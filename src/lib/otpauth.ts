import { isValidBase32, normalizeBase32 } from './base32';
import type { Algorithm, OtpParams } from './types';

export class ImportError extends Error {}

const ALGORITHMS: Algorithm[] = ['SHA1', 'SHA256', 'SHA512'];

export function parseAlgorithm(value: string | null | undefined): Algorithm {
  if (!value) return 'SHA1';
  const upper = value.toUpperCase().replace('-', '');
  if ((ALGORITHMS as string[]).includes(upper)) return upper as Algorithm;
  throw new ImportError(`Unsupported algorithm ${value}`);
}

/** Checks the fields every account needs and fills defaults. */
export function validateParams(input: Partial<OtpParams> & { secret: string }): OtpParams {
  const secret = normalizeBase32(input.secret);
  if (!isValidBase32(secret)) throw new ImportError('The secret isn’t valid. It should only contain letters A–Z and digits 2–7.');
  if (secret.length < 8) throw new ImportError('The secret is too short.');
  const digits = input.digits ?? 6;
  if (![6, 7, 8].includes(digits)) throw new ImportError('Codes must have 6, 7 or 8 digits.');
  const period = input.period ?? 30;
  if (!Number.isInteger(period) || period < 1 || period > 300) throw new ImportError('The refresh period must be 1–300 seconds.');
  const issuer = (input.issuer ?? '').trim();
  const label = (input.label ?? '').trim();
  if (!issuer && !label) throw new ImportError('Add a service name.');
  return { issuer, label, secret, algorithm: input.algorithm ?? 'SHA1', digits, period };
}

/** Parses an otpauth://totp/... link as defined by Google's Key URI format. */
export function parseOtpauthUri(uri: string): OtpParams {
  let url: URL;
  try {
    url = new URL(uri.trim());
  } catch {
    throw new ImportError('That isn’t a valid otpauth link.');
  }
  if (url.protocol !== 'otpauth:') throw new ImportError('That isn’t an otpauth link.');
  // Browsers put the type in host or pathname depending on how they parse custom schemes.
  const typeAndPath = `${url.host}${url.pathname}`.replace(/^\/+/, '');
  const slash = typeAndPath.indexOf('/');
  const type = (slash === -1 ? typeAndPath : typeAndPath.slice(0, slash)).toLowerCase();
  if (type === 'hotp') throw new ImportError('Counter-based (HOTP) codes aren’t supported yet.');
  if (type !== 'totp') throw new ImportError('Only time-based (TOTP) links are supported.');

  const rawLabel = decodeURIComponent(slash === -1 ? '' : typeAndPath.slice(slash + 1));
  const colon = rawLabel.indexOf(':');
  const labelIssuer = colon === -1 ? '' : rawLabel.slice(0, colon).trim();
  const label = (colon === -1 ? rawLabel : rawLabel.slice(colon + 1)).trim();

  const params = url.searchParams;
  const secret = params.get('secret');
  if (!secret) throw new ImportError('The link has no secret.');
  return validateParams({
    secret,
    issuer: params.get('issuer')?.trim() || labelIssuer,
    label,
    algorithm: parseAlgorithm(params.get('algorithm')),
    digits: params.has('digits') ? Number(params.get('digits')) : 6,
    period: params.has('period') ? Number(params.get('period')) : 30,
  });
}

export function buildOtpauthUri(p: OtpParams): string {
  const name = p.issuer ? `${p.issuer}:${p.label}` : p.label;
  const query = new URLSearchParams({ secret: p.secret });
  if (p.issuer) query.set('issuer', p.issuer);
  if (p.algorithm !== 'SHA1') query.set('algorithm', p.algorithm);
  if (p.digits !== 6) query.set('digits', String(p.digits));
  if (p.period !== 30) query.set('period', String(p.period));
  return `otpauth://totp/${encodeURIComponent(name)}?${query.toString()}`;
}
