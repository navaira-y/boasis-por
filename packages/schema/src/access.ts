import { z } from 'zod';
import { Area, Id } from './common';

// Spec section 4.1: per area, three levels, plus who is responsible for that area.
export const AccessLevel = z.enum(['none', 'view', 'edit']);
export type AccessLevel = z.infer<typeof AccessLevel>;

export const AreaAccess = z.object({
  level: AccessLevel,
  responsible: z.boolean(),
});
export type AreaAccess = z.infer<typeof AreaAccess>;

export const CompanyAccess = z.object({
  companyId: Id,
  areas: z.record(Area, AreaAccess),
});
export type CompanyAccess = z.infer<typeof CompanyAccess>;

export const Member = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});
export type Member = z.infer<typeof Member>;

export const AccessGrant = z.object({
  id: Id,
  member: Member,
  roleName: z.string().min(1),
  companies: z.array(CompanyAccess),
});
export type AccessGrant = z.infer<typeof AccessGrant>;
