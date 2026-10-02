import { readdir } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { AuthorityId, Emirate } from '@boasis/schema';
import { describe, expect, it } from 'vitest';
import { loadAuthority } from './load-authority';
import { authorityIndexPath, findAuthority, listAuthorities } from './load-index';

describe('authority index', () => {
  it('has unique, kebab-case ids', async () => {
    const ids = (await listAuthorities()).map((entry) => entry.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(AuthorityId.safeParse(id).success).toBe(true);
  });

  it('every entry has a file that validates and agrees with the index identity', async () => {
    for (const entry of await listAuthorities()) {
      const file = await loadAuthority(entry.id);
      expect(file.id).toBe(entry.id);
      expect(file.identity.name.value).toBe(entry.name.value);
      expect(file.identity.emirate.value).toBe(entry.emirate.value);
      expect(file.identity.type.value).toBe(entry.type.value);
      expect(file.identity.visaSponsor.value).toBe(entry.visaSponsor.value);
      if (entry.file !== null) expect(entry.file).toBe(`${entry.id}.json`);
    }
  });

  it('every authority file on disk is in the index, and nothing else is', async () => {
    const onDisk = (await readdir(dirname(authorityIndexPath())))
      .filter((name) => name.endsWith('.json') && name !== 'index.json')
      .map((name) => basename(name, '.json'))
      .sort((a, b) => a.localeCompare(b));
    const listed = (await listAuthorities())
      .map((entry) => entry.id)
      .sort((a, b) => a.localeCompare(b));
    expect(onDisk).toEqual(listed);
  });

  it('has a mainland authority for every emirate', async () => {
    const entries = await listAuthorities();
    for (const emirate of Emirate.options) {
      const mainland = entries.filter(
        (entry) => entry.type.value === 'mainland' && entry.emirate.value === emirate,
      );
      expect(mainland, emirate).toHaveLength(1);
    }
  });

  it('resolves names and aliases case-insensitively', async () => {
    const cases: [string, string][] = [
      ['DED', 'dubai-mainland'],
      ['det', 'dubai-mainland'],
      ['Dubai Economy', 'dubai-mainland'],
      ['SEDD', 'sharjah-mainland'],
      ['added', 'abu-dhabi-mainland'],
      ['dmcc', 'dmcc'],
      ['Jafza', 'jafza'],
      ['ADGM', 'adgm'],
      ['rakez', 'rakez'],
      ['Sharjah Media City', 'shams'],
      ['  ifza ', 'ifza'],
      ['Dubai Multi Commodities Centre (DMCC)', 'dmcc'],
    ];
    for (const [query, id] of cases) {
      const found = await findAuthority(query);
      expect(found?.id, query).toBe(id);
    }
  });

  it('returns undefined for an unknown name and for an empty query', async () => {
    expect(await findAuthority('no such authority')).toBeUndefined();
    expect(await findAuthority('   ')).toBeUndefined();
  });
});
