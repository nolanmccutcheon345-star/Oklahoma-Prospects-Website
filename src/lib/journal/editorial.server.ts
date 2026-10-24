import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Sql } from "../db";
import { verifiedAccount, grants, teamScope } from "../coordinator/access.server";
import { currentPublicationGuardian } from "../coordinator/player-publication.server";
import { publicPeopleFor } from "../person-public.server";
import {
  articleDocument,
  articleSave,
  articleAction,
  journalPermissions,
  mediaIds,
  documentText,
  slug,
  sport,
  type ArticleDocument,
  type ArticleRow,
  type JournalPermission,
} from "./contracts";

export class JournalDenied extends Error {
  constructor() {
    super("Your current Journal permissions do not allow this action.");
  }
}
export type Principal = {
  id: string;
  owner: boolean;
  permissions: JournalPermission[];
  sports: string[];
  teamIds: string[];
  coordinators: Awaited<ReturnType<typeof grants>>;
};
export async function principal(tx: Sql, actor: string): Promise<Principal> {
  const u = await verifiedAccount(tx, actor, true);
  const [o] =
    await tx`select email from owner_grants where user_id=${actor} and email=${u.email} and revoked_at is null for share`;
  const [g] = await tx<{
    permissions: JournalPermission[];
    sports: string[];
    team_ids: string[];
  }>`select permissions,sports,team_ids from journal_grants where user_id=${actor} for share`;
  return {
    id: actor,
    owner: Boolean(o),
    permissions: o ? [...journalPermissions] : g?.permissions || [],
    sports: o ? ["baseball", "softball", "academy"] : g?.sports || [],
    teamIds: g?.team_ids || [],
    coordinators: o ? [] : await grants(tx, actor, true),
  };
}
export function can(
  p: Principal,
  permission: JournalPermission,
  d?: ArticleDocument,
  createdBy?: string | null,
) {
  if (p.owner) return true;
  if (!p.permissions.includes("view") || !p.permissions.includes(permission)) return false;
  if (!d) return true;
  if (!p.sports.includes(d.sport) || (permission === "edit.own" && createdBy !== p.id))
    return false;
  if (p.teamIds.length && (!d.teamIds.length || d.teamIds.some((id) => !p.teamIds.includes(id))))
    return false;
  // An editorial grant cannot override a coordinator's currently approved program/team boundaries.
  if (
    p.coordinators.length &&
    !p.coordinators.some(
      (g) =>
        g.status === "active" &&
        g.sport === d.sport &&
        (g.coverage === "sport" ||
          (d.teamIds.length > 0 && d.teamIds.every((id) => g.team_ids.includes(id)))),
    )
  )
    return false;
  return true;
}
function requirePermission(
  p: Principal,
  permission: JournalPermission,
  d?: ArticleDocument,
  creator?: string | null,
) {
  if (!can(p, permission, d, creator)) throw new JournalDenied();
}
function requireEdit(p: Principal, row: ArticleRow) {
  if (
    !can(p, "edit.all", row.document, row.created_by) &&
    !can(p, "edit.own", row.document, row.created_by)
  )
    throw new JournalDenied();
}
export async function record(
  tx: Sql,
  actor: string | null,
  id: string | null,
  action: string,
  details: Record<string, unknown> = {},
) {
  await tx`insert into journal_audit(article_id,actor_id,action,details) values(${id},${actor},${action},${JSON.stringify(details)}::jsonb)`;
}
export async function secured<T>(
  sql: Sql,
  actor: string,
  work: (tx: Sql, p: Principal) => Promise<T>,
) {
  try {
    return await sql.transaction(async (tx) => work(tx, await principal(tx, actor)));
  } catch (error) {
    if (error instanceof JournalDenied)
      await record(sql, actor, null, "access-denied").catch(() => {});
    throw error;
  }
}
export async function lockedArticle(tx: Sql, id: string, revision?: number) {
  const [row] =
    await tx<ArticleRow>`select id::text,revision,status,document,created_by,approved_revision,approved_by,scheduled_at::text,published_at::text,updated_at::text from journal_articles where id=${id} for update`;
  if (!row) throw new Error("Article not found.");
  if (revision !== undefined && revision !== row.revision)
    throw new Error(
      "This article changed in another session. Reload before saving; your unsaved text has been kept.",
    );
  return row;
}
async function validateReferences(tx: Sql, d: ArticleDocument, articleId: string) {
  for (const id of d.teamIds)
    if ((await teamScope(tx, id)).sport !== d.sport)
      throw new Error("The article's sport must match every selected team.");
  for (const id of d.categoryIds) {
    const [c] = await tx`select id from journal_categories where id=${id} and active`;
    if (!c) throw new Error("Select active article categories.");
  }
  for (const id of mediaIds(d)) {
    const [m] = await tx`select id from journal_media where id=${id} and article_id=${articleId}`;
    if (!m) throw new Error("Images must belong to this article.");
  }
  if (d.authorId || d.reviewerId) {
    const people = await publicPeopleFor(tx);
    for (const id of [d.authorId, d.reviewerId].filter(Boolean))
      if (!people.some((p) => p.id === id))
        throw new Error("Select a currently published staff profile for the byline.");
  }
  for (const r of d.related) {
    if (r.kind === "team") {
      if (!d.teamIds.includes(r.id))
        throw new Error("Related teams must be included in this article's team scope.");
      await teamScope(tx, r.id);
    }
    if (r.kind === "coach" && !(await publicPeopleFor(tx)).some((p) => p.id === r.id))
      throw new Error("Related coach is not publicly available.");
    if (r.kind === "service") {
      const [s] = await tx`select id from club_services where id=${r.id} and active`;
      if (!s) throw new Error("Related service is unavailable.");
    }
    if (r.kind === "event") {
      const [e] =
        await tx`select id from training_events where id=${r.id} and payload->>'status'='published'`;
      if (!e) throw new Error("Related event is unavailable.");
    }
  }
  // Only owners can access athlete selectors. Editors receive no household or private athlete records.
  for (const id of d.athleteIds) {
    const [a] = await tx`select id from club_athletes where id=${id}`;
    if (!a) throw new Error("Select an existing athlete.");
  }
}
async function persist(tx: Sql, p: Principal, row: ArticleRow, d: ArticleDocument) {
  await validateReferences(tx, d, row.id);
  if (!p.owner && JSON.stringify(d.athleteIds) !== JSON.stringify(row.document.athleteIds))
    throw new JournalDenied();
  if (
    !can(p, "features", d, row.created_by) &&
    !isDeepStrictEqual(d.featured, row.document.featured)
  )
    throw new JournalDenied();
  for (const key of ["seoTitle", "seoDescription", "canonical", "noindex", "slug"] as const)
    if (!can(p, "seo", d, row.created_by) && d[key] !== row.document[key])
      throw new JournalDenied();
  const revision = row.revision + 1;
  await tx`update journal_articles set document=${JSON.stringify(d)}::jsonb,revision=${revision},status='draft',approved_revision=null,approved_by=null,scheduled_at=null,updated_by=${p.id},updated_at=now() where id=${row.id}`;
  await tx`insert into journal_revisions(article_id,revision,document,editor_id) values(${row.id},${revision},${JSON.stringify(d)}::jsonb,${p.id})`;
  await record(tx, p.id, row.id, "save", { revision });
  return { id: row.id, revision };
}
export async function saveArticleFor(sql: Sql, actor: string, value: unknown) {
  const v = articleSave.parse(value);
  return secured(sql, actor, async (tx, p) => {
    if (v.id) {
      const row = await lockedArticle(tx, v.id, v.revision);
      requireEdit(p, row);
      requireEdit(p, { ...row, document: v.document });
      return persist(tx, p, row, v.document);
    }
    requirePermission(p, "create", v.document);
    if (v.revision !== 0) throw new Error("A new draft starts at revision zero.");
    const id = randomUUID();
    const empty = articleDocument.parse({
      title: v.document.title,
      slug: v.document.slug,
      sport: v.document.sport,
      teamIds: v.document.teamIds,
    });
    await tx`insert into journal_articles(id,document,created_by,updated_by) values(${id},${JSON.stringify(empty)}::jsonb,${actor},${actor})`;
    return persist(
      tx,
      p,
      { id, document: empty, created_by: actor, revision: 0 } as ArticleRow,
      v.document,
    );
  });
}
export async function consentValid(
  tx: Sql,
  articleId: string,
  revision: number,
  d: ArticleDocument,
) {
  if (d.containsMinorIdentity && !d.athleteIds.length) return false;
  for (const athleteId of d.athleteIds) {
    const [c] = await tx<{
      guardian_id: string;
      household_id: string;
    }>`select c.guardian_id,a.household_id from journal_consents c join club_athletes a on a.id=c.athlete_id where c.article_id=${articleId} and c.revision=${revision} and c.athlete_id=${athleteId} and c.revoked_at is null`;
    if (
      !c ||
      !c.household_id ||
      !(await currentPublicationGuardian(tx, c.household_id, { id: c.guardian_id }))
    )
      return false;
  }
  return true;
}
async function ready(tx: Sql, row: ArticleRow) {
  const d = articleDocument.parse(row.document);
  if (
    !d.title.trim() ||
    !d.excerpt.trim() ||
    !d.body.length ||
    !d.categoryIds.length ||
    !d.authorId ||
    !d.rightsConfirmed ||
    !d.factsVerified
  )
    throw new Error(
      "Complete the article, category, published author, rights confirmation and fact verification before approval.",
    );
  if (d.canonical && d.canonical !== `https://prospectssports.club/articles/${d.slug}`)
    throw new Error("Use this article's canonical URL; syndicated attribution belongs in Sources.");
  if (d.sources.some((s) => !s.checkedOn))
    throw new Error("Verify every cited source and enter its review date.");
  await validateReferences(tx, d, row.id);
  if (!(await consentValid(tx, row.id, row.revision, d)))
    throw new Error(
      "Current article-specific guardian consent is required for every athlete in this exact revision.",
    );
}
async function publish(tx: Sql, row: ArticleRow, actor: string) {
  if (row.approved_revision !== row.revision || !row.approved_by)
    throw new Error("Approve this exact article revision first.");
  const approver = await principal(tx, row.approved_by);
  requirePermission(approver, "approve", row.document, row.created_by);
  await ready(tx, row);
  await tx`insert into journal_slugs(slug,article_id) values(${row.document.slug},${row.id}) on conflict do nothing`;
  const [s] = await tx<{
    article_id: string;
  }>`select article_id::text from journal_slugs where slug=${row.document.slug} for update`;
  if (s.article_id !== row.id)
    throw new Error("That article URL is already reserved. Choose another slug.");
  await tx`insert into journal_publications(article_id,revision,document,approved_by,published_by,visible,search_text) values(${row.id},${row.revision},${JSON.stringify(row.document)}::jsonb,${row.approved_by},${actor},true,${documentText(row.document)}) on conflict(article_id) do update set revision=excluded.revision,document=excluded.document,approved_by=excluded.approved_by,published_by=excluded.published_by,visible=true,search_text=excluded.search_text,updated_at=now()`;
  await tx`update journal_articles set status='published',published_revision=${row.revision},published_at=coalesce(published_at,now()),scheduled_at=null where id=${row.id}`;
}
export async function actionFor(sql: Sql, actor: string, value: unknown) {
  const v = articleAction.parse(value);
  return secured(sql, actor, async (tx, p) => {
    const row = await lockedArticle(tx, v.id, v.revision);
    const permission = {
      submit: "submit",
      return: "review",
      approve: "approve",
      publish: "publish",
      schedule: "publish",
      unpublish: "publish",
      archive: "publish",
      restore: "edit.own",
    }[v.action] as JournalPermission;
    if (v.action === "restore") requireEdit(p, row);
    else requirePermission(p, permission, row.document, row.created_by);
    if (v.action === "submit") {
      requireEdit(p, row);
      if (row.status !== "draft") throw new Error("Only drafts may be submitted.");
      await tx`update journal_articles set status='pending' where id=${v.id}`;
    }
    if (v.action === "return") {
      if (!["pending", "approved", "scheduled"].includes(row.status))
        throw new Error("This article is not in review.");
      await tx`update journal_articles set status='draft',approved_revision=null,approved_by=null,scheduled_at=null where id=${v.id}`;
    }
    if (v.action === "approve") {
      if (row.status !== "pending") throw new Error("Submit this draft for review first.");
      if (row.created_by === actor && !p.owner)
        throw new Error("A different authorized reviewer must approve your article.");
      await ready(tx, row);
      await tx`update journal_articles set status='approved',approved_revision=${row.revision},approved_by=${actor} where id=${v.id}`;
    }
    if (v.action === "publish" || v.action === "schedule") {
      if (!["approved", "scheduled"].includes(row.status))
        throw new Error("Only approved articles can be published or scheduled.");
      if (v.action === "publish") await publish(tx, row, actor);
      else {
        if (!v.scheduledAt || Date.parse(v.scheduledAt) <= Date.now())
          throw new Error("Choose a future publication time.");
        await ready(tx, row);
        await tx`update journal_articles set status='scheduled',scheduled_at=${v.scheduledAt},updated_by=${actor} where id=${v.id}`;
      }
    }
    if (v.action === "archive" || v.action === "unpublish") {
      await tx`update journal_publications set visible=false where article_id=${v.id}`;
      await tx`update journal_articles set status=${v.action === "archive" ? "archived" : "draft"},approved_revision=null,approved_by=null,scheduled_at=null where id=${v.id}`;
    }
    if (v.action === "restore") {
      const [r] = await tx<{
        document: ArticleDocument;
      }>`select document from journal_revisions where article_id=${v.id} and revision=${v.restoreRevision || 0}`;
      if (!r) throw new Error("Revision not found.");
      requireEdit(p, { ...row, document: r.document });
      const saved = await persist(tx, p, row, r.document);
      await record(tx, actor, v.id, "restore", { from: v.restoreRevision, to: saved.revision });
      return saved;
    }
    await record(tx, actor, v.id, v.action, {
      revision: row.revision,
      note: v.note,
      scheduledAt: v.scheduledAt || null,
    });
    return { id: v.id, revision: row.revision };
  });
}
/** Called only by the Netlify scheduled function. Exact approvals and current grants are rechecked. */
export async function publishScheduledFor(sql: Sql) {
  const rows = await sql<{
    id: string;
    updated_by: string;
  }>`select id::text,updated_by from journal_articles where status='scheduled' and scheduled_at<=now() order by scheduled_at limit 30`;
  let published = 0;
  for (const item of rows) {
    try {
      await secured(sql, item.updated_by, async (tx, p) => {
        const row = await lockedArticle(tx, item.id);
        if (
          row.status !== "scheduled" ||
          !row.scheduled_at ||
          Date.parse(row.scheduled_at) > Date.now()
        )
          return;
        requirePermission(p, "publish", row.document, row.created_by);
        await publish(tx, row, p.id);
        await record(tx, p.id, row.id, "scheduled-publication", { revision: row.revision });
        published++;
      });
    } catch {
      await record(sql, null, item.id, "schedule-blocked", {
        reason: "Current approval, scope, references or consent require review.",
      });
    }
  }
  return { checked: rows.length, published };
}
export async function editorFor(sql: Sql, actor: string) {
  return secured(sql, actor, async (tx, p) => {
    requirePermission(p, "view");
    const all =
      await tx<ArticleRow>`select id::text,revision,status,jsonb_set(document,'{body}','[]'::jsonb) document,created_by,approved_revision,approved_by,scheduled_at::text,published_at::text,updated_at::text from journal_articles order by updated_at desc`;
    const articles = all.filter((a) => can(p, "view", a.document, a.created_by));
    return {
      actorId: p.id,
      owner: p.owner,
      permissions: p.permissions,
      sports: p.sports,
      teamIds: p.teamIds,
      articles,
      categories: await tx<{
        id: string;
        name: string;
        slug: string;
        description: string;
        display_order: number;
        active: boolean;
        revision: number;
      }>`select * from journal_categories order by display_order,name`,
      authors: (await publicPeopleFor(tx)).map((p) => ({ id: p.id, name: p.name })),
      relatedOptions: [
        ...(await publicPeopleFor(tx)).map((person) => ({
          kind: "coach" as const,
          id: person.id,
          name: person.name,
        })),
        ...(
          await tx<{ id: string; name: string }>`select id,name from club_services where active`
        ).map((row) => ({ ...row, kind: "service" as const })),
        ...(
          await tx<{
            id: string;
            name: string;
          }>`select id,payload->>'name' name from training_events where payload->>'status'='published'`
        ).map((row) => ({ ...row, kind: "event" as const })),
      ],
      teams: (
        await tx<{
          id: string;
          name: string;
          sport: string;
        }>`select t->>'id' id,t->>'name' name,t->>'sport' sport from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t where c.id='oklahoma-prospects' and not c.demo and coalesce(t->>'closed','false')<>'true'`
      ).filter((t) =>
        can(
          p,
          "view",
          articleDocument.parse({ title: t.name, slug: "scope", sport: t.sport, teamIds: [t.id] }),
        ),
      ),
      accounts: p.owner
        ? await tx<{
            id: string;
            name: string;
            email: string;
          }>`select id,name,email from "user" where "emailVerified" and "disabledAt" is null order by name`
        : [],
      athletes: p.owner
        ? await tx<{ id: string; name: string }>`select id,name from club_athletes order by name`
        : [],
      grants: p.owner
        ? await tx<{
            user_id: string;
            revision: number;
            permissions: JournalPermission[];
            sports: string[];
            team_ids: string[];
          }>`select user_id,revision,permissions,sports,team_ids from journal_grants`
        : [],
      metrics: p.owner
        ? await tx<{
            article_id: string;
            event: string;
            count: string;
          }>`select article_id::text,event,sum(count)::text count from journal_metrics group by article_id,event`
        : [],
      settings: (
        await tx<{
          revision: number;
          metrics_enabled: boolean;
        }>`select revision,metrics_enabled from journal_settings where id=true`
      )[0],
    };
  });
}
export async function detailFor(sql: Sql, actor: string, id: string) {
  return secured(sql, actor, async (tx, p) => {
    const row = await lockedArticle(tx, id);
    requirePermission(p, "view", row.document, row.created_by);
    return {
      row,
      revisions: await tx<{
        revision: number;
        created_at: string;
      }>`select revision,created_at::text from journal_revisions where article_id=${id} order by revision desc`,
      audit: await tx<{
        action: string;
        created_at: string;
      }>`select action,created_at::text from journal_audit where article_id=${id} order by id desc limit 100`,
      media: await tx<{
        id: string;
        credit: string;
        rights_note: string;
      }>`select id::text,credit,rights_note from journal_media where article_id=${id}`,
      consents: p.owner
        ? await tx<{
            id: string;
            revision: number;
            athlete_id: string;
            scope: string;
            revoked_at: string | null;
          }>`select id::text,revision,athlete_id,scope,revoked_at::text from journal_consents where article_id=${id}`
        : [],
    };
  });
}
export const grantInput = z
  .object({
    userId: z.string().min(1),
    revision: z.number().int().min(0),
    permissions: z.array(z.enum(journalPermissions)).max(11),
    sports: z.array(sport).max(3),
    teamIds: z.array(z.string()).max(100),
  })
  .strict();
