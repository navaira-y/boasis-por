import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AuthorityFile, type AuthorityId } from '@boasis/schema';

// content/authorities/, resolved from this file so no absolute path is written anywhere.
const authoritiesDir = new URL('../../../content/authorities/', import.meta.url);

export function authorityFilePath(id: AuthorityId): string {
  return fileURLToPath(new URL(`${id}.json`, authoritiesDir));
}

// Reads content/authorities/<id>.json and validates it. A file that does not validate is a
// content error, so it throws rather than returning a partial file.
export async function loadAuthority(id: AuthorityId): Promise<AuthorityFile> {
  const raw = await readFile(authorityFilePath(id), 'utf8');
  return AuthorityFile.parse(JSON.parse(raw));
}
