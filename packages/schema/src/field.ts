import { z } from 'zod';
import { IsoDate } from './common';

// Onboarding v2 section B.5 and F: every value a person enters carries its state, its origin and
// the day it was entered. Calculated and rule values are never stored; packages/rules computes
// them from these every time.
//   known    the value was given
//   unknown  the person said "not sure"
//   skipped  the person chose "I'll add this later"
// A "Not sure" answer is always the unknown state, never a value, so there is one way to say it.
export const FieldState = z.enum(['known', 'unknown', 'skipped']);
export type FieldState = z.infer<typeof FieldState>;

// Typed by the person, or read from a document. Document is reserved for the scanner; every
// document value needs a human confirm before it is stored.
export const FieldOrigin = z.enum(['user', 'document']);
export type FieldOrigin = z.infer<typeof FieldOrigin>;

export function field<T extends z.ZodTypeAny>(value: T) {
  return z.discriminatedUnion('state', [
    z.object({
      state: z.literal('known'),
      value,
      origin: FieldOrigin,
      enteredOn: IsoDate,
    }),
    z.object({
      state: z.literal('unknown'),
      value: z.null(),
      origin: FieldOrigin,
      enteredOn: IsoDate,
    }),
    z.object({
      state: z.literal('skipped'),
      value: z.null(),
      origin: z.literal('user'),
      enteredOn: IsoDate,
    }),
  ]);
}

export type Field<T> =
  | { state: 'known'; value: T; origin: FieldOrigin; enteredOn: IsoDate }
  | { state: 'unknown'; value: null; origin: FieldOrigin; enteredOn: IsoDate }
  | { state: 'skipped'; value: null; origin: 'user'; enteredOn: IsoDate };

// A yes or no answer. "Not sure" is the unknown state of the field that holds it.
export const YesNo = z.enum(['yes', 'no']);
export type YesNo = z.infer<typeof YesNo>;
