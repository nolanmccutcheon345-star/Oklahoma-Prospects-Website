import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { secured } from "../coordinator/access.server";
import { enrollmentScope, teamAccess } from "./access.server";
import {
  saveDocumentInput,
  saveStandardsInput,
  emptyReview,
  type HandbookVersion,
  type HandbookWorkspace,
} from "./contracts";
import { handbookSeeds } from "./seed";

export const hashContent = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function recordEnrollment(
  tx: Sql,
  actor: string,
  action: string,
  target: string,
  details: unknown = {},
) {
  await tx`insert into handbook_audit(id,actor_id,action,target_id,details) values(${randomUUID()},${actor},${action},${target},${JSON.stringify(details)}::jsonb)`;
}
export async function versions(tx: Sql): Promise<HandbookVersion[]> {
  return tx<HandbookVersion>`select d.id as "documentId",d.kind,d.team_id as "teamId",v.version,v.revision,v.status,v.effective_on::text as "effectiveOn",v.content,v.standards,v.review,v.content_hash as hash,v.published_at::text as "publishedAt" from handbook_documents d join handbook_versions v on v.document_id=d.id order by d.id,v.version desc`;
}
export async function publicHandbooks(sql: Sql) {
  const rows =
    await sql<HandbookVersion>`select d.id as "documentId",d.kind,null as "teamId",v.version,v.revision,v.status,v.effective_on::text as "effectiveOn",v.content,null as standards,'{}'::jsonb as review,v.content_hash as hash,v.published_at::text as "publishedAt" from handbook_documents d join handbook_versions v on v.document_id=d.id where d.kind<>'team' and v.status='published' and v.effective_on <= (now() at time zone 'America/Chicago')::date order by d.id,v.version desc`;
  return rows.filter((r, i) => rows.findIndex((x) => x.documentId === r.documentId) === i);
}
export async function handbookWorkspace(sql: Sql, actor: string): Promise<HandbookWorkspace> {
  return secured(sql, actor, "handbook.read", async (tx) => {
    const scope = await enrollmentScope(tx, actor),
      all = await versions(tx);
    return {
      owner: scope.owner,
      teams: scope.teams,
      documents: all.filter((v) => {
        if (scope.owner) return true;
        if (!v.teamId) return v.status === "published";
        const t = scope.teams.find((t) => t.id === v.teamId);
        return Boolean(t && (t.canDraft || t.canRead || v.status === "published"));
      }),
    };
  });
}
export async function seedHandbooks(sql: Sql, actor: string) {
  return secured(sql, actor, "handbook.prepare", async (tx) => {
    const scope = await enrollmentScope(tx, actor);
    if (!scope.owner) throw Error("Owner access required.");
    for (const [id, content] of Object.entries(handbookSeeds)) {
      await tx`insert into handbook_versions(document_id,version,effective_on,content,review,content_hash,updated_by) values(${id},1,'2027-01-01',${JSON.stringify(content)}::jsonb,${JSON.stringify(emptyReview)}::jsonb,${hashContent(content)},${actor}) on conflict do nothing`;
    }
    await recordEnrollment(tx, actor, "handbook.seed", "2027");
    return { ok: true };
  });
}
export async function saveHandbook(sql: Sql, actor: string, raw: unknown) {
  const input = saveDocumentInput.parse(raw);
  return secured(sql, actor, "handbook.save", async (tx) => {
    const scope = await enrollmentScope(tx, actor);
    if (!scope.owner) throw Error("Owner access required.");
    const [doc] =
      await tx`select id from handbook_documents where id=${input.documentId} and kind<>'team' for update`;
    if (!doc) throw Error("Handbook unavailable.");
    if (Object.values(input.review).some(Boolean) && !input.reviewConfirmed)
      throw Error(
        "Confirm that the recorded reviews cover the exact text and effective date being saved.",
      );
    return writeVersion(
      tx,
      actor,
      input.documentId,
      input.version,
      input.revision,
      input.action,
      input.effectiveOn,
      input.content,
      null,
      input.review,
    );
  });
}
export async function saveTeamStandards(sql: Sql, actor: string, raw: unknown) {
  const input = saveStandardsInput.parse(raw);
  return secured(sql, actor, "standards.save", async (tx) => {
    const scope = await enrollmentScope(tx, actor),
      team = teamAccess(scope, input.teamId);
    if (!team.canDraft) throw Error("Team standards permission required.");
    if (input.action === "publish" && !scope.owner)
      throw Error("An owner must approve team standards.");
    const id = "team:" + team.id;
    await tx`insert into handbook_documents(id,kind,team_id) values(${id},'team',${team.id}) on conflict do nothing`;
    await tx`select id from handbook_documents where id=${id} for update`;
    const s = input.standards;
    const content = {
      title: team.name + " — Team standards",
      sections: [
        {
          title: "Team designation",
          body:
            s.designation === "developmental"
              ? "Developmental: meaningful participation and skill growth; equal playing time is not guaranteed."
              : "Competitive: readiness, effort, attendance, performance and team strategy guide opportunities.",
        },
        { title: "Playing time and positions", body: s.playingTime },
        { title: "Practice expectations", body: s.practiceExpectations },
        { title: "Tournament commitment", body: s.tournamentCommitment },
        {
          title: "Attendance",
          body: `Planned practice absence: ${s.practiceNoticeHours} hours. Planned tournament absence: ${s.tournamentNoticeDays} days. Emergencies: as soon as reasonably possible. Medical restrictions are respected. ${s.rsvpIsNotice ? "An absence notice submitted through the team account counts as direct notice." : "Contact the coach directly as well as recording availability."} Notice is not automatic approval.`,
        },
        {
          title: "Development feedback",
          body: `At least ${s.inSeasonUpdates} documented in-season update(s) and a final evaluation. ${s.evaluationMethod}`,
        },
        {
          title: "Communication",
          body:
            s.communicationChannel +
            "; routine messages acknowledged within 48 hours. Safety concerns bypass the ordinary dispute process.",
        },
        {
          title: "Organization standards",
          body: "Organization safety and conduct requirements apply to every team. These standards do not change your published financial agreement, fees, payment dates, medical restrictions, or optional media permissions.",
        },
      ],
    };
    return writeVersion(
      tx,
      actor,
      id,
      input.version,
      input.revision,
      input.action,
      input.effectiveOn,
      content,
      s,
      emptyReview,
    );
  });
}
async function writeVersion(
  tx: Sql,
  actor: string,
  id: string,
  expectedVersion: number,
  revision: number,
  action: string,
  effectiveOn: string,
  content: unknown,
  standards: unknown,
  review: unknown,
) {
  const [latest] = await tx<{
    version: number;
    revision: number;
    status: string;
  }>`select version,revision,status from handbook_versions where document_id=${id} order by version desc limit 1 for update`;
  if ((latest?.version || 0) !== expectedVersion || (latest?.revision || 0) !== revision)
    throw Error("This document changed. Reload before saving.");
  const version = latest?.status === "draft" ? latest.version : (latest?.version || 0) + 1;
  const hash = hashContent({ content, standards, review, effectiveOn });
  const published = action === "publish";
  await tx`insert into handbook_versions(document_id,version,effective_on,content,standards,review,content_hash,updated_by,status,published_by,published_at)
    values(${id},${version},${effectiveOn},${JSON.stringify(content)}::jsonb,${standards ? JSON.stringify(standards) : null}::jsonb,${JSON.stringify(review)}::jsonb,${hash},${actor},${published ? "published" : "draft"},${published ? actor : null},${published ? new Date().toISOString() : null})
    on conflict(document_id,version) do update set effective_on=excluded.effective_on,content=excluded.content,standards=excluded.standards,review=excluded.review,content_hash=excluded.content_hash,updated_by=excluded.updated_by,status=excluded.status,published_by=excluded.published_by,published_at=excluded.published_at,revision=handbook_versions.revision+1`;
  await recordEnrollment(tx, actor, published ? "handbook.publish" : "handbook.draft", id, {
    version,
    hash,
  });
  return { ok: true, version };
}
