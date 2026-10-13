/**
 * Email typo hints ("did you mean ...@gmail.com?"). Pure functions — safe to
 * import in client components for instant feedback. A hint is NEVER proof;
 * the inbox OTP code remains the only ownership check.
 */
const KNOWN_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "outlook.co.uk",
  "icloud.com",
  "me.com",
  "protonmail.com",
  "proton.me",
  "zoho.com",
  "aol.com",
];

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const up = prev[j] ?? 0;
      const left = prev[j - 1] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(up + 1, left + 1, diag + cost);
      diag = up;
    }
  }
  return prev[b.length] ?? 0;
}

/**
 * Returns a corrected email when the domain is within 2 edits of a well-known
 * provider, else null. Non-blocking hint — the user may keep what they typed.
 */
export function suggestEmailFix(email: string): string | null {
  const clean = email.trim().toLowerCase();
  const at = clean.lastIndexOf("@");
  if (at < 1 || at === clean.length - 1) return null;
  const local = clean.slice(0, at);
  const domain = clean.slice(at + 1);
  if (!domain.includes(".") || KNOWN_DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestDistance = 3;
  for (const known of KNOWN_DOMAINS) {
    const d = editDistance(domain, known);
    if (d < bestDistance) {
      bestDistance = d;
      best = known;
    }
  }
  if (!best || bestDistance === 0 || bestDistance > 2) return null;
  return `${local}@${best}`;
}
