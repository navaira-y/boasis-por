import { describe, expect, it } from 'vitest';
import { loadAuthority } from '../data/content';
import { ALREEF_ID, HAMDAN_ID, MARASI_ID, QASR_ID, seed } from '../data/mock/seed';
import { showsEjari } from './offices';

async function shows(companyId: string): Promise<boolean> {
  const data = seed();
  const facts = data.companies.find((company) => company.id === companyId);
  const office = data.offices.find((entry) => entry.companyId === companyId);
  if (facts === undefined || office === undefined) {
    throw new Error(`no demo company ${companyId}`);
  }
  const authority = await loadAuthority(facts.identity.authority);
  const documents = data.documents.filter((document) => document.companyId === companyId);
  return showsEjari({ facts, authority, documents }, office);
}

describe('showsEjari', () => {
  it('shows a registration on file (Al Reef, Dubai mainland)', async () => {
    expect(await shows(ALREEF_ID)).toBe(true);
  });

  it('hides the line where the answer says Ejari is not required (Marasi, DMCC)', async () => {
    expect(await shows(MARASI_ID)).toBe(false);
  });

  it('hides the line in a free zone without an Ejari rule (Hamdan, JAFZA)', async () => {
    expect(await shows(HAMDAN_ID)).toBe(false);
  });

  it('keeps the line on a mainland authority that cannot say (Qasr, Abu Dhabi)', async () => {
    expect(await shows(QASR_ID)).toBe(true);
  });
});