export async function grantFor(sql: Sql, actor: string, value: unknown) {
  const v = grantInput.parse(value);
  return secured(sql, actor, async (tx, p) => {
    if (!p.owner) throw new JournalDenied();
    await verifiedAccount(tx, v.userId, true);
    for (const id of v.teamIds)
      if (!v.sports.includes((await teamScope(tx, id)).sport))
        throw new Error("Team and sport scope must match.");
    const [old] = await tx<{
      revision: number;
    }>`select revision from journal_grants where user_id=${v.userId} for update`;
    if ((old?.revision || 0) !== v.revision) throw new Error("Permissions changed. Reload first.");
    await tx`insert into journal_grants(user_id,revision,permissions,sports,team_ids,updated_by) values(${v.userId},${v.revision + 1},${v.permissions},${v.sports},${v.teamIds},${actor}) on conflict(user_id) do update set revision=excluded.revision,permissions=excluded.permissions,sports=excluded.sports,team_ids=excluded.team_ids,updated_by=excluded.updated_by,updated_at=now()`;
    await record(tx, actor, null, "grant", {
      userId: v.userId,
      permissions: v.permissions,
      sports: v.sports,
      teamIds: v.teamIds,
    });
    return true;
  });
}
export const categoryInput = z
  .object({
    id: slug,
    revision: z.number().int().min(0),
    name: z.string().min(1).max(100),
    slug,
    description: z.string().max(500),
    displayOrder: z.number().int().min(0).max(1000),
    active: z.boolean(),
  })
  .strict();
