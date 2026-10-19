import { z } from "zod";
import { TRYOUT_STATUSES } from "../tryout-center-contracts";
export const sports = ["baseball", "softball"] as const;
export type Sport = (typeof sports)[number];
// This allowlist is the complete grantable surface. Never accept wildcards or arbitrary strings.
export const capabilities = {
  "recruiting.read": "View prospects and tryout registrations",
  "recruiting.create": "Add recruiting prospects",
  "recruiting.update": "Edit routine recruiting information",
  "recruiting.status": "Update recruiting follow-up status",
  "recruiting.notes": "Add recruiting notes",
  "contacts.read": "View necessary guardian contact details",
  "rosters.read": "View team rosters",
  "rosters.number": "Edit jersey numbers",
  "rosters.positions": "Edit player positions",
  "rosters.transfer.request": "Propose an athlete transfer for owner review",
  "events.read": "View team schedules",
  "practices.create": "Create team practices",
  "practices.update": "Edit team practices",
  "events.cancel.request": "Request event cancellation",
  "cages.read": "View shared cage availability",
  "cages.reserve": "Reserve available cages for permitted practices",
  "cages.update": "Change cage reservations for permitted practices",
  "cages.release": "Release unused cage reservations for permitted practices",
  "communications.read": "View authorized team communications",
  "communications.team.send": "Send a confirmed team message",
  "communications.recruit.send": "Send a confirmed individual recruiting email",
  "content.draft": "Create announcement drafts",
  "content.update": "Edit own announcement drafts",
  "content.submit": "Submit drafts for owner review",
  "reports.read": "View nonfinancial roster and recruiting counts",
  "activity.read": "View own coordinator activity",
} as const;
export type Capability = keyof typeof capabilities;
export const permissionKeys = Object.keys(capabilities) as [Capability, ...Capability[]];
export const sportInput = z.enum(sports);
export const id = z.string().min(1).max(200);
export const scopeInput = z
  .object({ sport: sportInput, teamId: z.string().max(200).default("") })
  .strict();
// Keyset cursors preserve access to the full history without unbounded responses.
export const historyCursor = z.object({ at: z.iso.datetime(), id }).strict();
export const recruitingHistoryInput = scopeInput
  .extend({ before: historyCursor.optional() })
  .strict();
export const messageHistoryInput = z
  .object({ teamId: id, before: historyCursor.optional() })
  .strict();
export type HistoryCursor = z.infer<typeof historyCursor>;
export const assignmentInput = z
  .object({
    userId: id,
    sport: sportInput,
    revision: z.number().int().nonnegative(),
    status: z.enum(["active", "suspended", "removed"]),
    coverage: z.enum(["sport", "teams"]),
    teamIds: z.array(id).max(100),
    permissions: z.array(z.enum(permissionKeys)).max(permissionKeys.length),
    confirm: z.literal(true),
    independentRolesReviewed: z.boolean(),
  })
  .strict();
export type AssignmentInput = z.infer<typeof assignmentInput>;
export type Assignment = Omit<
  AssignmentInput,
  "confirm" | "independentRolesReviewed" | "userId"
> & {
  user_id: string;
  team_ids: string[];
  independent_roles: string[];
};
export const recommendedPreset: Capability[] = [
  "recruiting.read",
  "recruiting.create",
  "recruiting.update",
  "recruiting.status",
  "recruiting.notes",
  "contacts.read",
  "rosters.read",
  "rosters.number",
  "rosters.positions",
  "events.read",
  "practices.create",
  "practices.update",
  "cages.read",
  "cages.reserve",
  "communications.read",
  "communications.team.send",
  "communications.recruit.send",
  "content.draft",
  "content.update",
  "content.submit",
  "reports.read",
];
// Explicitly reviewed operations only: future capabilities must not silently enter this preset.
// Selecting a preset never saves grants or changes sport/team coverage.
export const programOperationsPreset: Capability[] = [
  ...recommendedPreset,
  "rosters.transfer.request",
  "events.cancel.request",
  "cages.update",
  "cages.release",
  "activity.read",
];
export const rosterEditInput = z
  .object({
    teamId: id,
    playerId: id,
    revision: z.number().int().nonnegative(),
    field: z.enum(["number", "positions"]),
    value: z.union([z.string().max(4), z.array(z.string().trim().min(1).max(30)).max(10)]),
  })
  .strict();
export const prospectInput = scopeInput
  .extend({
    id: z.string().uuid(),
    player: z.string().trim().min(1).max(120),
    age: z.string().trim().min(1).max(30),
    positions: z.string().trim().max(200),
    parent: z.string().trim().min(1).max(120),
    email: z.email().max(254),
    phone: z.string().max(40),
  })
  .strict();
export const requestEditInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("status"),
      id,
      revision: z.number().int().nonnegative(),
      status: z.enum(TRYOUT_STATUSES),
    })
    .strict(),
  z
    .object({
      action: z.literal("note"),
      id,
      actionId: z.string().uuid(),
      note: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      id,
      revision: z.number().int().nonnegative(),
      positions: z.string().trim().max(200),
      age: z.string().trim().min(1).max(30),
    })
    .strict(),
]);
export const practiceInput = z
  .object({
    id: z.string().uuid(),
    teamId: id,
    revision: z.number().int().nonnegative(),
    title: z.string().trim().min(2).max(140),
    date: z.string(),
    time: z.string(),
    duration: z.number().int().min(30).max(180).multipleOf(30),
    location: z.string().trim().min(1).max(240),
    laneIds: z.array(z.enum(["1", "2", "3-4", "5", "6", "7"])).max(6),
  })
  .strict();
export const messageInput = z
  .object({
    id: z.string().uuid(),
    teamId: id,
    body: z.string().trim().min(1).max(3000),
    confirmedTeamId: id,
  })
  .strict();
export const emailInput = z
  .object({
    id: z.string().uuid(),
    requestId: id,
    subject: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(3000),
    confirmedEmail: z.email(),
  })
  .strict();
export const draftInput = scopeInput
  .extend({
    id: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(140),
    body: z.string().trim().min(1).max(3000),
    submit: z.boolean(),
  })
  .strict();
export const approvalInput = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(["transfer", "cancel-event"]),
    targetId: id,
    teamId: id,
    destinationTeamId: z.string().max(200).default(""),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export const decisionInput = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().min(1).max(1000),
    confirm: z.literal(true),
  })
  .strict();
export const publicLeadershipInput = z
  .object({
    userId: id,
    revision: z.number().int().nonnegative(),
    enabled: z.boolean(),
    titles: z.array(z.enum(["Baseball Coordinator", "Softball Coordinator"])).max(2),
    order: z.number().int().min(0).max(10000),
  })
  .strict();
