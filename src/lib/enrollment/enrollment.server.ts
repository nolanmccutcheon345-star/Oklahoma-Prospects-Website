import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { secured } from "../coordinator/access.server";
import { enrollmentScope, teamAccess } from "./access.server";
import { versions, hashContent, recordEnrollment } from "./handbooks.server";
import { reviewedForSignatures } from "./contracts";
import {
  caseInput,
  pilotInput,
  rolloutInput,
  signatureInput,
  medicalInput,
  mediaInput,
  safetyInput,
  safetyReviewInput,
  SIGNATURE_STATEMENT,
  MEDIA_STATEMENT,
  type Pilot,
  type CaseSummary,
  type Packet,
  type Rollout,
} from "./enrollment-contracts";

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export async function rollout(tx: Sql): Promise<Rollout> {
  const [r] =
    await tx<Rollout>`select revision,mode,safety_name as "safetyName",safety_contact as "safetyContact",alternate_name as "alternateName",alternate_contact as "alternateContact",emergency_plan_reference as "emergencyPlanReference" from enrollment_rollout where id='academy' for share`;
  return r;
}
export async function pilots(tx: Sql): Promise<Pilot[]> {
  return tx<Pilot>`select sport,team_id as "teamId",season_key as "seasonKey",signatures_open as "signaturesOpen",pilot_passed as "pilotPassed",pilot_review as "pilotReview",revision from enrollment_pilots order by sport for share`;
}
export async function packetFor(tx: Sql, teamId: string, sport: string): Promise<Packet> {
  const all = (await versions(tx)).filter(
    (v) => v.status === "published" && v.effectiveOn <= today(),
  );
  const docs = ["academy-2027", sport + "-2027", "medical-2027", "team:" + teamId]
    .map((id) => all.find((v) => v.documentId === id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v));
  const blockers: string[] = [];
  if (docs.length !== 4)
    blockers.push(
      "Publish an effective organization handbook, sport supplement, medical authorization and owner-approved team standards.",
    );
  if (docs.some((v) => v.kind !== "team" && !reviewedForSignatures(v.review, today())))
    blockers.push(
      "Record completed legal and insurance review for the exact organization and sport versions.",
    );
  const settings = await rollout(tx);
  if (!settings.safetyContact || !settings.alternateContact || !settings.emergencyPlanReference)
    blockers.push("Confirm the safety contact, alternate and emergency-response plan.");
  return {
    documents: docs,
    digest: hashContent(docs.map((d) => ({ id: d.documentId, version: d.version, hash: d.hash }))),
    ready: blockers.length === 0,
    blockers,
  };
}
export async function activePilot(tx: Sql, teamId: string) {
  const p = (await pilots(tx)).find((p) => p.teamId === teamId);
  if (!p)
    throw Error(
      "This team is not part of the enrollment pilot. Existing team services remain available.",
    );
  return p;
}
export async function caseFor(tx: Sql, actor: string, raw: unknown, create = false) {
  const input = caseInput.strip().parse(raw),
    scope = await enrollmentScope(tx, actor),
    team = teamAccess(scope, input.teamId);
  const guardian = team.guardianPlayerIds.includes(input.playerId),
    self = team.playerIds.includes(input.playerId);
  if (!guardian && !self && !team.canRead && !team.canManage)
    throw Error("This athlete is not available to your account.");
  const [player] = await tx<{
    name: string;
  }>`select p->>'name' as name from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t cross join lateral jsonb_array_elements(t->'roster') p where c.id='oklahoma-prospects' and not c.demo and t->>'id'=${input.teamId} and p->>'id'=${input.playerId} and coalesce(p->>'withdrawn','false')<>'true'`;
  if (!player) throw Error("Roster athlete unavailable.");
  const pilot = await activePilot(tx, team.id);
  if (create && (guardian || team.canManage)) {
    if (!guardian && !team.canManage)
      throw Error("Guardian or enrollment-management access required.");
    await tx`insert into enrollment_cases(id,team_id,player_id,season_key,created_by) values(${randomUUID()},${team.id},${input.playerId},${pilot.seasonKey},${actor}) on conflict(team_id,player_id,season_key) do nothing`;
  }
  const [row] = await tx<{
    id: string;
    created_at: Date;
    cleared_at: Date | null;
    clearance_reason: string;
  }>`select id,created_at,cleared_at,clearance_reason from enrollment_cases where team_id=${team.id} and player_id=${input.playerId} and season_key=${pilot.seasonKey} for update`;
  if (!row) throw Error("Start this athlete’s enrollment first.");
  return { scope, team, guardian, self, player, pilot, row };
}
export async function enrollmentHome(sql: Sql, actor: string) {
  return secured(sql, actor, "enrollment.read", async (tx) => {
    const scope = await enrollmentScope(tx, actor),
      allPilots = await pilots(tx),
      settings = await rollout(tx);
    const relevant = allPilots.filter((p) => scope.teams.some((t) => t.id === p.teamId));
    const teams = scope.teams.filter((t) => relevant.some((p) => p.teamId === t.id));
    const candidates = await tx<{
      teamId: string;
      playerId: string;
      playerName: string;
    }>`select t->>'id' as "teamId",p->>'id' as "playerId",p->>'name' as "playerName" from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t cross join lateral jsonb_array_elements(t->'roster') p where c.id='oklahoma-prospects' and not c.demo and t->>'id'=any(${teams.map((t) => t.id)}::text[]) and coalesce(p->>'withdrawn','false')<>'true'`;
    return {
      owner: scope.owner,
      restricted: scope.restricted,
      teams: scope.teams.map((t) => ({
        ...t,
        guardianPlayerIds: t.guardianPlayerIds,
        playerIds: t.playerIds,
      })),
      pilots: relevant,
      settings,
      candidates: candidates.filter((p) => {
        const t = teamAccess(scope, p.teamId);
        return (
          t.canRead ||
          t.canManage ||
          t.guardianPlayerIds.includes(p.playerId) ||
          t.playerIds.includes(p.playerId)
        );
      }),
    };
  });
}
export async function enrollmentCase(sql: Sql, actor: string, input: unknown) {
  return secured(sql, actor, "enrollment.case", async (tx) => {
    const c = await caseFor(tx, actor, input, true),
      packet = await packetFor(tx, c.team.id, c.team.sport);
    const [health] = await tx<{
      present: boolean;
    }>`select exists(select 1 from enrollment_medical where case_id=${c.row.id}) as present`;
    const links = await tx<{
      athlete_id: string;
    }>`select athlete_id from team_dev_roster_links where team_id=${c.team.id} and roster_player_id=${caseInput.parse(input).playerId} and ended_at is null`;
    const athleteId = links.length === 1 ? links[0].athlete_id : null;
    const [waiver] = await tx<{
      current: boolean;
    }>`select exists(select 1 from club_waivers where athlete_id=${athleteId} and signed_at<=now() and signed_at+interval '1 year'>now()) as current`;
    const signatures = await tx<{
      id: string;
      actorId: string;
      signerName: string;
      signedAt: string;
      packetDigest: string;
      packet: Packet["documents"];
      statement: string;
    }>`select id,actor_id as "actorId",signer_name as "signerName",signed_at::text as "signedAt",packet_digest as "packetDigest",packet,statement from enrollment_signatures where case_id=${c.row.id} order by signed_at desc`;
    const summary: CaseSummary = {
      id: c.row.id,
      teamId: c.team.id,
      playerId: caseInput.parse(input).playerId,
      playerName: c.player.name,
      seasonKey: c.pilot.seasonKey,
      guardian: c.guardian,
      medicalComplete: health.present,
      waiverCurrent: waiver.current,
      athleteLinked: Boolean(athleteId),
      packetSigned: signatures.length > 0,
      acknowledgmentUpdate:
        signatures.length > 0 && !signatures.some((s) => s.packetDigest === packet.digest),
      clearedAt: c.row.cleared_at?.toISOString() || null,
      clearanceReason: c.scope.owner || c.guardian ? c.row.clearance_reason : "",
      createdAt: c.row.created_at.toISOString(),
    };
    // Only the guardian/owner sees signed personal documents. Staff get completion booleans.
    return {
      summary,
      packet,
      pilot: c.pilot,
      owner: c.scope.owner,
      canManage: c.team.canManage,
      canViewFinancial: !c.scope.restricted && (c.scope.owner || c.guardian),
      signatures: c.guardian || c.scope.owner ? signatures : [],
      settings: await rollout(tx),
    };
  });
}
export async function configurePilot(sql: Sql, actor: string, raw: unknown) {
  const i = pilotInput.parse(raw);
  return secured(sql, actor, "enrollment.pilot", async (tx) => {
    const scope = await enrollmentScope(tx, actor);
    if (!scope.owner) throw Error("Owner access required.");
    const t = teamAccess(scope, i.teamId);
    await tx`select id from enrollment_rollout where id='academy' for update`;
    const [old] =
      await tx<Pilot>`select team_id as "teamId",season_key as "seasonKey",revision from enrollment_pilots where sport=${t.sport} for update`;
    if ((old?.revision || 0) !== i.revision) throw Error("Pilot settings changed. Reload.");
    if (old && (old.teamId !== t.id || old.seasonKey !== i.seasonKey)) {
      const [used] = await tx`select id from enrollment_cases where team_id=${old.teamId} limit 1`;
      if (used)
        throw Error("This pilot has enrollment records. Keep its team and season identity.");
    }
    if (i.signaturesOpen) {
      const p = await packetFor(tx, t.id, t.sport);
      if (!p.ready) throw Error(p.blockers.join(" "));
    }
    await tx`insert into enrollment_pilots(sport,team_id,season_key,signatures_open,updated_by) values(${t.sport},${t.id},${i.seasonKey},${i.signaturesOpen},${actor}) on conflict(sport) do update set team_id=excluded.team_id,season_key=excluded.season_key,signatures_open=excluded.signatures_open,revision=enrollment_pilots.revision+1,updated_by=excluded.updated_by,updated_at=now()`;
    await recordEnrollment(tx, actor, "pilot.configure", t.id, {
      signaturesOpen: i.signaturesOpen,
    });
    return { ok: true };
  });
}
export async function saveRollout(sql: Sql, actor: string, raw: unknown) {
  const i = rolloutInput.parse(raw);
  return secured(sql, actor, "enrollment.contacts", async (tx) => {
    if (!(await enrollmentScope(tx, actor)).owner) throw Error("Owner access required.");
    const r =
      await tx`update enrollment_rollout set safety_name=${i.safetyName},safety_contact=${i.safetyContact},alternate_name=${i.alternateName},alternate_contact=${i.alternateContact},emergency_plan_reference=${i.emergencyPlanReference},updated_by=${actor},updated_at=now(),revision=revision+1 where id='academy' and revision=${i.revision} returning id`;
    if (!r.length) throw Error("Settings changed. Reload.");
    await recordEnrollment(tx, actor, "safety.contacts", "academy");
    return { ok: true };
  });
}
export async function signPacket(sql: Sql, actor: string, raw: unknown) {
  const i = signatureInput.parse(raw);
  return secured(sql, actor, "enrollment.sign", async (tx) => {
    const c = await caseFor(tx, actor, i),
      packet = await packetFor(tx, c.team.id, c.team.sport);
    if (!c.guardian) throw Error("Only this athlete’s linked guardian can sign.");
    if (!c.pilot.signaturesOpen || !packet.ready)
      throw Error("Enrollment signatures are not open. " + packet.blockers.join(" "));
    if (packet.digest !== i.packetDigest)
      throw Error("The packet changed. Review the current version before signing.");
    await tx`insert into enrollment_signatures(id,case_id,actor_id,signer_name,packet_digest,packet,statement) values(${randomUUID()},${c.row.id},${actor},${i.signerName},${packet.digest},${JSON.stringify(packet.documents)}::jsonb,${SIGNATURE_STATEMENT}) on conflict(case_id,actor_id,packet_digest) do nothing`;
    await recordEnrollment(tx, actor, "packet.signed", c.row.id, { digest: packet.digest });
    return { ok: true };
  });
}
export async function getMedical(sql: Sql, actor: string, input: unknown) {
  return secured(sql, actor, "enrollment.medical.read", async (tx) => {
    const c = await caseFor(tx, actor, input);
    if (!c.guardian && !c.scope.owner)
      throw Error("Medical records are restricted to the guardian and authorized owners.");
    const [record] = await tx<{
      payload: Omit<ReturnType<typeof medicalInput.parse>, "teamId" | "playerId" | "revision">;
      revision: number;
    }>`select payload,revision from enrollment_medical where case_id=${c.row.id}`;
    await recordEnrollment(tx, actor, "medical.read", c.row.id);
    return record || null;
  });
}
export async function saveMedical(sql: Sql, actor: string, raw: unknown) {
  const i = medicalInput.parse(raw);
  return secured(sql, actor, "enrollment.medical.save", async (tx) => {
    const c = await caseFor(tx, actor, i);
    if (!c.guardian) throw Error("Only the linked guardian can submit medical information.");
    const [old] = await tx<{
      revision: number;
    }>`select revision from enrollment_medical where case_id=${c.row.id} for update`;
    if ((old?.revision || 0) !== i.revision) throw Error("Medical information changed. Reload.");
    const { teamId: _t, playerId: _p, revision: _r, ...payload } = i;
    await tx`insert into enrollment_medical(case_id,payload,updated_by) values(${c.row.id},${JSON.stringify(payload)}::jsonb,${actor}) on conflict(case_id) do update set payload=excluded.payload,updated_by=excluded.updated_by,updated_at=now(),revision=enrollment_medical.revision+1`;
    await tx`update enrollment_cases set cleared_at=null,cleared_by=null,clearance_reason='' where id=${c.row.id}`;
    await recordEnrollment(tx, actor, "medical.updated", c.row.id);
    return { ok: true };
  });
}
export async function mediaFor(sql: Sql, actor: string, input: unknown) {
  return secured(sql, actor, "enrollment.media.read", async (tx) => {
    const c = await caseFor(tx, actor, input);
    if (!c.guardian && !c.scope.owner) throw Error("Guardian access required.");
    const [r] = await tx<{
      consent: boolean;
      signerName: string;
      updatedAt: string;
    }>`select consent,signer_name as "signerName",updated_at::text as "updatedAt" from enrollment_media where case_id=${c.row.id}`;
    return r || null;
  });
}
export async function saveMedia(sql: Sql, actor: string, raw: unknown) {
  const i = mediaInput.parse(raw);
  return secured(sql, actor, "enrollment.media.save", async (tx) => {
    const c = await caseFor(tx, actor, i);
    if (!c.guardian) throw Error("Only the linked guardian can record optional media consent.");
    await tx`insert into enrollment_media(case_id,consent,signer_name,actor_id,statement) values(${c.row.id},${i.consent},${i.signerName},${actor},${MEDIA_STATEMENT}) on conflict(case_id) do update set consent=excluded.consent,signer_name=excluded.signer_name,actor_id=excluded.actor_id,statement=excluded.statement,updated_at=now()`;
    await tx`insert into enrollment_media_history(id,case_id,consent,signer_name,actor_id,statement) values(${randomUUID()},${c.row.id},${i.consent},${i.signerName},${actor},${MEDIA_STATEMENT})`;
    await recordEnrollment(tx, actor, "media.choice", c.row.id, { consent: i.consent });
    return { ok: true };
  });
}
export async function reportSafety(sql: Sql, actor: string, raw: unknown) {
  const i = safetyInput.parse(raw);
  return secured(sql, actor, "enrollment.safety.report", async (tx) => {
    const c = await caseFor(tx, actor, i);
    const id = randomUUID();
    await tx`insert into enrollment_safety_reports(id,case_id,reporter_id,concerning,body) values(${id},${c.row.id},${actor},${i.concerning},${i.body})`;
    await recordEnrollment(tx, actor, "safety.reported", id);
    return { ok: true, id };
  });
}
function safetyOwner(email: string, concerning: string) {
  return (
    !(concerning === "steve" && email === "stevemccutcheon89@gmail.com") &&
    !(concerning === "nolan" && email === "nolanmccutcheon@icloud.com")
  );
}
export async function safetyReports(sql: Sql, actor: string) {
  return secured(sql, actor, "enrollment.safety.read", async (tx) => {
    const s = await enrollmentScope(tx, actor);
    if (!s.owner) throw Error("Owner safety access required.");
    const rows = await tx<{
      id: string;
      concerning: string;
      body: string;
      status: string;
      response: string;
      createdAt: string;
    }>`select id,concerning,body,status,response,created_at::text as "createdAt" from enrollment_safety_reports where not(concerning='steve' and ${s.user.email}='stevemccutcheon89@gmail.com') and not(concerning='nolan' and ${s.user.email}='nolanmccutcheon@icloud.com') order by created_at desc`;
    await recordEnrollment(tx, actor, "safety.reviewed", "restricted-inbox");
    return rows.filter((r) => safetyOwner(s.user.email, r.concerning));
  });
}
export async function reviewSafety(sql: Sql, actor: string, raw: unknown) {
  const i = safetyReviewInput.parse(raw);
  return secured(sql, actor, "enrollment.safety.review", async (tx) => {
    const s = await enrollmentScope(tx, actor);
    if (!s.owner) throw Error("Owner safety access required.");
    const [r] = await tx<{
      concerning: string;
    }>`select concerning from enrollment_safety_reports where id=${i.reportId} for update`;
    if (!r || !safetyOwner(s.user.email, r.concerning))
      throw Error("This report requires the alternate safety contact.");
    await tx`update enrollment_safety_reports set status=${i.status},response=${i.response},updated_by=${actor},updated_at=now() where id=${i.reportId}`;
    await recordEnrollment(tx, actor, "safety.response", i.reportId, { status: i.status });
    return { ok: true };
  });
}

// Called inside the existing financial transaction. No customer prices are read or changed here.
export async function requirePilotAcknowledgment(
  tx: Sql,
  actor: string,
  teamId: string,
  playerId: string,
) {
  const [p] = await tx<{
    signatures_open: boolean;
    sport: string;
    season_key: string;
  }>`select signatures_open,sport,season_key from enrollment_pilots where team_id=${teamId} for share`;
  if (!p) return;
  if (!p.signatures_open) throw Error("New enrollment signatures are closed for this team.");
  const packet = await packetFor(tx, teamId, p.sport);
  if (!packet.ready)
    throw Error(
      "Enrollment documents require owner review before a new fee agreement can be accepted.",
    );
  const [signed] =
    await tx`select s.id from enrollment_cases c join enrollment_signatures s on s.case_id=c.id where c.team_id=${teamId} and c.player_id=${playerId} and c.season_key=${p.season_key} and s.actor_id=${actor} and s.packet_digest=${packet.digest}`;
  if (!signed)
    throw Error(
      "Review and sign your current team packet in My Season & Enrollment before accepting this new fee agreement.",
    );
}
