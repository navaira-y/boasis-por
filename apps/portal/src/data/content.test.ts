import { describe, expect, it } from 'vitest';
import { findAuthority, listAuthorities, loadAuthority } from './content';

describe('content adapter', () => {
  it('lists every authority in the index', async () => {
    const entries = await listAuthorities();
    expect(entries.length).toBeGreaterThanOrEqual(49);
    expect(entries.some((entry) => entry.id === 'srtip')).toBe(true);
  });

  it('finds an authority by id, name or alias', async () => {
    expect((await findAuthority('srtip'))?.id).toBe('srtip');
    expect((await findAuthority('SRTIP'))?.id).toBe('srtip');
    expect(await findAuthority('')).toBeUndefined();
  });

  it('loads and validates a deep file', async () => {
    const file = await loadAuthority('srtip');
    expect(file.id).toBe('srtip');
    expect(file.identity.emirate.value).toBe('Sharjah');
  });

  it('rejects an authority the content does not describe', async () => {
    await expect(loadAuthority('nowhere')).rejects.toThrow('no authority file');
  });
});
