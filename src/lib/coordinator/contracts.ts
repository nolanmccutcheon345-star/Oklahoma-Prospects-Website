import { registrationFilters } from "../registration-filters";
import { z } from "zod";
import { TRYOUT_STATUSES } from "../tryout-center-contracts";
export const sports = ["baseball", "softball"] as const;
export type Sport = (typeof sports)[number];
// This allowlist is the complete grantable surface. Never accept wildcards or arbitrary strings.
export const capabilities = {
  "recruiting.read": "View recruiting prospects",
  "tryouts.read": "View tryout registrations",
  "tryouts.create": "Create scoped tryout drafts",
  "tryouts.update": "Edit scoped tryouts",
  "events.review.request": "Request event publication or protected schedule review",
  "tryouts.status": "Update tryout registration status",
  "recruiting.create": "Add recruiting prospects",
  "recruiting.update": "Edit routine recruiting information",
  "recruiting.status": "Update recruiting follow-up status",
  "recruiting.followups": "Assign recruiting follow-up tasks",
  "tryouts.attendance": "Manage tryout attendance",
  "communications.delivery.read": "View own communication delivery status",
  "recruiting.notes": "Add recruiting notes",
  "contacts.read": "View necessary guardian contact details",
  "rosters.read": "View team rosters",
  "rosters.publication.request": "Request owner-reviewed public roster identity",
  "photos.publication.request": "Request owner-reviewed consented player photo",
  "rosters.add": "Add owner-cleared eligible athletes to authorized rosters",
  "rosters.information": "Update routine player information",
  "rosters.number": "Edit jersey numbers",
  "rosters.positions": "Edit player positions",
  "rosters.transfer.request": "Propose an athlete transfer for owner review",
  "camps.create": "Create scoped camp drafts",
  "camps.update": "Edit scoped camps and sessions",
  "clinics.create": "Create scoped clinic drafts",
  "clinics.update": "Edit scoped clinics and sessions",
  "events.assign": "Assign eligible athletes to authorized events",
  "events.attendance": "Manage authorized event attendance",
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
  "recruiting.invite": "Send individual recruiting invitations",
  "communications.inquiry.reply": "Reply to authorized program inquiries",
  "communications.announcement.schedule": "Schedule authorized team announcements",
  "communications.tryout.remind": "Send authorized tryout reminders",
  "communications.practice.remind": "Send authorized practice reminders",
  "communications.event.notify": "Send authorized event notifications",
  "communications.program.request": "Request owner approval for program-wide announcements",
  "content.read": "View authorized website content",
  "content.recruiting.draft": "Draft recruiting announcements",
  "content.tryout.draft": "Draft tryout descriptions",
  "content.team.draft": "Draft team updates",
  "content.draft": "Create announcement drafts",
  "content.update": "Edit own announcement drafts",
  "content.submit": "Submit drafts for owner review",
  "reports.read": "View roster counts",
  "reports.recruiting": "View recruiting activity statistics",
  "reports.tryouts": "View tryout participation counts",
  "reports.openings": "View team opening counts",
  "reports.attendance": "View attendance counts",
  "reports.events": "View nonfinancial event participation counts",
  "reports.followups": "View outstanding recruiting follow-up counts",
  "teams.openings": "Manage team roster openings",
  "teams.needs": "Update team recruiting needs",
  "teams.statistics": "View authorized team statistics",
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
  .extend({ before: historyCursor.optional(), athleteFilters: registrationFilters.optional() })
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
  "tryouts.read",
  "tryouts.status",
  "tryouts.attendance",
  "tryouts.create",
  "tryouts.update",
  "camps.create",
  "clinics.create",
  "camps.update",
  "clinics.update",
  "events.attendance",
  "events.assign",
  "events.review.request",
  "rosters.information",
  "content.read",
  "content.recruiting.draft",
  "content.tryout.draft",
  "content.team.draft",
  "reports.tryouts",
  "reports.openings",
  "reports.attendance",
  "reports.events",
  "reports.followups",
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
    purpose: z.enum(["recruiting", "invitation", "inquiry", "tryout-reminder"]).optional(),
  })
  .strict();
export const draftInput = scopeInput
  .extend({
    id: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    contentKind: z.enum(["announcement", "recruiting", "tryout", "team"]).optional(),
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

export const transferRecoveryInput = z
  .object({
    approvalId: z.string().uuid(),
    approvalRevision: z.number().int().positive(),
    rosterRevision: z.number().int().positive(),
    reason: z.string().trim().min(10).max(500),
    confirm: z.literal(true),
  })
  .strict();
