import { describe, expect, it } from 'vitest';
import { authorityFileJsonSchema } from './json-schema';
import { loadAuthority } from './load-authority';
import { listAuthorities } from './load-index';

describe('authority files', () => {
  it('every indexed authority validates against the schema', async () => {
    for (const entry of await listAuthorities()) {
      const file = await loadAuthority(entry.id);
      expect(file.id).toBe(entry.id);
      expect(file.identity.name.source.length).toBeGreaterThan(0);
    }
  });

  it('exports a JSON Schema with the AuthorityFile definition', () => {
    expect(authorityFileJsonSchema.definitions).toHaveProperty('AuthorityFile');
  });
});