export async function categoryFor(sql: Sql, actor: string, value: unknown) {
  const v = categoryInput.parse(value);
  return secured(sql, actor, async (tx, p) => {
    requirePermission(p, "categories");
    const [old] = await tx<{
      revision: number;
    }>`select revision from journal_categories where id=${v.id} for update`;
    if ((old?.revision || 0) !== v.revision) throw new Error("Category changed. Reload first.");
    await tx`insert into journal_categories(id,name,slug,description,display_order,active,revision) values(${v.id},${v.name},${v.slug},${v.description},${v.displayOrder},${v.active},${v.revision + 1}) on conflict(id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,display_order=excluded.display_order,active=excluded.active,revision=excluded.revision`;
    await record(tx, actor, null, "category", { id: v.id, revision: v.revision + 1 });
    return true;
  });
}
export const consentInput = z
  .object({
    articleId: z.uuid(),
    revision: z.number().int().positive(),
    athleteId: z.string().min(1),
    guardianId: z.string().min(1),
    scope: z.string().min(10).max(2000),
    evidenceReference: z.string().min(5).max(1000),
  })
  .strict();
export async function consentFor(sql: Sql, actor: string, value: unknown) {
  const v = consentInput.parse(value);
  return secured(sql, actor, async (tx, p) => {
    if (!p.owner) throw new JournalDenied();
    const row = await lockedArticle(tx, v.articleId, v.revision);
    if (!row.document.athleteIds.includes(v.athleteId))
      throw new Error("Add this athlete to the draft before recording consent.");
    const [a] = await tx<{
      household_id: string;
    }>`select household_id from club_athletes where id=${v.athleteId}`;
    if (
      !a?.household_id ||
      !(await currentPublicationGuardian(tx, a.household_id, { id: v.guardianId }))
    )
      throw new Error("A current verified guardian relationship is required.");
    await tx`insert into journal_consents(id,article_id,revision,athlete_id,guardian_id,scope,evidence_reference,recorded_by) values(${randomUUID()},${v.articleId},${v.revision},${v.athleteId},${v.guardianId},${v.scope},${v.evidenceReference},${actor})`;
    await record(tx, actor, v.articleId, "consent-recorded", {
      revision: v.revision,
      athleteId: v.athleteId,
    });
    return true;
  });
}
export async function withdrawConsentFor(sql: Sql, actor: string, id: string) {
  return secured(sql, actor, async (tx, p) => {
    const [c] = await tx<{
      article_id: string;
      guardian_id: string;
    }>`select article_id::text,guardian_id from journal_consents where id=${id} for update`;
    if (!c || (!p.owner && c.guardian_id !== actor)) throw new JournalDenied();
    await tx`update journal_consents set revoked_at=now(),revoked_by=${actor} where id=${id}`;
    await tx`update journal_publications set visible=false where article_id=${c.article_id}`;
    await record(tx, actor, c.article_id, "consent-withdrawn", { consentId: id });
    return true;
  });
}
export async function familyConsentsFor(sql: Sql, actor: string) {
  return secured(
    sql,
    actor,
    async (tx) =>
      tx<{
        id: string;
        title: string;
        revision: number;
        scope: string;
        revoked_at: string | null;
      }>`select c.id::text,r.document->>'title' title,c.revision,c.scope,c.revoked_at::text from journal_consents c join journal_revisions r on r.article_id=c.article_id and r.revision=c.revision where c.guardian_id=${actor} order by c.recorded_at desc`,
  );
}
