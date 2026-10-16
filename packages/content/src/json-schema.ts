import { AuthorityFile } from '@boasis/schema';
import { zodToJsonSchema } from 'zod-to-json-schema';

// The JSON Schema of an authority file, derived from the zod schema so the two cannot drift.
// Editors can point at it for completion and validation of content/authorities/*.json.
//
// The cast is deliberate and type-only: AuthorityFile is deeply nested, and inferring
// it through zod-to-json-schema's recursive generics exceeds TypeScript's instantiation
// depth (TS2589). Nothing about the runtime value changes.
type JsonSchemaInput = Parameters<typeof zodToJsonSchema>[0];

export const authorityFileJsonSchema = zodToJsonSchema(
  AuthorityFile as unknown as JsonSchemaInput,
  'AuthorityFile',
);
