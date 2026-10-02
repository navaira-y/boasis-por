import { readdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAuthority } from './load-authority';
import { listAuthorities } from './load-index';
import { libraryAuthorityDir, loadLibraryEntry } from './load-library';

// The section order fixed by the library entry format.
const REQUIRED_SECTIONS = [
  'What it is',
  'When it applies',
  'When it is due',
  'What it costs',
  'What happens if you miss it',
  'The steps',
  'Documents needed',
  'Matching card',
  'Sources',
];

async function entryIds(authority: string): Promise<string[]> {
  const files = await readdir(libraryAuthorityDir(authority));
  return files.filter((file) => file.endsWith('.md')).map((file) => basename(file, '.md'));
}

// Only a deep file (an index entry with `file` set) carries a library. A minimal identity file
// lists no entries and has no folder under content/library/.
async function deepAuthorities(): Promise<string[]> {
  return (await listAuthorities()).filter((entry) => entry.file !== null).map((entry) => entry.id);
}

describe('library entries', () => {
  it('at least one authority has a deep file', async () => {
    expect((await deepAuthorities()).length).toBeGreaterThan(0);
  });

  it('each deep authority has every entry its file lists, and nothing else', async () => {
    for (const authority of await deepAuthorities()) {
      const file = await loadAuthority(authority);
      const listed = file.library
        .map((ref) => basename(ref.entryPath, '.md'))
        .sort((a, b) => a.localeCompare(b));
      const present = (await entryIds(authority)).sort((a, b) => a.localeCompare(b));
      expect(present, authority).toEqual(listed);
      for (const ref of file.library) {
        expect(ref.entryPath).toBe(`content/library/${authority}/${basename(ref.entryPath)}`);
      }
    }
  });

  it('every entry has the required front matter and sections', async () => {
    for (const authority of await deepAuthorities()) {
      const file = await loadAuthority(authority);
      for (const ref of file.library) {
        const id = basename(ref.entryPath, '.md');
        const entry = await loadLibraryEntry(authority, id);
        const { frontMatter } = entry;
        expect(frontMatter.id).toBe(id);
        expect(frontMatter.authority).toBe(authority);
        expect(frontMatter.title.length).toBeGreaterThan(0);
        expect(frontMatter.appliesTo.length).toBeGreaterThan(0);
        expect(frontMatter.cardId).toBe(ref.requirementId);
        expect(frontMatter.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(entry.sections).toEqual(REQUIRED_SECTIONS);
        expect(entry.body.startsWith(`\n# ${frontMatter.title}\n`)).toBe(true);
        expect(entry.body).toMatch(/^Applies to: .+$/m);
        expect(entry.body).toMatch(/^Last checked: \d{4}-\d{2}-\d{2}$/m);
        expect(entry.body).toContain(`\`${frontMatter.cardId}\``);
      }
    }
  });
});
