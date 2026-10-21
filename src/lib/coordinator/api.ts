import { staffActivityInput } from "./audit-contracts";
import { resetCoordinatorInput } from "./reset-contracts";
import { accessReviewInput, reviewPolicyInput } from "./review-contracts";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  authMiddleware,
  operationalAuthMiddleware,
  coordinatorAuthMiddleware,
} from "../auth/middleware";
import { coordinatorInvitationInput, existingCoordinatorInput } from "./invitation-contracts";
export const assignExistingStaffCoordinator = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(existingCoordinatorInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./invitations.server")).assignExistingCoordinator(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getScheduledCoordinatorReviews = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./scheduled-reviews.server")).scheduledCoordinatorReviews(
      await getSql(),
      context.userId,
    );
  });
export const inviteStaffCoordinator = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(coordinatorInvitationInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./invitations.server")).inviteCoordinator(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getCoordinatorInvitations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./invitations.server")).coordinatorInvitations(
      await getSql(),
      context.userId,
    );
  });
export const revokeStaffCoordinatorInvitation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().uuid() }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./invitations.server")).revokeCoordinatorInvitation(
      await getSql(),
      context.userId,
      data.id,
    );
  });
import {
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
  .validator(staffActivityInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./admin.server")).activityWorkspace(await getSql(), context.userId, data);
  });
export const getCoordinatorTeams = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
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
  .middleware([coordinatorAuthMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).roster(await getSql(), context.userId, data);
  });
export const saveCoordinatorRoster = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(rosterEditInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).editRoster(await getSql(), context.userId, data);
  });
export const getCoordinatorRecruiting = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(recruitingHistoryInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).recruiting(await getSql(), context.userId, data);
  });
export const addCoordinatorProspect = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
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
  .middleware([coordinatorAuthMiddleware])
  .validator(requestEditInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).editRequest(await getSql(), context.userId, data);
  });
export const getCoordinatorMessages = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
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
  .middleware([coordinatorAuthMiddleware])
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
  .middleware([coordinatorAuthMiddleware])
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
  .middleware([coordinatorAuthMiddleware])
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
  .middleware([coordinatorAuthMiddleware])
  .validator(scopeInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operations.server")).ownActivity(await getSql(), context.userId, data);
  });
export const getCoordinatorSchedule = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./scheduling.server")).schedules(await getSql(), context.userId, data);
  });
export const saveCoordinatorPractice = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(practiceInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./scheduling.server")).savePractice(await getSql(), context.userId, data);
  });
export const getCoordinatorCages = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
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
  .middleware([coordinatorAuthMiddleware])
  .validator(draftInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./governance.server")).saveDraft(await getSql(), context.userId, data);
  });
export const getCoordinatorDrafts = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(scopeInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./governance.server")).drafts(await getSql(), context.userId, data);
  });
export const requestCoordinatorApproval = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
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

export const getCoordinatorAccessReviews = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./reviews.server")).coordinatorAccessReviews(
      await getSql(),
      context.userId,
    );
  });
export const recordCoordinatorAccessReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(accessReviewInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./reviews.server")).reviewCoordinatorAccess(
      await getSql(),
      context.userId,
      data,
    );
  });

export const saveCoordinatorAccessReviewPolicy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reviewPolicyInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./reviews.server")).saveCoordinatorReviewPolicy(
      await getSql(),
      context.userId,
      data,
    );
  });

export const resetStaffCoordinatorAccess = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(resetCoordinatorInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./reset.server")).resetCoordinatorAccess(
      await getSql(),
      context.userId,
      data,
    );
  });

import { followupInput, attendanceInput } from "./recruiting-workflow-contracts";
export const getCoordinatorFollowup = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./recruiting-workflow.server")).followupWorkspace(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveCoordinatorFollowup = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(followupInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./recruiting-workflow.server")).saveFollowup(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveCoordinatorTryoutAttendance = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(attendanceInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./recruiting-workflow.server")).saveTryoutAttendance(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getCoordinatorRecruitingDelivery = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./recruiting-workflow.server")).recruitingDelivery(
      await getSql(),
      context.userId,
      data,
    );
  });

import { transferRecoveryInput } from "./contracts";
export const getCoordinatorTransferRecovery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.string().uuid())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./governance.server")).transferRecovery(
      await getSql(),
      context.userId,
      data,
    );
  });
