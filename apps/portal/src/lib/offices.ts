import { ejariRequired } from '@boasis/rules';
import type { AuthorityFile, CompanyFacts, Document, Office } from '@boasis/schema';

// Whether an office card carries the Ejari line. A registration on file always shows. Without
// one, the line shows only where Ejari applies: the resolver says yes, or it cannot say and the
// authority is mainland. A free zone without an Ejari rule, or a "no", hides the line.
export function showsEjari(
  context: {
    readonly facts: CompanyFacts;
    readonly authority: AuthorityFile;
    readonly documents: readonly Document[];
  },
  office: Office,
): boolean {
  if (office.lease.ejari !== null) {
    return true;
  }
  const applies = ejariRequired(context);
  if (applies === 'unknown') {
    return context.authority.identity.type.value === 'mainland';
  }
  return applies === 'yes';
}
