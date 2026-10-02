import {
  AuthorityIndex,
  type AuthorityFile,
  type AuthorityId,
  type AuthorityIndexEntry,
} from '@boasis/schema';
import { loadAuthorityFile } from '../content/content';

// The browser's way into content/authorities, with the three names of packages/content (which
// reads the same files through node:fs, a thing a browser does not have): the index for the
// picker, one deep file per authority. The deep file itself comes through content/content.ts,
// shared with the people and documents screens, so an authority is parsed once.

const indexFile = import.meta.glob('../../../../content/authorities/index.json', {
  eager: true,
  import: 'default',
});

let cachedIndex: AuthorityIndexEntry[] | null = null;

// Every authority in the UAE, validated once. An index that does not validate is a content
// error, so it throws rather than returning a partial list.
export function listAuthorities(): Promise<AuthorityIndexEntry[]> {
  cachedIndex ??= AuthorityIndex.parse(Object.values(indexFile)[0]).authorities;
  return Promise.resolve(cachedIndex);
}

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Finds an authority by id, name or alias, case-insensitively. Undefined when nothing matches.
export async function findAuthority(nameOrAlias: string): Promise<AuthorityIndexEntry | undefined> {
  const wanted = normalise(nameOrAlias);
  if (wanted === '') {
    return undefined;
  }
  const entries = await listAuthorities();
  return entries.find(
    (entry) =>
      entry.id === wanted ||
      (entry.name.value !== null && normalise(entry.name.value) === wanted) ||
      entry.aliases.some((alias) => normalise(alias) === wanted),
  );
}

// content/authorities/<id>.json, validated. Throws when the file is missing or does not
// validate: a company under an authority the content does not describe is a content error.
export async function loadAuthority(id: AuthorityId): Promise<AuthorityFile> {
  const file = await loadAuthorityFile(id);
  if (file === null) {
    throw new Error(`no authority file for ${id}`);
  }
  return file;
}
