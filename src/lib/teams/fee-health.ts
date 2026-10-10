import { project, scheduleRows, type FeeBudget } from "./fee-model";
export const offersPO = (b: FeeBudget, sport: string) => b.poEnabled ?? sport === "baseball";
export function pendingGas(b: FeeBudget): FeeBudget {
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
  const pending: string[] = [];
  if (!b.policy.trim() || !b.reinstatement.trim())
    pending.push("Complete the payment/refund policy and reinstatement rules.");
  if (!finalDue || (today && finalDue < today))
    pending.push(
      "Set a future final payment deadline using the first tournament or an admin override.",
    );
  if (b.secondDue && (b.secondDue > finalDue || (today && b.secondDue < today)))
    pending.push("Review the second payment date override.");
  if (!b.start || !b.end || b.end < b.start) pending.push("Set valid season dates.");
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
  if (!b.uniformId && (!b.readiness?.noUniform || (b.noUniformReason || "").trim().length < 10))
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
  if (b.paymentSchedule && finalDue) {
    try {
      for (const role of (b.poEnabled ? ["full", "po"] : ["full"]) as ("full" | "po")[]) {
        const rows = scheduleRows(b, role === "full" ? p.full : p.po, role, finalDue);
        let previous = today;
        for (const r of rows.slice(1)) {
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
