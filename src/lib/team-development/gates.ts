/**
 * Team Development safety gates (pure, no I/O).
 *
 * Every function here fails closed. Nothing in this file establishes a limit:
 * - No throw/pitch count, age limit or rest value is defined in the repo.
 * - The only count maximum is the owner-controlled pin (owner item 38), held off
 *   the box and verified with the owner's public key at runtime. A pin or registry
 *   written into the repo establishes nothing (S01 Amendment 6).
 * - Over-cap counts are accepted, flagged and counted at the entered value, never
 *   clamped or rejected (S01 Ruling 3 Amendment 1, b8d362d).
 */
import { createPublicKey, verify } from "node:crypto";

/** S01 Ruling 7 copy (verbatim). */
export const TEAM_DEV_WHOLE_SAVE_REFUSED_MESSAGE =
  "This didn't save because of a problem with a stored training-plan record, not your entry. Keep your entry, write the counts and any soreness in the team log, and tell the admin.";
export const TEAM_DEV_PARTIAL_SAVE_MESSAGE =
  "Your other entries saved. One stored training-plan record couldn't be processed, and the admin has been told.";

export function storedRecordFailureMessage(otherEntriesSaved: boolean) {
  return otherEntriesSaved ? TEAM_DEV_PARTIAL_SAVE_MESSAGE : TEAM_DEV_WHOLE_SAVE_REFUSED_MESSAGE;
}

export const TEAM_DEV_WINDMILL_REASON = "softball_windmill_blocked";
export const TEAM_DEV_WINDMILL_MESSAGE =
  "Softball windmill pitching volume is blocked for every role, including admin, until the owner approves specific limits.";

/** Windmill placeholder (THR-SB-WM-*) or any record flagged windmill_blocked. */
export function isWindmillBlocked(id: string, payload: Record<string, unknown> | null | undefined) {
  if (/^THR-SB-WM-/i.test(id.trim())) return true;
  if (!payload) return false;
  if (payload.windmill_blocked === true) return true;
  const flags = Array.isArray(payload.safety_flags) ? payload.safety_flags.map(String) : [];
  return flags.includes("WINDMILL_BLOCKED_ALL_ROLES");
}

const NOT_A_PERSON =
  /\b(psa(-\w+)?|bot|agent|grok|claude|chatgpt|gpt|openai|assistant|system|automation|script|seed|a[1-6]|b[1-6]|s01|e03|p04|f02|test|unknown|n\/a|tbd)\b/i;

/**
 * Review and activation sign-offs must name a human (first and last name). Bot or
 * worker identifiers, role names and placeholders are refused.
 */
export function assertNamedHuman(value: unknown, label: string): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 5 || name.length > 120 || name.split(" ").length < 2 || !/^[\p{L}][\p{L}' .,-]+$/u.test(name) || NOT_A_PERSON.test(name))
    throw new Error(`${label} must be a named human (first and last name).`);
  return name;
}

export type TeamDevCountKind = "pitches" | "throws";
export type OwnerCountPin =
  | Readonly<{ status: "pinned"; maxima: Readonly<Partial<Record<TeamDevCountKind, number>>>; approvedBy: string; approvedAt: string }>
  | Readonly<{ status: "unpinned"; reason: string }>;

const PIN_SCOPE = "team-development-count-max";

function unpinned(reason: string): OwnerCountPin {
  return Object.freeze({ status: "unpinned" as const, reason });
}
function b64url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Reads the owner pin from the environment (`TEAM_DEV_OWNER_COUNT_PIN`, a
 * `<base64url payload>.<base64url ed25519 signature>` token) and verifies it with
 * `TEAM_DEV_OWNER_PIN_PUBLIC_KEY` (SPKI PEM or base64 DER). Both are supplied
 * off-box by the owner. Missing, malformed, unsigned or mismatched -> unpinned.
 */
export function readOwnerCountPin(env: Record<string, string | undefined> = process.env): OwnerCountPin {
  const token = env.TEAM_DEV_OWNER_COUNT_PIN?.trim();
  const keyText = env.TEAM_DEV_OWNER_PIN_PUBLIC_KEY?.trim();
  if (!token || !keyText) return unpinned("owner_pin_missing");
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return unpinned("owner_pin_malformed");
  let payload: unknown;
  try {
    const key = keyText.includes("BEGIN")
      ? createPublicKey(keyText)
      : createPublicKey({ key: Buffer.from(keyText, "base64"), format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ed25519") return unpinned("owner_pin_key_type");
    const body = b64url(parts[0]);
    if (!verify(null, body, key, b64url(parts[1]))) return unpinned("owner_pin_signature_mismatch");
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return unpinned("owner_pin_malformed");
  }
  const p = payload as { scope?: unknown; maxima?: Record<string, unknown>; approvedBy?: unknown; approvedAt?: unknown };
  if (!p || p.scope !== PIN_SCOPE || !p.maxima || typeof p.maxima !== "object") return unpinned("owner_pin_scope_mismatch");
  const maxima: Partial<Record<TeamDevCountKind, number>> = {};
  for (const [kind, raw] of Object.entries(p.maxima)) {
    if (kind !== "pitches" && kind !== "throws") return unpinned("owner_pin_unknown_kind");
    if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw <= 0) return unpinned("owner_pin_invalid_value");
    maxima[kind] = raw;
  }
  let approvedBy: string;
  try {
    approvedBy = assertNamedHuman(p.approvedBy, "Owner pin approver");
  } catch {
    return unpinned("owner_pin_approver_missing");
  }
  if (typeof p.approvedAt !== "string" || Number.isNaN(Date.parse(p.approvedAt))) return unpinned("owner_pin_date_missing");
  return Object.freeze({ status: "pinned" as const, maxima: Object.freeze(maxima), approvedBy, approvedAt: p.approvedAt });
}

export type CountEvaluation = Readonly<
  | { accepted: true; countedValue: number; enteredValue: number; flagged: boolean; flag: "over_owner_pin" | "owner_pin_unavailable" | null; max: number | null }
  | { accepted: false; reason: "invalid_entry" }
>;

/**
 * Accept + flag + count at the entered value. An unavailable pin fails closed:
 * the count still saves (refusing could make users stop logging) but is flagged
 * for admin review and is never reported as within a limit.
 */
export function evaluateTeamDevCount(entered: unknown, kind: TeamDevCountKind, pin: OwnerCountPin): CountEvaluation {
  const value = typeof entered === "string" && /^\d+$/.test(entered.trim()) ? Number(entered.trim()) : entered;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    return Object.freeze({ accepted: false as const, reason: "invalid_entry" as const });
  const max = pin.status === "pinned" ? pin.maxima[kind] ?? null : null;
  if (max == null)
    return Object.freeze({ accepted: true as const, countedValue: value, enteredValue: value, flagged: true, flag: "owner_pin_unavailable" as const, max: null });
  const over = value > max;
  return Object.freeze({ accepted: true as const, countedValue: value, enteredValue: value, flagged: over, flag: over ? ("over_owner_pin" as const) : null, max });
}
