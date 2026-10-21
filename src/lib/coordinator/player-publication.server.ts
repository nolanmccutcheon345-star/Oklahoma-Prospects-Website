import { createHash } from "node:crypto";
import type { z } from "zod";
import type { Sql } from "../db";
import type { ClubRecord } from "../teams/types";
import { hasPublicRosterConsent } from "../roster-consent";
import { CONSENT_VERSION } from "../recruiting-contracts";
import { secured, authority, requireTeam, audit, CoordinatorDenied } from "./access.server";
import {
  publicationCandidateInput,
  publicationPreviewInput,
  publicationRequestInput,
  publicationWithdrawInput,
  publicationPermission,
} from "./player-publication-contracts";
type Kind = "roster" | "photo";
class PublicationUnavailable extends Error {}
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : v;
const digest = (v: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(v)))
    .digest("hex");
/** Pure account relationship read. Never claim/create a household as a side effect. */
export async function currentPublicationGuardian(
  tx: Sql,
  householdId: string,
  by: { id?: string; email?: string },
) {
  const [u] = await tx<{
    id: string;
    email: string;
  }>`select u.id,lower(trim(u.email)) email from "user" u join profiles p on p.user_id=u.id join club_households h on h.id=${householdId} where u."emailVerified" and u."disabledAt" is null and (${by.id || null}::text is null or u.id=${by.id || null}) and (${by.email?.trim().toLowerCase() || null}::text is null or lower(trim(u.email))=${by.email?.trim().toLowerCase() || null}) and (exists(select 1 from person_guardian_links g where g.user_id=u.id and g.household_id=h.id) or (p.role<>'player' and exists(select 1 from household_members m where m.user_id=u.id and m.household_id=h.id))) order by u.id limit 1`;
  return u || null;
}
async function source(tx: Sql, teamId: string, playerId: string, kind: Kind) {
  const [c] = await tx<{
    payload: ClubRecord;
  }>`select payload from club_state where id='oklahoma-prospects' and not demo for share`;
  const team = c?.payload.teams.find((t) => t.id === teamId && !t.closed),
    p = team?.roster.find((p) => p.id === playerId && !p.withdrawn);
  if (!team || !p || !["baseball", "softball"].includes(team.sport)) throw new CoordinatorDenied();
  if (kind === "roster") {
    if (!hasPublicRosterConsent(p.rosterConsent))
      throw new PublicationUnavailable("Current signed roster publication consent is required.");
    const guardian = await currentPublicationGuardian(tx, p.familyId, {
      email: p.rosterConsent!.signerEmail,
    });
    if (!guardian)
      throw new PublicationUnavailable("A current verified guardian relationship is required.");
    const snapshot = {
      kind,
      teamId,
      playerId,
      name: p.name,
      number: p.number,
      consent: p.rosterConsent,
      guardianId: guardian.id,
      householdId: p.familyId,
    };
    return {
      targetId: p.id,
      sourceDigest: digest(snapshot),
      display: { name: p.name, number: p.number, photo: "" },
      kind,
      teamId,
      playerId,
    };
  }
  const [r] = await tx<{
    athlete_id: string;
    name: string;
    household_id: string;
    revision: number;
    photo: string;
    consent_by: string;
    consent_at: string;
    consent_name: string;
    consent_version: string;
  }>`select r.athlete_id,a.name,a.household_id,r.revision,r.payload->>'photo' photo,r.consent_by,r.consent_at::text,r.consent_name,r.consent_version from recruiting_roster_links l join recruiting_profiles r on r.athlete_id=l.athlete_id join club_athletes a on a.id=r.athlete_id where l.team_id=${teamId} and l.roster_id=${playerId} and r.published and r.consent_version=${CONSENT_VERSION} and r.consent_by is not null and coalesce(r.consent_name,'')<>'' and r.consent_at is not null for share of r,a,l`;
  if (!r?.photo)
    throw new PublicationUnavailable("A guardian-consented recruiting photo is required.");
  const guardian = await currentPublicationGuardian(tx, r.household_id, { id: r.consent_by });
  if (!guardian)
    throw new PublicationUnavailable("A current verified guardian relationship is required.");
  return {
    targetId: r.athlete_id,
    sourceDigest: digest({ kind, teamId, playerId, ...r, guardianId: guardian.id }),
    display: { name: r.name, number: "", photo: r.photo },
    kind,
    teamId,
    playerId,
  };
}
export async function publicationCandidates(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof publicationCandidateInput>,
) {
  const v = publicationCandidateInput.parse(raw);
  return secured(sql, actor, "publication.candidates", async (tx) => {
    await requireTeam(tx, actor, publicationPermission(v.kind), v.teamId);
    const [c] = await tx<{
      payload: ClubRecord;
    }>`select payload from club_state where id='oklahoma-prospects' and not demo`;
    const items = [];
    for (const p of c.payload.teams
      .find((t) => t.id === v.teamId)!
      .roster.filter((p) => !p.withdrawn)) {
      // A publication-request grant exposes only the consented identity being proposed.
      try {
        const s = await source(tx, v.teamId, p.id, v.kind);
        items.push({ playerId: p.id, name: s.display.name });
      } catch (e) {
        if (!(e instanceof PublicationUnavailable || e instanceof CoordinatorDenied)) throw e;
      }
    }
    await audit(tx, actor, "publication.candidates", v.teamId, "allowed", {
      kind: v.kind,
      count: items.length,
    });
    return items;
  });
}
export async function previewPlayerPublication(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof publicationPreviewInput>,
) {
  const v = publicationPreviewInput.parse(raw);
  return secured(sql, actor, "publication.preview", async (tx) => {
    await requireTeam(tx, actor, publicationPermission(v.kind), v.teamId);
    const s = await source(tx, v.teamId, v.playerId, v.kind);
    await audit(tx, actor, "publication.preview", s.targetId, "allowed", {
      kind: v.kind,
      sourceDigest: s.sourceDigest,
    });
    return s;
  });
}
export async function requestPlayerPublication(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof publicationRequestInput>,
) {
  const v = publicationRequestInput.parse(raw);
  return secured(sql, actor, "publication.request", async (tx) => {
    const team = await requireTeam(tx, actor, publicationPermission(v.kind), v.teamId),
      s = await source(tx, v.teamId, v.playerId, v.kind);
    if (s.sourceDigest !== v.sourceDigest)
      throw Error("Identity, consent or photo changed. Preview again.");
    const proposal = { ...s };
    const [old] = await tx<{
      same: boolean;
    }>`select requester_id=${actor} and kind=${v.kind + "-publication"} and proposal=${JSON.stringify(proposal)}::jsonb and reason=${v.reason} same from coordinator_approvals where id=${v.id}`;
    if (old) {
      if (!old.same) throw new CoordinatorDenied();
      return { ok: true };
    }
    await tx`insert into coordinator_approvals(id,requester_id,sport,team_id,kind,target_id,proposal,reason) values(${v.id},${actor},${team.sport},${team.id},${v.kind + "-publication"},${s.targetId},${JSON.stringify(proposal)}::jsonb,${v.reason})`;
    await audit(
      tx,
      actor,
      "publication.request",
      s.targetId,
      "allowed",
      { kind: v.kind, sourceDigest: s.sourceDigest },
      team.sport,
      team.id,
    );
    return { ok: true };
  });
}
export async function approvePlayerPublication(
  tx: Sql,
  reviewer: string,
  actor: string,
  approvalId: string,
  kind: Kind,
  teamId: string,
  targetId: string,
  proposal: unknown,
) {
  await authority(tx, reviewer, "staff_approvals.review");
  const v = proposal as { playerId: string; sourceDigest: string };
  await requireTeam(tx, actor, publicationPermission(kind), teamId);
  const s = await source(tx, teamId, v.playerId, kind);
  if (s.targetId !== targetId || s.sourceDigest !== v.sourceDigest)
    throw Error("Identity, consent or photo changed. Request a fresh review.");
  await tx`insert into coordinator_publication_controls(kind,target_id,team_id,visible,source_digest,reviewer_id,approval_id) values(${kind},${targetId},${teamId},true,${s.sourceDigest},${reviewer},${approvalId}) on conflict(kind,target_id) do update set team_id=excluded.team_id,visible=true,source_digest=excluded.source_digest,reviewer_id=excluded.reviewer_id,approval_id=excluded.approval_id,revision=coordinator_publication_controls.revision+1,updated_at=now()`;
}
export async function ownerPlayerPublications(sql: Sql, actor: string) {
  return secured(sql, actor, "staff.publications.read", async (tx) => {
    await authority(tx, actor, "staff_approvals.review");
    const rows = await tx<{
      kind: Kind;
      targetId: string;
      teamId: string;
      revision: number;
      visible: boolean;
      updatedAt: string;
    }>`select kind,target_id "targetId",team_id "teamId",revision,visible,updated_at::text "updatedAt" from coordinator_publication_controls order by updated_at desc`;
    await audit(tx, actor, "staff.publications.read", "publications", "allowed", {
      count: rows.length,
    });
    return rows;
  });
}
export async function withdrawPlayerPublication(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof publicationWithdrawInput>,
) {
  const v = publicationWithdrawInput.parse(raw);
  return secured(sql, actor, "staff.publication.withdraw", async (tx) => {
    await authority(tx, actor, "staff_approvals.review");
    const r =
      await tx`update coordinator_publication_controls set visible=false,revision=revision+1,updated_at=now() where kind=${v.kind} and target_id=${v.targetId} and revision=${v.revision} returning target_id`;
    if (!r.length) throw Error("Publication changed. Refresh first.");
    await audit(tx, actor, "staff.publication.withdraw", v.targetId, "allowed", {
      kind: v.kind,
      reason: v.reason,
    });
    return { ok: true };
  });
}
async function approvedCurrent(
  tx: Sql,
  kind: Kind,
  targetId: string,
  teamId: string,
  playerId: string,
) {
  const [control] = await tx<{
    visible: boolean;
    source_digest: string;
    reviewer_id: string;
    team_id: string;
  }>`select visible,source_digest,reviewer_id,team_id from coordinator_publication_controls where kind=${kind} and target_id=${targetId}`;
  if (!control) return true; // Preserve existing independently consented legacy publication workflows.
  if (!control.visible || control.team_id !== teamId) return false;
  try {
    await authority(tx, control.reviewer_id, "staff_approvals.review");
    return (await source(tx, teamId, playerId, kind)).sourceDigest === control.source_digest;
  } catch {
    return false;
  }
}
export async function filterPublicRoster(sql: Sql, club: ClubRecord) {
  const result = structuredClone(club);
  for (const t of result.teams)
    for (const p of t.roster)
      if (!(await approvedCurrent(sql, "roster", p.id, t.id, p.id))) p.rosterConsent = undefined;
  return result;
}
export async function publicPlayerPhotoAllowed(sql: Sql, athleteId: string) {
  const [control] = await sql<{
    team_id: string;
  }>`select team_id from coordinator_publication_controls where kind='photo' and target_id=${athleteId}`;
  if (!control) return true;
  const [l] = await sql<{
    roster_id: string;
  }>`select roster_id from recruiting_roster_links where athlete_id=${athleteId} and team_id=${control.team_id}`;
  return !!l && approvedCurrent(sql, "photo", athleteId, control.team_id, l.roster_id);
}
