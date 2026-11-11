/**
 * Cross-team acceptance gates. These contracts deliberately do not activate
 * checkout, fulfill orders, or grant bots access to customer records.
 */
export type LaunchGate =
  | "providerConfigured"
  | "sandboxAccepted"
  | "webhooksVerified"
  | "idempotencyVerified"
  | "financialReconciliation"
  | "ownerApproved";

export const COMMERCE_GATES: readonly LaunchGate[] = [
  "providerConfigured", "sandboxAccepted", "webhooksVerified",
  "idempotencyVerified", "financialReconciliation", "ownerApproved",
];

export type LaunchEvidence = Partial<Record<LaunchGate, {
  passed: boolean;
  reference: string;
  checkedAt: string;
}>>;

export function missingLaunchGates(evidence: LaunchEvidence): LaunchGate[] {
  return COMMERCE_GATES.filter(gate => {
    const record = evidence[gate];
    return !record?.passed || !record.reference.trim() ||
      !Number.isFinite(Date.parse(record.checkedAt));
  });
}

export function assertCommerceReady(evidence: LaunchEvidence): void {
  const missing = missingLaunchGates(evidence);
  if (missing.length) throw new Error(`Checkout launch blocked: ${missing.join(", ")}`);
}

export type CoachAssignment = {
  teamId: string;
  coachId: string;
  role: "head" | "assistant";
  seasonId: string;
  active: boolean;
};

export function validateCoachAssignments(rows: CoachAssignment[]): void {
  const unique = new Set<string>();
  const headTeams = new Set<string>();
  for (const row of rows) {
    if (![row.teamId, row.coachId, row.seasonId].every(v => v.trim().length > 0))
      throw new Error("A team, canonical coach ID, and season are required.");
    const key = [row.seasonId, row.teamId, row.coachId, row.role].join("\u0000");
    if (unique.has(key)) throw new Error("Duplicate coach assignment.");
    unique.add(key);
    if (row.active && row.role === "head") {
      const teamKey = [row.seasonId, row.teamId].join("\u0000");
      if (headTeams.has(teamKey)) throw new Error("Only one active head coach per team and season.");
      headTeams.add(teamKey);
    }
  }
}

export type MerchandiseCheckoutEvidence = {
  activeSku: boolean;
  inventoryReserved: boolean;
  addressValidated: boolean;
  shippingQuoted: boolean;
  taxQuoted: boolean;
  paymentProviderReady: boolean;
  fulfillmentProviderReady: boolean;
};

export function canSubmitMerchandiseOrder(e: MerchandiseCheckoutEvidence): boolean {
  return Object.values(e).every(v => v === true);
}

export type BotEvidenceEvent = {
  version: 1;
  eventType: string;
  objectId: string;
  correlationId: string;
  occurredAt: string;
  source: string;
  environment: "sandbox" | "production";
  counts: Record<string, number>;
};

/** Bot reports accept aggregated metrics only, never raw PII or freeform payloads. */
export function sanitizeBotEvidence(input: BotEvidenceEvent): BotEvidenceEvent {
  const id = /^[a-zA-Z0-9_.:-]{1,100}$/;
  if (input.version !== 1 || !id.test(input.eventType) ||
      !id.test(input.objectId) || !id.test(input.correlationId) ||
      !id.test(input.source) || !Number.isFinite(Date.parse(input.occurredAt)) ||
      !["sandbox", "production"].includes(input.environment))
    throw new Error("Invalid reporting event metadata.");
  if (Object.keys(input.counts).length > 30 ||
      Object.entries(input.counts).some(([key, value]) =>
        !id.test(key) || !Number.isFinite(value) || value < 0))
    throw new Error("Only bounded, nonnegative aggregate metrics are allowed.");
  return {
    version: 1, eventType: input.eventType, objectId: input.objectId,
    correlationId: input.correlationId, occurredAt: input.occurredAt,
    source: input.source, environment: input.environment,
    counts: { ...input.counts },
  };
}
