import { z } from "zod";
import {
  organizationServiceKinds,
  type OrganizationServiceKind,
} from "./organization-catalog-contracts";
const metadata = {
  name: z.string().trim().min(1).max(120),
  purpose: z.string().trim().max(2000),
  detail: z.string().trim().max(2000),
  featured: z.boolean(),
  sortOrder: z.number().int().min(0).max(10000),
};
const target = {
  id: z.string().trim().min(1).max(120),
  revision: z.number().int().nonnegative(),
  sourceRevision: z.number().int().positive().nullable(),
};
export const operationalServiceCreateInput = z
  .object({
    ...metadata,
    kind: z.enum(organizationServiceKinds),
    discipline: z.string().trim().max(2000),
  })
  .strict();
export const operationalServiceSaveInput = z.object({ ...target, ...metadata }).strict();
export const operationalServiceStatusInput = z
  .object({
    ...target,
    status: z.enum(["active", "archived"]),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export type OrganizationService = {
  id: string;
  kind: OrganizationServiceKind;
  name: string;
  discipline: string;
  purpose: string;
  detail: string;
  featured: boolean;
  sortOrder: number;
  status: "draft" | "active" | "archived";
  revision: number;
  sourceRevision: number | null;
  financialApprovalRequired: boolean;
  nameEditable: boolean;
};
