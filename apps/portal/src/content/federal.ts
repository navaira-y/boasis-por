import { FederalRules } from '@boasis/schema';

// content/federal.json, read in the browser the way content.ts reads the authority files:
// bundled through Vite so no absolute path and no fetch is needed (rule 12). packages/content
// reads the same file with node:fs. The file is small and every company needs it, so it is loaded
// eagerly and validated once; a file that does not validate is a content error and throws.
const federalFile = import.meta.glob('../../../../content/federal.json', {
  eager: true,
  import: 'default',
});

export const federalRules: FederalRules = FederalRules.parse(Object.values(federalFile)[0]);
