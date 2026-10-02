import { AuthorityFile } from '@boasis/schema';
import { zodToJsonSchema } from 'zod-to-json-schema';

// The JSON Schema of an authority file, derived from the zod schema so the two cannot drift.
// Editors can point at it for completion and validation of content/authorities/*.json.
export const authorityFileJsonSchema = zodToJsonSchema(AuthorityFile, 'AuthorityFile');
