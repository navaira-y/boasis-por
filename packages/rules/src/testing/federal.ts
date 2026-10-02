import { FederalRules } from '@boasis/schema';
import raw from '../../../../content/federal.json';

// The real content/federal.json, validated, so the tests run against the sourced values.
export const FEDERAL: FederalRules = FederalRules.parse(raw);
