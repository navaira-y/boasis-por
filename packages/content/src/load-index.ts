import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AuthorityIndex, type AuthorityIndexEntry } from '@boasis/schema';

// content/authorities/index.json, resolved from this file so no absolute path is written anywhere.
const indexUrl = new URL('../../../content/authorities/index.json', import.meta.url);

export function authorityIndexPath(): string {
  return fileURLToPath(indexUrl);
}

// Reads and validates the index: one entry per authority in the UAE. An index that does not
// validate is a content error, so it throws rather than returning a partial list.
export async function listAuthorities(): Promise<AuthorityIndexEntry[]> {
  const raw = await readFile(indexUrl, 'utf8');
  return AuthorityIndex.parse(JSON.parse(raw)).authorities;
}

// Lower case, trimmed, inner whitespace collapsed, so "dubai  economy" finds "Dubai Economy".
function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Finds an authority by id, name or alias, case-insensitively. Undefined when nothing matches.
export async function findAuthority(nameOrAlias: string): Promise<AuthorityIndexEntry | undefined> {
  const wanted = normalise(nameOrAlias);
  if (wanted === '') return undefined;
  const entries = await listAuthorities();
  return entries.find(
    (entry) =>
      entry.id === wanted ||
      (entry.name.value !== null && normalise(entry.name.value) === wanted) ||
      entry.aliases.some((alias) => normalise(alias) === wanted),
  );
}
