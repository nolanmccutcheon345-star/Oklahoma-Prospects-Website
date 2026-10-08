import type { Sql } from "../db";
import { ASSESSMENT_LOCK_MESSAGE, ASSESSMENT_PRODUCTS, eligibility } from "../pricing";

export { ASSESSMENT_LOCK_MESSAGE };

type Identity = { billingHouseholdIds: readonly string[]; role: string };

/** Lesson, package, and membership purchases are athlete-specific. Cage rentals are not. */
export function athleteSpecificPurchase(kind: string, productId: string) {
  return (
    kind === "lesson" ||
    kind === "package" ||
    kind === "membership" ||
    productId === "s6" ||
    ASSESSMENT_PRODUCTS.has(productId)
  );
}

/**
 * Verified completion is an `athlete_assessments` row. A missing row, a null
 * flag, or a failed lookup is not assessed — never treated as complete.
 */
export async function verifiedAssessmentOnFile(sql: Sql, athleteId: string) {
  if (!athleteId) return false;
  try {
    const [row] = await sql<{ done: boolean }>`select exists(select 1 from athlete_assessments where athlete_id = ${athleteId}) as done`;
    return row?.done === true;
  } catch {
    return false;
  }
}

/** Household-scoped ids for checkout context. Lookup failure yields no completions. */
export async function householdAssessmentIds(sql: Sql, billingHouseholdIds: readonly string[]) {
  try {
    if (!billingHouseholdIds.length) return new Set<string>();
    const rows = await sql<{ athlete_id: string }>`select distinct a.athlete_id from athlete_assessments a
      join club_athletes c on c.id = a.athlete_id
      where c.household_id = any(${[...billingHouseholdIds]}::text[])`;
    return new Set(rows.map((row) => row.athlete_id).filter((id) => typeof id === "string" && id.length > 0));
  } catch {
    return new Set<string>();
  }
}

/** Desk overlay. Lookup failure clears every completion flag instead of keeping file claims. */
export async function loadVerifiedAssessmentIds(sql: Sql) {
  try {
    const rows = await sql<{ athlete_id: string }>`select distinct athlete_id from athlete_assessments`;
    return new Set(rows.map((row) => row.athlete_id).filter((id) => typeof id === "string" && id.length > 0));
  } catch {
    return new Set<string>();
  }
}

/** Server-owned athlete row. Parents and coaches must own the household; forged ids are denied. */
export async function resolveCheckoutAthlete(
  sql: Sql,
  athleteId: string,
  billingHouseholdIds: readonly string[],
  role: string,
) {
  try {
    const [row] =
      role === "admin"
        ? await sql<{ id: string }>`select id from club_athletes where id = ${athleteId}`
        : await sql<{ id: string }>`select id from club_athletes where id = ${athleteId} and household_id = any(${[...billingHouseholdIds]}::text[])`;
    if (!row?.id) throw new Error("This athlete is not in your household.");
    return { id: row.id };
  } catch (error) {
    if (error instanceof Error && error.message === "This athlete is not in your household.") throw error;
    throw new Error("This athlete is not in your household.");
  }
}

/**
 * Authorize one selected athlete and apply the V2 matrix.
 * Assessment lessons stay available. Ordinary lessons, packages, and memberships require
 * a verified assessment for that athlete — a sibling's completion does not transfer.
 */
export async function assertAthleteMayPurchase(
  sql: Sql,
  input: {
    athleteId?: string | null;
    kind: string;
    productId: string;
    billingHouseholdIds: readonly string[];
    role: string;
  },
) {
  const needsAthlete = athleteSpecificPurchase(input.kind, input.productId);
  if (!needsAthlete && !input.athleteId) return { athleteId: null as string | null, assessed: false };
  if (!input.athleteId)
    throw new Error("Add your athlete in the family portal, then select that athlete to continue.");
  const athlete = await resolveCheckoutAthlete(
    sql,
    input.athleteId,
    input.billingHouseholdIds,
    input.role,
  );
  const assessed = await verifiedAssessmentOnFile(sql, athlete.id);
  if (eligibility(input.kind, input.productId, assessed).locked) throw new Error(ASSESSMENT_LOCK_MESSAGE);
  return { athleteId: athlete.id, assessed };
}

/** Re-check a stored order at payment time. Snapshot flags such as `assessment` are not authority. */
export async function assertStoredOrderAllowed(
  sql: Sql,
  order: {
    athlete_id: string | null;
    kind?: string | null;
    product_id?: string | null;
    snapshot: { kind: string; productId: string; rescheduleFee?: unknown };
  },
  identity: Identity,
) {
  if (order.snapshot.rescheduleFee || order.kind === "reschedule-fee") return;
  const specs = [
    { kind: order.kind || order.snapshot.kind, productId: order.product_id || order.snapshot.productId },
    { kind: order.snapshot.kind, productId: order.snapshot.productId },
  ].filter((spec) => spec.kind && spec.productId);
  const unique = specs.filter(
    (spec, index) => specs.findIndex((other) => other.kind === spec.kind && other.productId === spec.productId) === index,
  );
  const needsAthlete = unique.some((spec) => athleteSpecificPurchase(spec.kind, spec.productId));
  if (!needsAthlete && !order.athlete_id) return;
  const primary = unique[0] ?? { kind: order.snapshot.kind, productId: order.snapshot.productId };
  const gate = await assertAthleteMayPurchase(sql, {
    athleteId: order.athlete_id,
    kind: primary.kind,
    productId: primary.productId,
    billingHouseholdIds: identity.billingHouseholdIds,
    role: identity.role,
  });
  if (unique.some((spec) => eligibility(spec.kind, spec.productId, gate.assessed).locked))
    throw new Error(ASSESSMENT_LOCK_MESSAGE);
}
