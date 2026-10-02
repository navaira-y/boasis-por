import { describe, expect, it } from 'vitest';
import { DIAL_FAMILIES, familyIndex, familyLabel, familyOf, quietAngle } from './families';

describe('dial families', () => {
  it('orders tax, visa, licence, other from the outside in', () => {
    expect(DIAL_FAMILIES.map((family) => family.id)).toEqual(['tax', 'visa', 'licence', 'other']);
    expect(DIAL_FAMILIES.map((family) => family.label)).toEqual([
      'Tax',
      'Visa',
      'Licence',
      'Other',
    ]);
    expect(familyIndex('other')).toBe(3);
    expect(familyLabel('visa')).toBe('Visa');
  });

  it('maps every card area onto an orbit', () => {
    expect(familyOf('people')).toBe('visa');
    expect(familyOf('tax-and-accounts')).toBe('tax');
    expect(familyOf('licence-and-cards')).toBe('licence');
    expect(familyOf('banks')).toBe('other');
    expect(familyOf('offices')).toBe('other');
    expect(familyOf('billing')).toBe('other');
  });

  it('sends the office, the UBO register, AML and the records to other whatever their area', () => {
    expect(familyOf('licence-and-cards', 'licence-renewal')).toBe('licence');
    expect(familyOf('licence-and-cards', 'office-lease-renewal')).toBe('other');
    expect(familyOf('licence-and-cards', 'ubo-declaration')).toBe('other');
    expect(familyOf('licence-and-cards', 'aml-registration')).toBe('other');
    expect(familyOf('tax-and-accounts', 'general-assembly')).toBe('other');
    expect(familyOf('people', 'residence-visa-renewal')).toBe('visa');
  });

  it('finds the middle of the widest gap', () => {
    expect(quietAngle([])).toBe(90);
    expect(quietAngle([0])).toBe(180);
    expect(quietAngle([0, 180])).toBe(90);
    expect(quietAngle([-90, 0, 90])).toBe(180);
  });
});
