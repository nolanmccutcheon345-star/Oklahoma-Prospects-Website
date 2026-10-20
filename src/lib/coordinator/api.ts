import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware, operationalAuthMiddleware } from "../auth/middleware";
import {
  sports,
  id,
  scopeInput,
  recruitingHistoryInput,
  messageHistoryInput,
  assignmentInput,
  publicLeadershipInput,
  rosterEditInput,
  prospectInput,
  requestEditInput,
  messageInput,
  emailInput,
  practiceInput,
  draftInput,
  approvalInput,
  decisionInput,
} from "./contracts";
export const getCoordinatorEntry = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).coordinatorEntry(await getSql(), context.userId);
  });
export const getCoordinatorHome = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).coordinatorHome(await getSql(), context.userId);
  });
export const getStaffRoles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./admin.server")).staffWorkspace(await getSql(), context.userId);
  });
export const saveStaffRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(assignmentInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./admin.server")).saveAssignment(await getSql(), context.userId, data);
  });
export const savePublicLeadership = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(publicLeadershipInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./admin.server")).saveLeadership(await getSql(), context.userId, data);
  });
export const getStaffActivity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        actor: z.string().optional(),
        sport: z.enum(sports).optional(),
        teamId: z.string().optional(),
        after: z.iso.datetime().optional(),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./admin.server")).activityWorkspace(await getSql(), context.userId, data);
  });
export const getCoordinatorTeams = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.enum(["rosters.read", "events.read", "communications.read", "reports.read"]))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).coordinatorTeams(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getCoordinatorRoster = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).roster(await getSql(), context.userId, data);
  });
export const saveCoordinatorRoster = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(rosterEditInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).editRoster(await getSql(), context.userId, data);
  });
export const getCoordinatorRecruiting = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(recruitingHistoryInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).recruiting(await getSql(), context.userId, data);
  });
export const addCoordinatorProspect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(prospectInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).createProspect(
      await getSql(),
      context.userId,
      data,
    );
  });
export const editCoordinatorRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(requestEditInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).editRequest(await getSql(), context.userId, data);
  });
export const getCoordinatorMessages = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(messageHistoryInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).teamCommunications(
      await getSql(),
      context.userId,
      data,
    );
  });
export const sendCoordinatorMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(messageInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).postTeamMessage(
      await getSql(),
      context.userId,
      data,
    );
  });
export const sendCoordinatorEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(emailInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).sendRecruitingEmail(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getCoordinatorReports = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(scopeInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).operationalReports(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getCoordinatorActivity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(scopeInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).ownActivity(await getSql(), context.userId, data);
  });
export const getCoordinatorSchedule = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./scheduling.server")).schedules(await getSql(), context.userId, data);
  });
export const saveCoordinatorPractice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(practiceInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./scheduling.server")).savePractice(await getSql(), context.userId, data);
  });
export const getCoordinatorCages = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(scopeInput.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./scheduling.server")).cageOccupancy(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveCoordinatorDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(draftInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./governance.server")).saveDraft(await getSql(), context.userId, data);
  });
export const getCoordinatorDrafts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(scopeInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./governance.server")).drafts(await getSql(), context.userId, data);
  });
export const requestCoordinatorApproval = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(approvalInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./governance.server")).requestApproval(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getCoordinatorApprovals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./governance.server")).approvals(await getSql(), context.userId);
  });
export const decideCoordinatorApproval = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(decisionInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./governance.server")).decideApproval(
      await getSql(),
      context.userId,
      data,
    );
  });
