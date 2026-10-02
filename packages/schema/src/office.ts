import { z } from 'zod';
import { Id, IsoDate } from './common';

// Spec section 5.2.
export const PremisesType = z.enum([
  'flexi-desk',
  'shared-desk',
  'serviced-office',
  'dedicated-office',
  'shop',
  'warehouse',
  'land',
]);
export type PremisesType = z.infer<typeof PremisesType>;

export const Premises = z.object({
  type: PremisesType,
  address: z.string(),
  sizeSqm: z.number().nonnegative().nullable(),
  servesActivityCodes: z.array(z.string()),
  isRegisteredAddress: z.boolean(),
});
export type Premises = z.infer<typeof Premises>;

export const PaymentMethod = z.enum(['cheque', 'transfer']);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const RentInstalment = z.object({
  dueOn: IsoDate,
  amountAed: z.number().nonnegative(),
  method: PaymentMethod,
});
export type RentInstalment = z.infer<typeof RentInstalment>;

export const Ejari = z.object({
  number: z.string().min(1),
  expiry: IsoDate,
});
export type Ejari = z.infer<typeof Ejari>;

export const Lease = z.object({
  landlord: z.string(),
  start: IsoDate,
  end: IsoDate,
  noticePeriodDays: z.number().int().nonnegative().nullable(),
  rentAed: z.number().nonnegative().nullable(),
  securityDepositAed: z.number().nonnegative().nullable(),
  paymentSchedule: z.array(RentInstalment),
  ejari: Ejari.nullable(),
  tenancyContractDocumentId: Id.nullable(),
});
export type Lease = z.infer<typeof Lease>;

export const ApprovalType = z.enum([
  'fit-out-permit',
  'civil-defence-approval',
  'municipality-inspection',
  'signboard-permit',
]);
export type ApprovalType = z.infer<typeof ApprovalType>;

export const Approval = z.object({
  type: ApprovalType,
  reference: z.string(),
  expiry: IsoDate.nullable(),
});
export type Approval = z.infer<typeof Approval>;

export const OfficeServices = z.object({
  electricityAndWaterAccount: z.string().nullable(),
  telecomAccount: z.string().nullable(),
  buildingAccess: z.string().nullable(),
  parking: z.string().nullable(),
});
export type OfficeServices = z.infer<typeof OfficeServices>;

export const OfficeCapacity = z.object({
  quotaAllowed: z.number().int().nonnegative().nullable(),
  quotaUsed: z.number().int().nonnegative(),
});
export type OfficeCapacity = z.infer<typeof OfficeCapacity>;

export const Office = z.object({
  id: Id,
  companyId: Id,
  premises: Premises,
  lease: Lease,
  approvals: z.array(Approval),
  services: OfficeServices,
  capacity: OfficeCapacity,
});
export type Office = z.infer<typeof Office>;
