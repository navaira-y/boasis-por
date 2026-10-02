import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AuthorityId } from '@boasis/schema';

// content/library/, resolved from this file so no absolute path is written anywhere.
const libraryDir = new URL('../../../content/library/', import.meta.url);

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
  // Section headings in the order they appear, without the leading "## ".
  sections: string[];
  body: string;
}

export function libraryAuthorityDir(authority: AuthorityId): string {
  return fileURLToPath(new URL(`${authority}/`, libraryDir));
}

export function libraryEntryPath(authority: AuthorityId, entryId: string): string {
  return fileURLToPath(new URL(`${authority}/${entryId}.md`, libraryDir));
}

// The front matter is six flat keys; appliesTo is a bracketed list. No YAML library is needed
// for that, and the format is fixed by the library entry front matter.
function parseFrontMatter(block: string): LibraryFrontMatter {
  const values = new Map<string, string>();
  for (const line of block.split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  const required = (key: string): string => {
    const value = values.get(key);
    if (value === undefined || value === '') throw new Error(`front matter is missing ${key}`);
    return value;
  };
  const appliesTo = required('appliesTo');
  if (!appliesTo.startsWith('[') || !appliesTo.endsWith(']')) {
    throw new Error('front matter appliesTo must be a bracketed list');
  }
  return {
    id: required('id'),
    authority: required('authority'),
    title: required('title'),
    appliesTo: appliesTo
      .slice(1, -1)
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
    cardId: required('cardId'),
    lastChecked: required('lastChecked'),
  };
}

// Reads content/library/<authority>/<entryId>.md and splits it into front matter, section
// headings and body. A file without front matter is a content error, so it throws.
export async function loadLibraryEntry(
  authority: AuthorityId,
  entryId: string,
): Promise<LibraryEntry> {
  const raw = await readFile(libraryEntryPath(authority, entryId), 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (match === null) throw new Error(`${authority}/${entryId}.md has no front matter`);
  const frontMatterBlock = match[1] ?? '';
  const body = match[2] ?? '';
  const sections = [...body.matchAll(/^## (.+)$/gm)].map((heading) => heading[1] ?? '');
  return { frontMatter: parseFrontMatter(frontMatterBlock), sections, body };
}
