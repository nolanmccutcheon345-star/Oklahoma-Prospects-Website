import { z } from "zod";

export const organizationServiceKinds = [
  "lesson",
  "package",
  "membership",
  "cage",
  "cage_plan",
  "fee",
  "team_plan",
] as const;
export type OrganizationServiceKind = (typeof organizationServiceKinds)[number];
export const organizationServiceMetadataInput = z
  .object({
    id: z.string().trim().min(1).max(120),
    revision: z.number().int().positive(),
    name: z.string().trim().min(1).max(120),
    purpose: z.string().trim().max(2000),
    detail: z.string().trim().max(2000),
    featured: z.boolean(),
    sortOrder: z.number().int().min(0).max(10000),
  })
  .strict();
export type OrganizationServiceMetadataInput = z.infer<typeof organizationServiceMetadataInput>;

export const organizationTrainingEventMetadataInput = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    editToken: z.string().regex(/^[a-f0-9]{32}$/),
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(5000),
  })
  .strict();
export type OrganizationTrainingEventMetadataInput = z.infer<
  typeof organizationTrainingEventMetadataInput
>;

/** Lesson names drive default compensation; cage-plan names also resolve payment links. */
export function serviceNameEditable(kind: OrganizationServiceKind) {
  return kind !== "lesson" && kind !== "cage_plan";
}
export type OrganizationCatalogService = OrganizationServiceMetadataInput & {
  kind: OrganizationServiceKind;
  discipline: string;
  nameEditable: boolean;
};
export type OrganizationCatalogSession = { date: string; start: string; end: string };
export type OrganizationCatalogEvent = OrganizationTrainingEventMetadataInput & {
  type: string;
  sport: "Baseball" | "Softball" | "Both";
  status: "published" | "closed";
  location: string;
  sessions: OrganizationCatalogSession[];
};
export type OrganizationCatalogRegistration = {
  id: string;
  eventId: string;
  athleteId: string;
  player: string;
  status: "confirmed" | "cancelled";
  sessions: OrganizationCatalogSession[];
};
export type OrganizationCatalog = {
  services: OrganizationCatalogService[];
  events: OrganizationCatalogEvent[];
  registrations: OrganizationCatalogRegistration[];
};
