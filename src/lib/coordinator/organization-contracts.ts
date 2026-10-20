import { z } from "zod";
import { validDate } from "../scheduling";
import { TRYOUT_STATUSES } from "../tryout-center-contracts";
import { tryoutEventInput } from "../tryout-events-contracts";
import { battingStats } from "../teams/activity-contracts";

const id = z.string().trim().min(1).max(150);
const text = z.string().trim().max(200);
const email = z.union([z.literal(""), z.email().max(254)]);
const date = z.string().refine((v) => !v || validDate(v), "Choose a valid date.");
const revision = z.number().int().nonnegative();
const sport = z.enum(["baseball", "softball"]);
const nonempty = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object(shape)
    .partial()
    .strict()
    .refine((v) => Object.keys(v).length > 0, "Choose a field to change.");
export const organizationGuardian = z
  .object({ name: text, rel: text, phone: z.string().max(40), email })
  .strict();
export const organizationDocuments = z
  .object({
    waiver: z.boolean(),
    birthCert: z.boolean(),
    insurance: z.boolean(),
    physical: z.boolean(),
  })
  .strict();
export const organizationTeamChanges = nonempty({
  name: z.string().trim().min(2).max(160),
  sport,
  age: text,
  level: text,
  seasonLabel: text,
  seasonStart: date,
  seasonEnd: date,
  headCoach: text,
  coachEmail: email,
  closed: z.boolean(),
});
export const organizationPlayerChanges = nonempty({
  name: z.string().trim().min(1).max(160),
  number: z.string().max(4),
  positions: z.array(z.string().trim().min(1).max(30)).max(10),
  bats: z.enum(["", "R", "L", "S"]),
  throws: z.enum(["", "R", "L"]),
  gradYear: text,
  school: text,
  email,
  parents: z.array(organizationGuardian).max(10),
  withdrawn: z.boolean(),
  docs: organizationDocuments.partial().strict(),
});
export const organizationStaffChanges = nonempty({
  name: z.string().trim().min(1).max(160),
  role: z.enum(["Head coach", "Assistant coach", "Team manager", "Volunteer"]),
  email,
  backgroundCheck: z.boolean(),
  safeSport: z.boolean(),
  expires: date,
});
export const organizationTeamInput = z
  .object({ revision, teamId: id, changes: organizationTeamChanges })
  .strict();
export const organizationPlayerInput = z
  .object({ revision, teamId: id, playerId: id, changes: organizationPlayerChanges })
  .strict();
export const organizationStaffInput = z
  .object({ revision, teamId: id, staffId: id, changes: organizationStaffChanges })
  .strict();
export const organizationMoveInput = z
  .object({ revision, teamId: id, playerId: id, destinationTeamId: id })
  .strict();
export const organizationRegistrationChanges = z
  .object({
    kind: z.enum(["tryout", "team-inquiry"]),
    player: z.string().trim().min(1).max(160),
    parent: text,
    email,
    phone: z.string().max(40),
    age: text,
    sport,
    season: text,
    positions: text,
    preferredTeamId: z.string().max(150),
    status: z.enum(["open", "accepted", "declined", "closed"]),
  })
  .partial()
  .strict();
export const organizationRegistrationInput = z
  .object({
    id,
    revision,
    workRevision: revision,
    changes: organizationRegistrationChanges,
    workflow: z
      .object({
        teamId: z.string().max(150),
        assigneeId: z.string().max(200),
        status: z.enum(TRYOUT_STATUSES),
        followUpDate: date,
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.workflow) || Object.keys(v.changes).length > 0,
    "Choose a field to change.",
  );
const rating = z.number().int().min(1).max(5).nullable();
export const organizationRatings = z
  .object({
    contact: rating,
    approach: rating,
    fielding: rating,
    throwing: rating,
    movement: rating,
    knowledge: rating,
    coachability: rating,
  })
  .strict();
export const organizationEvaluationInput = z
  .object({
    id: z.string().uuid(),
    revision,
    registrationId: z.string().max(150).nullable(),
    teamId: z.string().max(150),
    playerName: z.string().trim().min(1).max(120),
    ageGroup: text,
    sport,
    evaluationDate: z.string().refine(validDate),
    status: z.enum(["draft", "submitted"]),
    recommendation: z.enum(["undecided", "invite", "callback", "development", "incomplete"]),
    ratings: organizationRatings,
  })
  .strict();
export const organizationEvaluationReviewInput = z
  .object({ id, revision: z.number().int().positive() })
  .strict();
export const organizationActivityInput = z
  .object({
    id: z.string().uuid(),
    teamId: id,
    revision,
    kind: z.enum(["game", "tournament", "practice"]),
    title: z.string().trim().min(2).max(140),
    date: z.string().refine(validDate),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    location: z.string().trim().min(1).max(240),
    status: z.enum(["scheduled", "cancelled"]),
    laneIds: z
      .array(z.enum(["1", "2", "3-4", "5", "6", "7"]))
      .max(6)
      .default([]),
  })
  .strict()
  .refine((v) => v.endTime > v.startTime, "End time must follow start time.");
export const organizationTryoutEventInput = tryoutEventInput;
export const organizationMessageInput = z
  .object({
    id: z.string().uuid(),
    teamId: id,
    body: z.string().trim().min(1).max(3000),
    confirmedTeamId: id,
  })
  .strict();
export type OrganizationTeamInput = z.infer<typeof organizationTeamInput>;
export type OrganizationPlayerInput = z.infer<typeof organizationPlayerInput>;
export type OrganizationStaffInput = z.infer<typeof organizationStaffInput>;
export type OrganizationMoveInput = z.infer<typeof organizationMoveInput>;
export type OrganizationRegistrationInput = z.infer<typeof organizationRegistrationInput>;
export type OrganizationEvaluationInput = z.infer<typeof organizationEvaluationInput>;
export type OrganizationActivityInput = z.infer<typeof organizationActivityInput>;

/** Result-only corrections cannot change the schedule, travel, charges, or cancellation. */
export const organizationGameResultInput = z
  .object({
    teamId: id,
    id: z.string().uuid(),
    revision,
    status: z.enum(["scheduled", "live", "final"]),
    ourRuns: z.number().int().min(0).max(999),
    oppRuns: z.number().int().min(0).max(999),
    stats: z.array(z.object({ playerId: id, values: battingStats }).strict()).max(100),
  })
  .strict()
  .refine(
    (input) => new Set(input.stats.map((stat) => stat.playerId)).size === input.stats.length,
    "Duplicate player statistics.",
  );
export type OrganizationGameResultInput = z.infer<typeof organizationGameResultInput>;
