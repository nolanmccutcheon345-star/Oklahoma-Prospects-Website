import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "../auth/middleware";
import {
  assignableCandidatesInput,
  assignToTeamInput,
  setAssignmentStatusInput,
} from "./roster-assignment-contracts";

export const getAssignableCandidates = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(assignableCandidatesInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { listAssignableCandidates } = await import("./roster-assignment.server");
    return listAssignableCandidates(await getSql(), context.userId, data.teamId);
  });
export const assignPlayerToTeam = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(assignToTeamInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { assignToTeam } = await import("./roster-assignment.server");
    return assignToTeam(await getSql(), context.userId, data);
  });
export const setRosterAssignmentStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(setAssignmentStatusInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { setAssignmentStatus } = await import("./roster-assignment.server");
    return setAssignmentStatus(await getSql(), context.userId, data);
  });
