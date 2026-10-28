import { isIndependent, independentDraft, independentIssues } from "./independent-model";
import { calendarBillableMonths, serviceMonths } from "./season-months";
import {
  withBillableMonths,
  pastDueReviewed,
  project,
  scheduleRows,
  type FeeBudget,
} from "./fee-model";
import type { TeamActivity } from "./activity-contracts";
import { unsupportedTeamPaymentPolicy } from "./payment-policy";

export function publicationCostIssues(
  b: FeeBudget,
  activities: TeamActivity[],
  catalog: { id: string; org: string; start: string; fee: number }[],
  selected: string[],
) {
  if (isIndependent(b)) return [];
  const issues: string[] = [];
  const inSeason = (date: string) => Boolean(date && date >= b.start && date <= b.end);
  const scheduled = activities.filter(
    (a) => a.kind !== "practice" && a.status !== "cancelled" && inSeason(a.date),
  );
  const events = catalog.filter(
    (e) => selected.includes(e.id) && e.org !== "Team schedule" && inSeason(e.start),
  );
  if (
    b.tournamentEstimate === undefined &&
    (!b.scheduleCostsAutomatic ||
      (!scheduled.length && !events.length) ||
      scheduled.some((a) => !Number.isSafeInteger(a.entryFee) || a.entryFee! < 0) ||
      events.some((e) => !Number.isFinite(e.fee) || e.fee < 0))
  )
    issues.push(
      "Complete the team event schedule and entry fees, or enter an admin tournament-fee estimate (including an explicit $0 when appropriate).",
    );
  if (!b.uniformId && b.uniformEstimate === undefined)
    issues.push(
      "Select an active uniform package or enter an admin uniform fee per player (including an explicit $0 for reused uniforms).",
    );
  return issues;
}
export const offersPO = (b: FeeBudget, sport: string) => b.poEnabled ?? sport === "baseball";
export function pendingGas(b: FeeBudget): FeeBudget {
  if (isIndependent(b)) return independentDraft(b);
  b = {
    ...b,
    readiness: b.readiness || {
      schedule: false,
      gas: false,
      hotels: false,
      other: false,
      processing: false,
      noUniform: false,
    },
  };
  return !b.readiness?.schedule
    ? {
        ...b,
        readiness: { ...b.readiness!, gas: false },
        costs: b.costs.map((c) =>
          c.id === "cost-3" || c.name === "Coach travel" ? { ...c, cents: 0 } : c,
        ),
      }
    : b;
}
export function feeHealth(
  b: FeeBudget,
  {
    key = "",
    seasonLabel = "",
    overheadReviewed = false,
    full = b.baseline,
    po = 0,
    finalDue = b.deadlineOverride,
    today = "",
  }: {
    key?: string;
    seasonLabel?: string;
    overheadReviewed?: boolean;
    full?: number;
    po?: number;
    finalDue?: string;
    today?: string;
  } = {},
) {
  if (isIndependent(b)) {
    const pending = independentIssues(b, today);
    return {
      pending,
      shortfall: 0,
      funded: true,
      targetMet: true,
      ready: !pending.length,
      status: pending.length ? "INCOMPLETE" : "READY TO PUBLISH",
    };
  }
  b = withBillableMonths(b);
  const pending: string[] = [];
  if (
    b.programModel === 3 &&
    b.billableMonthsOverride !== undefined &&
    (b.billableMonthsReason || "").trim().length < 10
  )
    pending.push("Explain the admin override for Actual Billable Months.");
  if (!b.policy.trim() || !b.reinstatement.trim())
    pending.push("Complete the payment/refund policy and reinstatement rules.");
  pending.push(...unsupportedTeamPaymentPolicy(b.policy, b.automaticPayments));
  if (!finalDue || (!b.eventPaymentSchedule && today && finalDue < today))
    pending.push(
      "Set a future final payment deadline using the first tournament or an admin override.",
    );
  if (
    !b.eventPaymentSchedule &&
    b.secondDue &&
    (b.secondDue > finalDue || (today && b.secondDue < today))
  )
    pending.push("Review the second payment date override.");
  if (!b.start || !b.end || b.end < b.start) pending.push("Set valid season dates.");
  if (today && b.end && b.end < today)
    pending.push(
      "This season has ended. Set the correct upcoming season dates before publishing a new offer; historical agreements remain unchanged.",
    );
  if (b.programModel === 3 && b.start && b.end && calendarBillableMonths(b.start, b.end) === null)
    pending.push("Set valid program dates spanning no more than 36 billable calendar months.");
  const duration =
    b.programModel === 3 ? calendarBillableMonths(b.start, b.end) : serviceMonths(b.start, b.end);
  if (b.programModel !== 3 && duration !== null && Math.abs(duration - b.months) > 0.15)
    pending.push(
      `Service dates cover approximately ${duration} months, but the budget bills ${b.months}. Correct the dates or billable months before publishing.`,
    );
  const named = ["winter", "spring", "summer", "fall"].filter((s) =>
    seasonLabel.toLowerCase().includes(s),
  );
  const namedKey =
    named.length === 2 && named.includes("spring") && named.includes("summer")
      ? "springSummer"
      : named.length === 1
        ? named[0]
        : "";
  const season = key.split(":")[2] || namedKey;
  if (key && namedKey && namedKey !== season)
    pending.push(
      "Team season classification and master budget row disagree. Apply the correct row and confirm team seasons.",
    );
  if (
    season === "spring" &&
    b.start &&
    b.end &&
    b.start.slice(0, 4) === b.end.slice(0, 4) &&
    Number(b.start.slice(5, 7)) <= 6 &&
    Number(b.end.slice(5, 7)) >= 7
  )
    pending.push(
      "Spring budget runs into July or later. Apply Spring + Summer defaults, or shorten the season dates.",
    );
  if (!b.readiness?.schedule) pending.push("Review the tournament schedule and entry costs.");
  if (!b.readiness?.gas) pending.push("Review the gas stipend after the schedule.");
  if (!b.readiness?.hotels) pending.push("Review hotel stays and the nightly stipend.");
  if (!b.readiness?.other) pending.push("Review other direct costs.");
  if (
    !b.uniformId &&
    b.uniformEstimate === undefined &&
    (!b.readiness?.noUniform || (b.noUniformReason || "").trim().length < 10)
  )
    pending.push("Select a uniform package or explain why no purchase is required.");
  if (
    !b.readiness?.processing ||
    (!b.processingBps && !b.processingFixed && (b.processingZeroReason || "").trim().length < 10)
  )
    pending.push("Review the actual processing rate; explain any zero-fee arrangement.");
  if (!overheadReviewed)
    pending.push(
      "Complete and confirm the actual monthly facility costs and staffing in the master editor.",
    );
  const p = project(b, full, po);
  if (
    b.poEnabled &&
    b.poModel === 2 &&
    ([b.poTeamBps, b.poUniformBps, b.poContingencyBps, b.poProcessingBps].some(
      (n) => (n ?? 10000) < 10000,
    ) ||
      b.poOrg === 0) &&
    (b.poOverrideReason || "").trim().length < 10
  )
    pending.push(
      "Explain the explicit admin override for discounted PO cost allocations or a zero PO organization fee.",
    );
  if (b.eventPaymentSchedule && !finalDue)
    pending.push("First scheduled event is missing; payment schedule is incomplete.");
  if ((b.paymentSchedule || b.eventPaymentSchedule) && finalDue) {
    try {
      for (const role of (b.poEnabled ? ["full", "po"] : ["full"]) as ("full" | "po")[]) {
        const rows = scheduleRows(b, role === "full" ? p.full : p.po, role, finalDue);
        const past = Boolean(b.eventPaymentSchedule && today && rows.some((r) => r.due < today));
        if (past && !pastDueReviewed(b, finalDue))
          throw Error(
            "Payment dates are already past. Admin review and a reason are required before publishing.",
          );
        let previous = b.eventPaymentSchedule && pastDueReviewed(b, finalDue) ? "" : today;
        for (const r of b.eventPaymentSchedule ? rows : rows.slice(1)) {
          if (!r.due || r.due < previous || r.due > finalDue)
            throw Error("Complete the custom payment dates in order before publication.");
          previous = r.due;
        }
      }
    } catch (e) {
      pending.push((e as Error).message);
    }
  }
  const shortfall = Math.max(0, p.direct + p.reserve + p.processing - p.totalRevenue);
  const targetMet = p.contribution >= p.membership + p.organization - p.serviceCosts;
  return {
    pending,
    shortfall,
    funded: shortfall === 0,
    targetMet,
    ready: !pending.length && !shortfall && targetMet,
    status: shortfall
      ? "UNDERFUNDED"
      : pending.length
        ? "INCOMPLETE"
        : targetMet
          ? "READY TO PUBLISH"
          : "FUNDED",
  };
}
