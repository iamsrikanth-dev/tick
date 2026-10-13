/** Rough password strength from length and variety: 0 (weak) to 4 (strong). */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!password) return { score: 0, label: '' };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  const uniqueRatio = new Set(password).size / password.length;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16 || (password.length >= 12 && classes >= 3)) score++;
  if (classes >= 2 && uniqueRatio > 0.5) score++;
  if (password.length < 8) score = Math.min(score, 1);
  const clamped = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  return { score: clamped, label: ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][clamped] };
}

/**
 * Estimates how far this computer's clock is from the server's, using the Date header of a
 * same-origin request. Returns milliseconds to add to Date.now(), or null when unknown.
 */
export async function measureClockOffset(): Promise<number | null> {
  try {
    const started = Date.now();
    const response = await fetch(`${location.origin}/?clock=${started}`, { method: 'HEAD', cache: 'no-store' });
    const ended = Date.now();
    const header = response.headers.get('date');
    if (!header) return null;
    const server = new Date(header).getTime();
    if (Number.isNaN(server)) return null;
    // The Date header has one-second resolution, so offsets under 3 seconds are noise.
    const offset = server + 500 - (started + ended) / 2;
    return Math.abs(offset) < 3000 ? 0 : offset;
  } catch {
    return null;
  }
}

export function downloadFile(name: string, contents: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function dateStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Soft background and strong foreground for a service monogram, stable per name. */
export function monogramColors(name: string, dark: boolean): { background: string; color: string } {
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return dark
    ? { background: `hsl(${hue} 28% 22%)`, color: `hsl(${hue} 85% 82%)` }
    : { background: `hsl(${hue} 70% 94%)`, color: `hsl(${hue} 60% 30%)` };
}

export function initial(name: string): string {
  const match = name.trim().match(/[\p{L}\p{N}]/u);
  return (match?.[0] ?? '?').toUpperCase();
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
