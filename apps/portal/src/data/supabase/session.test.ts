import { Account } from '@boasis/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeSession } from '../../lib/session';
import { requireUser } from './actor';
import { restorePortalSession } from './session';

vi.mock('../../lib/session', () => ({ writeSession: vi.fn() }));
const { getAccount } = vi.hoisted(() => ({ getAccount: vi.fn() }));
vi.mock('./accounts', () => ({ accounts: { get: getAccount } }));
vi.mock('./actor', () => ({ requireUser: vi.fn() }));

const account = Account.parse({
  id: '11111111-1111-4111-8111-111111111111',
  fullName: 'Test Owner',
  email: 'owner@example.com',
  plan: 'one-company',
  termsVersion: 'test',
  termsAcceptedOn: '2026-10-17',
  emailVerifiedOn: '2026-10-17',
  twoStepOn: false,
  emailRemindersOn: true,
  createdOn: '2026-10-17',
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ id: account.id, email: account.email });
  getAccount.mockResolvedValue(account);
});

describe('the real session reaches the unchanged portal screens', () => {
  it('derives the display session from the authenticated account before rendering', async () => {
    await restorePortalSession();
    expect(getAccount).toHaveBeenCalledWith(account.id);
    expect(writeSession).toHaveBeenNthCalledWith(1, null);
    expect(writeSession).toHaveBeenLastCalledWith(expect.objectContaining({
      email: account.email, firstName: 'Test', lastName: 'Owner', actingAs: null,
    }));
    const session = vi.mocked(writeSession).mock.calls[1]?.[0];
    expect(session).not.toHaveProperty('access_token');
    expect(session).not.toHaveProperty('refresh_token');
  });

  it('does not reuse a previous display login when authentication fails', async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error('Sign in is required.'));
    await expect(restorePortalSession()).rejects.toThrow('Sign in is required.');
    expect(writeSession).toHaveBeenCalledExactlyOnceWith(null);
    expect(getAccount).not.toHaveBeenCalled();
  });

  it('does not invent an account when its profile is missing', async () => {
    getAccount.mockResolvedValueOnce(null);
    await expect(restorePortalSession()).rejects.toThrow('account could not be loaded');
    expect(writeSession).toHaveBeenCalledExactlyOnceWith(null);
  });
});
