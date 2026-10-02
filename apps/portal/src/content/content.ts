import { AuthorityFile, type AuthorityId, type LibraryRef } from '@boasis/schema';

// The content folder, read in the browser. packages/content reads the same files with node:fs
// for the server and the tests; the portal bundles them through Vite instead, so no absolute
// path and no fetch is needed and a phone-app wrapper works offline (rule 12). Each file is its
// own chunk, loaded when a screen first asks for it, so the app does not carry every authority.
const authorityFiles = import.meta.glob('../../../../content/authorities/*.json', {
  import: 'default',
});

const libraryFiles = import.meta.glob('../../../../content/library/*/*.md', {
  import: 'default',
  query: '?raw',
});

function fileId(path: string): string {
  const name = path.split('/').pop() ?? path;
  return name.replace(/\.(json|md)$/, '');
}

const parsedAuthorities = new Map<string, Promise<AuthorityFile | null>>();

// The deep authority file, validated once; null when the authority has no file yet or the file
// does not validate (index.json is not an authority file and is skipped the same way).
export function loadAuthorityFile(id: AuthorityId): Promise<AuthorityFile | null> {
  const cached = parsedAuthorities.get(id);
  if (cached !== undefined) {
    return cached;
  }
  const entry = Object.entries(authorityFiles).find(([path]) => fileId(path) === id);
  const loading =
    entry === undefined
      ? Promise.resolve(null)
      : entry[1]().then((raw) => {
          const parsed = AuthorityFile.safeParse(raw);
          return parsed.success ? parsed.data : null;
        });
  parsedAuthorities.set(id, loading);
  return loading;
}

export const LIBRARY_FALLBACK: AuthorityId = 'dubai-mainland';

// The authorities that have a library folder.
export function libraryAuthorities(): AuthorityId[] {
  const ids = new Set<string>();
  for (const path of Object.keys(libraryFiles)) {
    const folder = path.split('/').at(-2);
    if (folder !== undefined) {
      ids.add(folder);
    }
  }
  return [...ids].sort();
}

// Spec 8: a company sees the library of its own authority; one without a library reads the
// Dubai mainland one.
export function libraryAuthorityFor(authority: AuthorityId): AuthorityId {
  return libraryAuthorities().includes(authority) ? authority : LIBRARY_FALLBACK;
}

// A library entry's front matter: six keys, appliesTo a bracketed list.
export interface LibraryFrontMatter {
  id: string;
  authority: string;
  title: string;
  appliesTo: string[];
  cardId: string;
  lastChecked: string;
}

export interface LibraryEntry {
  frontMatter: LibraryFrontMatter;
  // The one line under the title that says what the entry covers.
  summary: string;
  sections: string[];
  body: string;
}

function parseFrontMatter(block: string): LibraryFrontMatter | null {
  const values = new Map<string, string>();
  for (const line of block.split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  const id = values.get('id');
  const authority = values.get('authority');
  const title = values.get('title');
  const appliesTo = values.get('appliesTo');
  const cardId = values.get('cardId');
  const lastChecked = values.get('lastChecked');
  if (
    id === undefined ||
    authority === undefined ||
    title === undefined ||
    appliesTo === undefined ||
    cardId === undefined ||
    lastChecked === undefined
  ) {
    return null;
  }
  return {
    id,
    authority,
    title,
    appliesTo: appliesTo
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
    cardId,
    lastChecked,
  };
}

function parseEntry(raw: string): LibraryEntry | null {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (match === null) {
    return null;
  }
  const frontMatter = parseFrontMatter(match[1] ?? '');
  if (frontMatter === null) {
    return null;
  }
  const body = match[2] ?? '';
  const sections = [...body.matchAll(/^## (.+)$/gm)].map((heading) => heading[1] ?? '');
  // The summary is the first plain line after the "# Title" heading.
  const lines = body.split('\n');
  const titleAt = lines.findIndex((line) => line.startsWith('# '));
  const summary =
    lines.slice(titleAt + 1).find((line) => line.trim() !== '' && !line.startsWith('#')) ?? '';
  return { frontMatter, summary: summary.trim(), sections, body };
}

const parsedLibraries = new Map<string, Promise<LibraryEntry[]>>();

// Every entry of one authority's library, in the order the authority file lists them when it
// has one (spec 8.2), else by file name.
export function loadLibraryEntries(authority: AuthorityId): Promise<LibraryEntry[]> {
  const cached = parsedLibraries.get(authority);
  if (cached !== undefined) {
    return cached;
  }
  const files = Object.entries(libraryFiles).filter(
    ([path]) => path.split('/').at(-2) === authority,
  );
  const loading = Promise.all([
    loadAuthorityFile(authority),
    ...files.map(([, load]) => load()),
  ]).then(([file, ...raws]) => {
    const entries: LibraryEntry[] = [];
    for (const raw of raws) {
      const entry = typeof raw === 'string' ? parseEntry(raw) : null;
      if (entry !== null) {
        entries.push(entry);
      }
    }
    const order = (file?.library ?? []).map((ref: LibraryRef) => fileId(ref.entryPath));
    entries.sort((a, b) => {
      const ai = order.indexOf(a.frontMatter.id);
      const bi = order.indexOf(b.frontMatter.id);
      if (ai !== -1 || bi !== -1) {
        return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
      }
      return a.frontMatter.id.localeCompare(b.frontMatter.id);
    });
    return entries;
  });
  parsedLibraries.set(authority, loading);
  return loading;
}
