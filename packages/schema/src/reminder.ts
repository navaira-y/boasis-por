import { z } from 'zod';
import { Id, IsoDate } from './common';

// Spec section 9. One schedule per requirement, from its lead time down to the day.
export const Channel = z.enum(['email', 'push', 'whatsapp']);
export type Channel = z.infer<typeof Channel>;

export const ReminderState = z.enum(['scheduled', 'sent', 'cancelled']);
export type ReminderState = z.infer<typeof ReminderState>;

export const Reminder = z.object({
  id: Id,
  companyId: Id,
  cardId: Id,
  dueOn: IsoDate,
  // Days before the due date this reminder fires; 0 means on the day, negative means overdue.
  offsetDays: z.number().int(),
  recipientId: Id,
  channel: Channel,
  state: ReminderState,
  sentOn: IsoDate.nullable(),
});
export type Reminder = z.infer<typeof Reminder>;
