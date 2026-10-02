import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FederalRules } from '@boasis/schema';

// content/federal.json, resolved from this file so no absolute path is written anywhere.
const federalUrl = new URL('../../../content/federal.json', import.meta.url);

export function federalRulesPath(): string {
  return fileURLToPath(federalUrl);
}

// Reads content/federal.json and validates it. A file that does not validate is a content error,
// so it throws rather than returning a partial file.
export async function loadFederalRules(): Promise<FederalRules> {
  const raw = await readFile(federalUrl, 'utf8');
  return FederalRules.parse(JSON.parse(raw));
}
