/**
 * Email helpers. Pure and client-safe (the address field hints as you type).
 * A hint is never proof of anything: the inbox code remains the only check
 * that an address belongs to the person typing it.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

/** What we store and compare: trimmed, lower case. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidEmail(input: string): boolean {
  const value = normalizeEmail(input);
  if (value.length === 0 || value.length > 254) return false;
  if (value.includes('..')) return false;
  return EMAIL_RE.test(value);
}

/** Providers a mistyped domain is usually meant to be. */
const KNOWN_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'aol.com',
  'gmx.com',
  'mail.com',
  'emirates.net.ae',
  'eim.ae',
] as const;

/**
 * Damerau-Levenshtein distance: a swapped pair ("gmial") counts as one
 * mistake, not two, which is what makes the hint useful for typos fingers
 * actually make. Three rolling rows, so no 2D indexing and no assertions.
 */
function row(length: number, fill: number): number[] {
  return new Array<number>(length).fill(fill);
}

function cell(line: number[], index: number): number {
  return line[index] ?? 0;
}

export function editDistance(a: string, b: string): number {
  const cols = b.length + 1;
  let beforePrevious = row(cols, 0);
  let previous = row(cols, 0);
  let current = row(cols, 0);
  for (let j = 0; j < cols; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        cell(previous, j) + 1,
        cell(current, j - 1) + 1,
        cell(previous, j - 1) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, cell(beforePrevious, j - 2) + 1);
      }
      current[j] = value;
    }
    beforePrevious = previous;
    previous = current;
    current = row(cols, 0);
  }
  return cell(previous, b.length);
}

/**
 * "Did you mean ...?" for the domain only, one suggestion, never blocking.
 * Returns null when the address is already fine or the guess would be a reach.
 */
export function suggestEmailFix(input: string): string | null {
  const value = normalizeEmail(input);
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (domain.length === 0 || !domain.includes('.')) return null;
  if ((KNOWN_DOMAINS as readonly string[]).includes(domain)) return null;

  let best: string | null = null;
  let bestDistance = 3;
  for (const known of KNOWN_DOMAINS) {
    const distance = editDistance(domain, known);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = known;
    }
  }
  if (best === null || bestDistance > 2) return null;
  return `${local}@${best}`;
}
