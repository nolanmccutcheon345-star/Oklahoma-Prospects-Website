/** Organization-wide operational content. Private historical text requires exact owner review. */
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { Sql } from "../db";
import {
  audit,
  CoordinatorDenied,
  requireOrganizationOperations,
  secured,
  financiallyRestricted,
  checkScope,
  teamScope,
} from "./access.server";
import { lockFinancialExecution } from "../finance/execution.server";
import { draftInput } from "./contracts";
import {
  blankProfile,
  profileData,
  saveProfileInput,
  metricInput,
  metricDefinitions,
  reviewInput,
  CONSENT_VERSION,
} from "../recruiting-contracts";
import {
  contentClassificationInput,
  editorialDecisionInput,
  documentMetadataInput,
  type ContentKind,
  type ContentReviewSource,
  type OrganizationContent,
} from "./organization-communications-contracts";
const changed = () => new Error("This content changed. Refresh and review the current revision.");
const digest = (expression: string) =>
  `encode(sha256(convert_to((${expression})::text,'UTF8')),'hex')`;
const profileDigest = digest("r.payload");
const profileObject =
  "case when jsonb_typeof(r.payload)='object' then r.payload else '{}'::jsonb end";
const metricObject = `jsonb_build_object('metric',m.metric,'value',m.value,'measuredOn',m.measured_on,'evidence',m.evidence,'method',m.method,'reviewNote',m.review_note,'verifierName',m.verifier_name)`;
const metricDigest = digest(metricObject);
const draftObject = `jsonb_build_object('title',d.title,'body',d.body,'sport',d.sport,'teamId',d.team_id,'status',d.status)`;
const draftDigest = digest(draftObject);
const documentDigest = digest("d");
async function operate<T>(sql: Sql, userId: string, action: string, work: (tx: Sql) => Promise<T>) {
  return secured(
    sql,
    userId,
    action,
    async (tx) => {
      await requireOrganizationOperations(tx, userId);
      return work(tx);
    },
    lockFinancialExecution,
  );
}
async function owner(tx: Sql, userId: string) {
  return !(await financiallyRestricted(tx, userId));
}
async function athlete(tx: Sql, id: string) {
  const [row] = await tx`select id from club_athletes where id=${id} for update`;
  if (!row) throw new Error("Player not found.");
}
async function classify(
  tx: Sql,
  userId: string,
  kind: Exclude<ContentKind, "draft">,
  id: string,
  revision: number,
  sourceDigest: string,
  reason: string,
) {
  await tx`insert into operational_content_classifications(kind,target_id,source_revision,source_digest,classified_by,reason) values(${kind},${id},${revision},${sourceDigest},${userId},${reason}) on conflict(kind,target_id) do update set source_revision=excluded.source_revision,source_digest=excluded.source_digest,classified_by=excluded.classified_by,reason=excluded.reason,classified_at=now()`;
}
type ProfileSource = {
  id: string;
  name: string;
  revision: number;
  sourceDigest: string;
  published: boolean;
  consentCurrent: boolean;
  classified: boolean;
  validKeys: boolean;
  content: Record<string, string> | null;
};
type MetricSource = {
  id: string;
  athleteId: string;
  playerName: string;
  revision: number;
  sourceDigest: string;
  metric: OrganizationContent["metrics"][number]["metric"];
  value: number;
  measuredOn: string;
  status: OrganizationContent["metrics"][number]["status"];
  classified: boolean;
  content: Record<string, string | number | null> | null;
};
type DocumentSource = {
  id: string;
  athleteId: string;
  revision: number;
  sourceDigest: string;
  classified: boolean;
  content: Record<string, string> | null;
};
async function sources(tx: Sql, privateReview = false, only?: { kind: ContentKind; id: string }) {
  const keys = Object.keys(blankProfile);
  const profiles =
    only && only.kind !== "recruiting-profile"
      ? []
      : await tx.query<ProfileSource>(
          `select r.athlete_id as id,a.name,r.revision,${profileDigest} as "sourceDigest",r.published,(r.published and r.consent_by is not null and r.consent_version=$2) as "consentCurrent",coalesce(c.source_revision=r.revision and c.source_digest=${profileDigest},false) as classified,jsonb_typeof(r.payload)='object' and not exists(select 1 from jsonb_object_keys(${profileObject}) k where not(k=any($1::text[]))) as "validKeys",case when jsonb_typeof(r.payload)='object' and ($3 or (r.published and r.consent_by is not null and r.consent_version=$2 and jsonb_typeof(r.payload)='object' and not exists(select 1 from jsonb_object_keys(${profileObject}) k where not(k=any($1::text[])))) or (c.source_revision=r.revision and c.source_digest=${profileDigest})) then coalesce((select jsonb_object_agg(k,r.payload->k) from unnest($1::text[]) k where r.payload ? k),'{}'::jsonb) else null end as content from recruiting_profiles r join club_athletes a on a.id=r.athlete_id left join operational_content_classifications c on c.kind='recruiting-profile' and c.target_id=r.athlete_id where ($4='' or r.athlete_id=$4) order by a.name,r.athlete_id`,
          [keys, CONSENT_VERSION, privateReview, only?.id || ""],
        );
  const metrics =
    only && only.kind !== "recruiting-metric"
      ? []
      : await tx.query<MetricSource>(
          `select m.id::text as id,m.athlete_id as "athleteId",a.name as "playerName",m.revision,${metricDigest} as "sourceDigest",m.metric,m.value::float as value,m.measured_on::text as "measuredOn",m.status,coalesce(c.source_revision=m.revision and c.source_digest=${metricDigest},false) as classified,case when $1 or (c.source_revision=m.revision and c.source_digest=${metricDigest}) then ${metricObject} else null end as content from recruiting_metrics m join club_athletes a on a.id=m.athlete_id left join operational_content_classifications c on c.kind='recruiting-metric' and c.target_id=m.id::text where ($2='' or m.id::text=$2) order by a.name,m.id`,
          [privateReview, only?.id || ""],
        );
  const documents =
    only && only.kind !== "pd-document"
      ? []
      : await tx.query<DocumentSource>(
          `select d->>'id' as id,d->>'athleteId' as "athleteId",p.revision,${documentDigest} as "sourceDigest",coalesce(c.source_digest=${documentDigest},false) as classified,case when $1 or c.source_digest=${documentDigest} then jsonb_build_object('name',d->>'name','kind',d->>'kind','date',d->>'date') else null end as content from pd_working_file p cross join lateral jsonb_array_elements(coalesce(p.payload::jsonb->'documents','[]'::jsonb)) d left join operational_content_classifications c on c.kind='pd-document' and c.target_id=d->>'id' where p.id='club' and ($2='' or d->>'id'=$2) order by d->>'id'`,
          [privateReview, only?.id || ""],
        );
  return { profiles, metrics, documents };
}
function reviewContent(
  value: Record<string, unknown> | null,
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(value || {}).map(([key, item]) => [
      key,
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
        ? item
        : "[Invalid structured value withheld]",
    ]),
  );
}
function visibleProfile(p: ProfileSource) {
  const parsed = profileData.safeParse({ ...blankProfile, ...p.content });
  return p.content && (p.classified || (p.consentCurrent && p.validKeys)) && parsed.success
    ? parsed.data
    : null;
}
export async function organizationContent(sql: Sql, userId: string): Promise<OrganizationContent> {
  return operate(sql, userId, "organization.content.workspace", async (tx) => {
    const source = await sources(tx);
    const drafts = await tx<
      OrganizationContent["drafts"][number]
    >`select d.id::text,d.sport,d.team_id as "teamId",d.title,d.body,d.status,d.revision,d.user_id as "authorId",u.name as "authorName",coalesce(d.last_editor_id,d.user_id) as "lastEditorId",a.revision as "approvalRevision" from coordinator_drafts d join "user" u on u.id=d.user_id left join coordinator_approvals a on a.id=d.id and a.kind='content' and a.target_id=d.id::text where d.content_classification='operational' and d.classified_revision=d.revision order by d.updated_at desc,d.id`;
    const [hidden] = await tx<{
      count: number;
    }>`select count(*)::int as count from coordinator_drafts where content_classification<>'operational' or classified_revision is distinct from revision`;
    const [state] = await tx<{
      revision: number;
    }>`select revision from pd_working_file where id='club'`;
    return {
      actorId: userId,
      owner: await owner(tx, userId),
      sourceRevision: state?.revision || 0,
      athletes: await tx<{
        id: string;
        name: string;
      }>`select id,name from club_athletes order by name,id`,
      drafts,
      profiles: source.profiles.map((p) => ({
        athleteId: p.id,
        name: p.name,
        revision: p.revision,
        profile: visibleProfile(p),
        published: p.published,
        consentCurrent: p.consentCurrent,
      })),
      metrics: source.metrics
        .filter((m) => Object.hasOwn(metricDefinitions, m.metric))
        .map((m) => ({
          id: m.id,
          athleteId: m.athleteId,
          playerName: m.playerName,
          revision: m.revision,
          metric: m.metric,
          value: m.value,
          measuredOn: m.measuredOn,
          status: m.status,
          detail: m.content
            ? {
                evidence: String(m.content.evidence || ""),
                method: String(m.content.method || ""),
                reviewNote: String(m.content.reviewNote || ""),
                verifierName: String(m.content.verifierName || ""),
              }
            : null,
        })),
      documents: source.documents
        .filter((d) => d.content)
        .map((d) => ({
          id: d.id,
          athleteId: d.athleteId,
          name: d.content!.name || "",
          kind: d.content!.kind || "",
          date: d.content!.date || "",
          sourceRevision: d.revision,
          sourceDigest: d.sourceDigest,
        })),
      withheld: {
        drafts: hidden.count,
        profiles: source.profiles.filter((p) => !visibleProfile(p)).length,
        metrics: source.metrics.filter(
          (m) => !Object.hasOwn(metricDefinitions, m.metric) || !m.content,
        ).length,
        documents: source.documents.filter((d) => !d.content).length,
      },
    };
  });
}
export async function organizationContentReview(
  sql: Sql,
  userId: string,
): Promise<ContentReviewSource[]> {
  return operate(sql, userId, "organization.content.review-source", async (tx) => {
    if (!(await owner(tx, userId))) throw new CoordinatorDenied();
    const normal = await sources(tx);
    const raw = await sources(tx, true);
    const drafts = await tx.query<ContentReviewSource>(
      `select 'draft' as kind,d.id::text as id,d.revision,${draftDigest} as "sourceDigest",${draftObject} as content from coordinator_drafts d where content_classification<>'operational' or classified_revision is distinct from revision order by id`,
    );
    return [
      ...drafts,
      ...raw.profiles
        .filter((p) => !visibleProfile(normal.profiles.find((v) => v.id === p.id)!))
        .map((p) => ({
          kind: "recruiting-profile" as const,
          id: p.id,
          revision: p.revision,
          sourceDigest: p.sourceDigest,
          content: reviewContent(p.content),
        })),
      ...raw.metrics
        .filter((m) => !m.classified)
        .map((m) => ({
          kind: "recruiting-metric" as const,
          id: m.id,
          revision: m.revision,
          sourceDigest: m.sourceDigest,
          content: reviewContent(m.content),
        })),
      ...raw.documents
        .filter((d) => !d.classified)
        .map((d) => ({
          kind: "pd-document" as const,
          id: d.id,
          revision: d.revision,
          sourceDigest: d.sourceDigest,
          content: reviewContent(d.content),
        })),
    ];
  });
}
export async function classifyOrganizationContent(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof contentClassificationInput>,
) {
  const input = contentClassificationInput.parse(raw);
  return operate(sql, userId, "organization.content.classify", async (tx) => {
    if (!(await owner(tx, userId))) throw new CoordinatorDenied();
    if (input.kind === "draft") {
      const [row] = await tx.query<{ revision: number; sourceDigest: string }>(
        `select d.revision,${draftDigest} as "sourceDigest" from coordinator_drafts d where d.id::text=$1 for update`,
        [input.id],
      );
      if (!row || row.revision !== input.revision || row.sourceDigest !== input.sourceDigest)
        throw changed();
      await tx`update coordinator_drafts set content_classification='operational',classified_revision=revision where id::text=${input.id}`;
    } else {
      if (input.kind === "pd-document")
        await tx`select id from pd_working_file where id='club' for update`;
      else if (input.kind === "recruiting-profile")
        await tx`select athlete_id from recruiting_profiles where athlete_id=${input.id} for update`;
      else await tx`select id from recruiting_metrics where id::text=${input.id} for update`;
      const s = await sources(tx, true, input);
      const rows =
        input.kind === "pd-document"
          ? s.documents
          : input.kind === "recruiting-profile"
            ? s.profiles
            : s.metrics;
      const row = rows[0];
      if (
        rows.length !== 1 ||
        row.revision !== input.revision ||
        row.sourceDigest !== input.sourceDigest
      )
        throw changed();
      await classify(
        tx,
        userId,
        input.kind,
        input.id,
        input.revision,
        input.sourceDigest,
        input.reason,
      );
    }
    await audit(tx, userId, "organization.content.classify", input.id, "allowed", {
      kind: input.kind,
      revision: input.revision,
    });
    return { ok: true };
  });
}
export async function saveOrganizationEditorialDraft(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof draftInput>,
) {
  const input = draftInput.parse(raw);
  return operate(sql, userId, "organization.content.editorial-save", async (tx) => {
    if (input.teamId && (await teamScope(tx, input.teamId)).sport !== input.sport)
      throw new CoordinatorDenied();
    const [approval] = await tx<{
      kind: string;
      target_id: string;
      sport: string;
      team_id: string;
      revision: number;
    }>`select kind,target_id,sport,team_id,revision from coordinator_approvals where id=${input.id} for update`;
    const [old] = await tx<{
      revision: number;
      sport: string;
      team_id: string;
      status: string;
      content_classification: string;
      classified_revision: number | null;
    }>`select revision,sport,team_id,status,content_classification,classified_revision from coordinator_drafts where id=${input.id} for update`;
    if ((old?.revision || 0) !== input.revision) throw changed();
    if (
      old &&
      (old.sport !== input.sport ||
        old.team_id !== input.teamId ||
        old.status === "submitted" ||
        old.content_classification !== "operational" ||
        old.classified_revision !== old.revision)
    )
      throw new CoordinatorDenied();
    if (
      approval &&
      (approval.kind !== "content" ||
        approval.target_id !== input.id ||
        approval.sport !== input.sport ||
        approval.team_id !== input.teamId)
    )
      throw new CoordinatorDenied();
    const revision = input.revision + 1,
      status = input.submit ? "submitted" : "draft";
    if (old)
      await tx`update coordinator_drafts set title=${input.title},body=${input.body},status=${status},revision=${revision},content_classification='operational',classified_revision=${revision},last_editor_id=${userId},updated_at=now() where id=${input.id}`;
    else
      await tx`insert into coordinator_drafts(id,user_id,last_editor_id,sport,team_id,title,body,status,content_classification,classified_revision) values(${input.id},${userId},${userId},${input.sport},${input.teamId},${input.title},${input.body},${status},'operational',1)`;
    if (input.submit) {
      if (approval)
        await tx`update coordinator_approvals set requester_id=${userId},proposal=${JSON.stringify({ revision })}::jsonb,status='pending',reviewer_id=null,decision_reason=null,decided_at=null,revision=revision+1,reason='Review operational editorial draft' where id=${input.id}`;
      else
        await tx`insert into coordinator_approvals(id,requester_id,sport,team_id,kind,target_id,proposal,reason) values(${input.id},${userId},${input.sport},${input.teamId},'content',${input.id},${JSON.stringify({ revision })}::jsonb,'Review operational editorial draft')`;
    }
    await audit(tx, userId, "organization.content.editorial-save", input.id, "allowed", {
      revision,
      submitted: input.submit,
    });
    return { ok: true, revision, status };
  });
}
export async function decideOrganizationEditorialDraft(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof editorialDecisionInput>,
) {
  const input = editorialDecisionInput.parse(raw);
  return operate(sql, userId, "organization.content.editorial-review", async (tx) => {
    const [a] = await tx<{
      requester_id: string;
      kind: string;
      target_id: string;
      status: string;
      revision: number;
      sport: "baseball" | "softball";
      team_id: string;
      proposal: { revision?: number };
    }>`select requester_id,kind,target_id,status,revision,sport,team_id,proposal from coordinator_approvals where id=${input.id} for update`;
    const [d] = await tx<{
      user_id: string;
      last_editor_id: string | null;
      status: string;
      revision: number;
      sport: string;
      team_id: string;
      content_classification: string;
      classified_revision: number | null;
    }>`select user_id,last_editor_id,status,revision,sport,team_id,content_classification,classified_revision from coordinator_drafts where id=${input.id} for update`;
    if (
      !a ||
      !d ||
      a.kind !== "content" ||
      a.target_id !== input.id ||
      a.sport !== d.sport ||
      a.team_id !== d.team_id ||
      [a.requester_id, d.user_id, d.last_editor_id].includes(userId)
    )
      throw new CoordinatorDenied();
    if (
      a.status !== "pending" ||
      d.status !== "submitted" ||
      a.revision !== input.approvalRevision ||
      d.revision !== input.revision ||
      a.proposal.revision !== d.revision ||
      d.content_classification !== "operational" ||
      d.classified_revision !== d.revision
    )
      throw changed();
    if (await financiallyRestricted(tx, a.requester_id))
      await requireOrganizationOperations(tx, a.requester_id);
    else {
      const [requesterOwner] =
        await tx`select g.email from owner_grants g join "user" u on u.id=g.user_id join profiles p on p.user_id=u.id where u.id=${a.requester_id} and u."emailVerified" and u."disabledAt" is null and p.role='admin' and g.email=lower(trim(u.email)) and g.revoked_at is null`;
      if (!requesterOwner)
        await checkScope(tx, a.requester_id, "content.submit", a.sport, a.team_id);
    }
    await tx`update coordinator_drafts set status=${input.decision},revision=revision+1,classified_revision=revision+1,updated_at=now() where id=${input.id}`;
    await tx`update coordinator_approvals set status=${input.decision},reviewer_id=${userId},decision_reason=${input.reason},decided_at=now(),revision=revision+1 where id=${input.id}`;
    await audit(tx, userId, "organization.content.editorial-review", input.id, "allowed", {
      revision: input.revision + 1,
      decision: input.decision,
    });
    return { ok: true };
  });
}
export async function saveOrganizationRecruitingProfile(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof saveProfileInput>,
) {
  const input = saveProfileInput.parse(raw);
  return operate(sql, userId, "organization.content.profile-save", async (tx) => {
    await athlete(tx, input.athleteId);
    const [old] = await tx<{
      revision: number;
    }>`select revision from recruiting_profiles where athlete_id=${input.athleteId} for update`;
    if ((old?.revision || 0) !== input.revision) throw changed();
    if (
      old &&
      !visibleProfile(
        (await sources(tx, false, { kind: "recruiting-profile", id: input.athleteId })).profiles[0],
      )
    )
      throw new CoordinatorDenied();
    if (old)
      await tx`update recruiting_profiles set payload=payload||${JSON.stringify(input.profile)}::jsonb,revision=revision+1,updated_at=now() where athlete_id=${input.athleteId}`;
    else
      await tx`insert into recruiting_profiles(athlete_id,payload) values(${input.athleteId},${JSON.stringify(input.profile)}::jsonb)`;
    const [record] = (await sources(tx, true, { kind: "recruiting-profile", id: input.athleteId }))
      .profiles;
    await classify(
      tx,
      userId,
      "recruiting-profile",
      record.id,
      record.revision,
      record.sourceDigest,
      "Explicit operational recruiting profile edit",
    );
    await audit(tx, userId, "organization.content.profile-save", input.athleteId, "allowed", {
      revision: record.revision,
    });
    return { ok: true };
  });
}
export async function saveOrganizationRecruitingMetric(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof metricInput>,
) {
  const input = metricInput.parse(raw);
  if (input.measuredOn > new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
    throw new Error("Measurement date cannot be in the future.");
  return operate(sql, userId, "organization.content.metric-save", async (tx) => {
    await athlete(tx, input.athleteId);
    const [old] = await tx<{
      id: string;
      revision: number;
    }>`select id::text,revision from recruiting_metrics where athlete_id=${input.athleteId} and metric=${input.metric} for update`;
    if (
      old
        ? old.id !== input.id || old.revision !== input.revision
        : input.id !== "" || input.revision !== 0
    )
      throw changed();
    if (
      old &&
      !(await sources(tx, false, { kind: "recruiting-metric", id: old.id })).metrics[0]?.classified
    )
      throw new CoordinatorDenied();
    const id = old?.id || randomUUID();
    if (old)
      await tx`update recruiting_metrics set value=${input.value},measured_on=${input.measuredOn},evidence=${input.evidence},status=${input.request ? "pending" : "unverified"},revision=revision+1,submitted_by=${userId},verified_by=null,verifier_name=null,verified_at=null,source_booking_id=null,method='',review_note='',updated_at=now() where id=${id}`;
    else
      await tx`insert into recruiting_metrics(id,athlete_id,metric,value,measured_on,evidence,status,submitted_by) values(${id},${input.athleteId},${input.metric},${input.value},${input.measuredOn},${input.evidence},${input.request ? "pending" : "unverified"},${userId})`;
    const [row] = (await sources(tx, true, { kind: "recruiting-metric", id })).metrics;
    await classify(
      tx,
      userId,
      "recruiting-metric",
      id,
      row.revision,
      row.sourceDigest,
      "Explicit operational measurement edit",
    );
    await audit(tx, userId, "organization.content.metric-save", id, "allowed", {
      revision: row.revision,
    });
    return { ok: true, id };
  });
}
export async function reviewOrganizationRecruitingMetric(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof reviewInput>,
) {
  const input = reviewInput.parse(raw);
  if (input.approve && !input.method) throw new Error("Describe how the measurement was verified.");
  return operate(sql, userId, "organization.content.metric-review", async (tx) => {
    const [old] = await tx<{
      revision: number;
      status: string;
    }>`select revision,status from recruiting_metrics where id=${input.id} for update`;
    if (!old || old.revision !== input.revision || old.status !== "pending") throw changed();
    if (
      !(await sources(tx, false, { kind: "recruiting-metric", id: input.id })).metrics[0]
        ?.classified
    )
      throw new CoordinatorDenied();
    const [actor] = await tx<{ name: string }>`select name from "user" where id=${userId}`;
    await tx`update recruiting_metrics set status=${input.approve ? "verified" : "rejected"},verified_by=${input.approve ? userId : null},verifier_name=${input.approve ? actor.name : null},verified_at=${input.approve ? new Date().toISOString() : null},method=${input.method},review_note=${input.note},revision=revision+1,updated_at=now() where id=${input.id}`;
    const [row] = (await sources(tx, true, { kind: "recruiting-metric", id: input.id })).metrics;
    await classify(
      tx,
      userId,
      "recruiting-metric",
      input.id,
      row.revision,
      row.sourceDigest,
      "Explicit operational measurement review",
    );
    await audit(tx, userId, "organization.content.metric-review", input.id, "allowed", {
      revision: row.revision,
      approved: input.approve,
    });
    return { ok: true };
  });
}
export async function saveOrganizationDocumentMetadata(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof documentMetadataInput>,
) {
  const input = documentMetadataInput.parse(raw);
  return operate(sql, userId, "organization.content.document-save", async (tx) => {
    const [state] = await tx<{
      revision: number;
    }>`select revision from pd_working_file where id='club' for update`;
    const rows = (await sources(tx, false, { kind: "pd-document", id: input.id })).documents;
    const row = rows[0];
    if (rows.length !== 1 || !row.classified || !row.content) throw new CoordinatorDenied();
    if (
      state?.revision !== input.sourceRevision ||
      row.sourceDigest !== input.sourceDigest ||
      row.athleteId !== input.athleteId
    )
      throw changed();
    await tx`update pd_working_file set payload=jsonb_set(payload::jsonb,'{documents}',(select jsonb_agg(case when d->>'id'=${input.id} then d||${JSON.stringify({ name: input.name, kind: input.kind, date: input.date })}::jsonb else d end order by ord) from jsonb_array_elements(payload::jsonb->'documents') with ordinality as docs(d,ord))),revision=revision+1,updated_at=now() where id='club'`;
    const [next] = (await sources(tx, true, { kind: "pd-document", id: input.id })).documents;
    await classify(
      tx,
      userId,
      "pd-document",
      input.id,
      next.revision,
      next.sourceDigest,
      "Explicit operational document metadata edit",
    );
    await audit(tx, userId, "organization.content.document-save", input.id, "allowed", {
      sourceRevision: next.revision,
    });
    return { ok: true };
  });
}