export const recoverCoordinatorTransfer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(transferRecoveryInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./governance.server")).recoverTransfer(
      await getSql(),
      context.userId,
      data,
    );
  });

import { teamOperationsInput } from "./team-operations-contracts";
export const getCoordinatorTeamOperations = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./team-operations.server")).teamOperations(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveCoordinatorTeamOperations = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(teamOperationsInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./team-operations.server")).saveTeamOperations(
      await getSql(),
      context.userId,
      data,
    );
  });

import {
  programEventsInput,
  programEventCreateInput,
  programEventSettingsInput,
  programEventSessionInput,
  programEventMoveInput,
  programEventEnrollmentInput,
} from "./program-events-contracts";
export const getCoordinatorProgramEvents = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(programEventsInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./program-events.server")).programEvents(
      await getSql(),
      context.userId,
      data,
    );
  });
export const createCoordinatorProgramEvent = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(programEventCreateInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./program-events.server")).createProgramEvent(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveCoordinatorProgramEvent = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(programEventSettingsInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./program-events.server")).saveProgramEvent(
      await getSql(),
      context.userId,
      data,
    );
  });
export const addCoordinatorProgramSession = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(programEventSessionInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./program-events.server")).addProgramSession(
      await getSql(),
      context.userId,
      data,
    );
  });
export const moveCoordinatorProgramSession = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(programEventMoveInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./program-events.server")).moveProgramSession(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveCoordinatorProgramEnrollment = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(programEventEnrollmentInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./program-events.server")).saveProgramEnrollment(
      await getSql(),
      context.userId,
      data,
    );
  });

import {
  scopedTryoutListInput,
  scopedTryoutSaveInput,
  scopedTryoutReviewInput,
} from "./tryout-scheduling-contracts";
export const getCoordinatorTryoutSchedule = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(scopedTryoutListInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./tryout-scheduling.server")).scopedTryouts(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveCoordinatorTryout = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(scopedTryoutSaveInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./tryout-scheduling.server")).saveScopedTryout(
      await getSql(),
      context.userId,
      data,
    );
  });
export const requestCoordinatorTryoutReview = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(scopedTryoutReviewInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./tryout-scheduling.server")).requestTryoutReview(
      await getSql(),
      context.userId,
      data,
    );
  });

import { programEventReviewInput } from "./program-events-contracts";
export const requestCoordinatorProgramReview = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(programEventReviewInput)
  .handler(async ({ data, context }) => {
    const { getSql } = await import("../db");
    return (await import("./program-events.server")).requestProgramEventReview(
      await getSql(),
      context.userId,
      data,
    );
  });

import {
  rosterCandidateInput,
  rosterClearanceInput,
  rosterClearanceRevokeInput,
  rosterEligibleInput,
  rosterAdmissionInput,
  rosterInformationInput,
} from "./roster-contracts";
export const getRosterEligibilityReview = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(rosterCandidateInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./roster.server")).ownerRosterEligibility(
      await getSql(),
      context.userId,
      data,
    );
  });
export const approveRosterEligibility = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(rosterClearanceInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./roster.server")).clearRosterEligibility(
      await getSql(),
      context.userId,
      data,
    );
  });
export const revokeRosterEligibility = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(rosterClearanceRevokeInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./roster.server")).revokeRosterEligibility(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getEligibleCoordinatorAthletes = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(rosterEligibleInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./roster.server")).eligibleRosterAthletes(
      await getSql(),
      context.userId,
      data,
    );
  });
export const addEligibleCoordinatorAthlete = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(rosterAdmissionInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./roster.server")).addEligibleRosterAthlete(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveCoordinatorPlayerInformation = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(rosterInformationInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./roster.server")).saveRosterInformation(
      await getSql(),
      context.userId,
      data,
    );
  });

import { publishDraftInput, unpublishPostInput, contentVersionsInput } from "./content-contracts";
export const publishReviewedCoordinatorDraft = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(publishDraftInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./content-publication.server")).publishCoordinatorDraft(
      await getSql(),
      context.userId,
      data,
    );
  });
export const withdrawPublishedCoordinatorPost = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(unpublishPostInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./content-publication.server")).withdrawCoordinatorPost(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getCoordinatorDraftVersions = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(contentVersionsInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./content-publication.server")).draftVersions(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getOwnerPublishedCoordinatorContent = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./content-publication.server")).ownerPublishedContent(
      await getSql(),
      context.userId,
    );
  });
export const getPublicProgramContent = createServerFn({ method: "GET" })
  .validator(z.enum(["baseball", "softball"]))
  .handler(async ({ data }) => {
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "no-store");
    const { getSql } = await import("../db");
    return (await import("./content-publication.server")).publicProgramContent(
      await getSql(),
      data,
    );
  });

import {
  noticeProposalInput,
  noticeSendInput,
  noticeHistoryInput,
  noticeCancelInput,
  messageReviewListInput,
  messageReviewInput,
} from "./communication-contracts";
export const previewCoordinatorNotice = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(noticeProposalInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./communications.server")).previewTeamNotice(
      await getSql(),
      context.userId,
      data,
    );
  });
export const queueCoordinatorNotice = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(noticeSendInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./communications.server")).queueTeamNotice(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getCoordinatorNoticeHistory = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(noticeHistoryInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./communications.server")).teamNoticeHistory(
      await getSql(),
      context.userId,
      data,
    );
  });
export const cancelCoordinatorNotice = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(noticeCancelInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./communications.server")).cancelTeamNotice(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getReviewableTeamMessages = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(messageReviewListInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./communications.server")).reviewableTeamMessages(
      await getSql(),
      context.userId,
      data,
    );
  });
export const reviewCoordinatorTeamMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(messageReviewInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./communications.server")).reviewTeamMessage(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getCoordinatorNoticeTargets = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(
    z.object({ teamId: z.string().min(1).max(200), kind: z.enum(["practice", "event"]) }).strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./communications.server")).noticeTargets(
      await getSql(),
      context.userId,
      data,
    );
  });

export const getOwnerCommunicationArchive = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ beforeId: z.number().int().positive().optional() }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./communications.server")).ownerCommunicationArchive(
      await getSql(),
      context.userId,
      data,
    );
  });

import {
  publicationCandidateInput,
  publicationPreviewInput,
  publicationRequestInput,
  publicationWithdrawInput,
} from "./player-publication-contracts";
export const getPlayerPublicationCandidates = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(publicationCandidateInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./player-publication.server")).publicationCandidates(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getPlayerPublicationPreview = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(publicationPreviewInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./player-publication.server")).previewPlayerPublication(
      await getSql(),
      context.userId,
      data,
    );
  });
export const submitPlayerPublication = createServerFn({ method: "POST" })
  .middleware([coordinatorAuthMiddleware])
  .validator(publicationRequestInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./player-publication.server")).requestPlayerPublication(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getOwnerPlayerPublications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./player-publication.server")).ownerPlayerPublications(
      await getSql(),
      context.userId,
    );
  });
export const withdrawOwnerPlayerPublication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(publicationWithdrawInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./player-publication.server")).withdrawPlayerPublication(
      await getSql(),
      context.userId,
      data,
    );
  });

import { recoveryPreviewInput, recoveryApplyInput } from "./recovery-contracts";
export const getCoordinatorRecoveryHistory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ beforeId: z.number().int().positive().optional() }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./recovery.server")).recoveryHistory(
      await getSql(),
      context.userId,
      data.beforeId,
    );
  });
export const getCoordinatorRecoveryPreview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(recoveryPreviewInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./recovery.server")).recoveryPreview(
      await getSql(),
      context.userId,
      data,
    );
  });
export const applyCoordinatorRecovery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(recoveryApplyInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./recovery.server")).applyRecovery(await getSql(), context.userId, data);
  });

import { privacyPolicyInput, privacyReviewInput, backupReviewInput } from "./privacy-contracts";
export const getCoordinatorPrivacy = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./privacy.server")).privacyWorkspace(await getSql(), context.userId);
  });
export const saveCoordinatorPrivacyPolicy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(privacyPolicyInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./privacy.server")).savePrivacyPolicy(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveCoordinatorPrivacyReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(privacyReviewInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./privacy.server")).recordPrivacyReview(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getCoordinatorArchiveStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./security-archive.server")).archiveStatus(
      await getSql(),
      context.userId,
    );
  });

export const saveCoordinatorBackupReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(backupReviewInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./security-archive.server")).recordBackupReview(
      await getSql(),
      context.userId,
      data,
    );
  });
