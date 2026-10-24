import { randomUUID } from "node:crypto";
import type { Sql } from "./db";
import { lockFinancialExecution } from "./finance/execution.server";
import { financialPrincipalInTransaction } from "./finance/principal.server";
import { publicPeopleFor } from "./person-public.server";
import { publicPhotoLink } from "./public-coach-photo.server";
import {
  homepageInput,
  testimonialInput,
  type Testimonial,
  type PublicTestimonial,
  aboutContentInput,
  aboutSaveInput,
  type AboutEditorData,
} from "./website-content-contracts";

async function owner<T>(sql: Sql, actor: string, work: (tx: Sql) => Promise<T>) {
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    const me = await financialPrincipalInTransaction(tx, actor);
    if (!me.owner) throw new Error("Only an authorized owner can manage website publication.");
    return work(tx);
  });
}
async function aboutPage(sql: Sql): Promise<AboutEditorData> {
  const [row] =
    await sql<AboutEditorData>`select revision,draft_content as draft,published_content as published,published_at::text as "publishedAt" from website_pages where id='about'`;
  if (!row) throw new Error("About page settings are unavailable. Reload to try again.");
  return {
    ...row,
    draft: aboutContentInput.parse(row.draft),
    published: row.published ? aboutContentInput.parse(row.published) : null,
  };
}
export async function publicAboutFor(sql: Sql) {
  // Public responses never select draft content, editor identities or audit records.
  const [row] = await sql<{
    content: unknown;
  }>`select published_content as content from website_pages where id='about'`;
  return row?.content ? aboutContentInput.parse(row.content) : null;
}
export async function aboutEditorFor(sql: Sql, actor: string) {
  return owner(sql, actor, (tx) => aboutPage(tx));
}
export async function saveAboutFor(sql: Sql, actor: string, raw: unknown) {
  const input = aboutSaveInput.parse(raw);
  return owner(sql, actor, async (tx) => {
    const before = await aboutPage(tx);
    const document = JSON.stringify(input.content);
    const rows =
      input.action === "publish"
        ? await tx`update website_pages set draft_content=${document}::jsonb,published_content=${document}::jsonb,published_at=now(),revision=revision+1,updated_by=${actor},updated_at=now() where id='about' and revision=${input.revision} returning revision`
        : await tx`update website_pages set draft_content=${document}::jsonb,revision=revision+1,updated_by=${actor},updated_at=now() where id='about' and revision=${input.revision} returning revision`;
    if (!rows.length)
      throw new Error(
        "About page changed in another session. Reload before saving; your text has not been published.",
      );
    await record(
      tx,
      actor,
      input.action === "publish" ? "about-published" : "about-draft",
      "about",
      before,
      input.content,
    );
    return aboutPage(tx);
  });
}
async function people(sql: Sql) {
  return (await publicPeopleFor(sql))
    .filter((p) => p.coach)
    .map((p) => ({ ...p, photo: publicPhotoLink(p) }));
}
async function homepage(sql: Sql) {
  const [row] = await sql<{
    revision: number;
    featuredCoachIds: string[];
  }>`select revision,featured_coach_ids as "featuredCoachIds" from website_homepage where id='home'`;
  return row || { revision: 0, featuredCoachIds: [] };
}
async function record(
  sql: Sql,
  actor: string,
  entity: string,
  id: string,
  before: unknown,
  after: unknown,
) {
  await sql`insert into website_content_audit(id,actor_id,entity,target_id,before_value,after_value) values(${randomUUID()},${actor},${entity},${id},${JSON.stringify(before ?? null)}::jsonb,${JSON.stringify(after)}::jsonb)`;
}
export async function publicHomepageFor(sql: Sql) {
  const [settings, published, testimonials] = await Promise.all([
    homepage(sql),
    people(sql),
    sql<PublicTestimonial>`select id::text,quote,attribution,team_affiliation as "teamAffiliation" from website_testimonials where status='published' and consent_confirmed and consent_by is not null and consent_at is not null order by sort_order,id limit 3`,
  ]);
  return {
    coaches: settings.featuredCoachIds
      .map((id) => published.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p)),
    testimonials,
  };
}
export async function websiteEditorFor(sql: Sql, actor: string) {
  return owner(sql, actor, async (tx) => ({
    homepage: await homepage(tx),
    coaches: await people(tx),
    testimonials:
      await tx<Testimonial>`select id::text,quote,attribution,team_affiliation as "teamAffiliation",status,consent_confirmed as "consentConfirmed",consent_note as "consentNote",sort_order as "sortOrder",revision,updated_at::text as "updatedAt" from website_testimonials order by sort_order,id`,
    audit: await tx<{
      entity: string;
      targetId: string;
      actor: string;
      at: string;
    }>`select a.entity,a.target_id as "targetId",coalesce(u.name,'Former account') as actor,a.created_at::text as at from website_content_audit a left join "user" u on u.id=a.actor_id order by a.created_at desc limit 25`,
  }));
}
export async function saveHomepageFor(sql: Sql, actor: string, raw: unknown) {
  const input = homepageInput.parse(raw);
  return owner(sql, actor, async (tx) => {
    const allowed = await people(tx);
    if (input.featuredCoachIds.some((id) => !allowed.some((p) => p.id === id)))
      throw new Error("Choose currently published coaches. Reload to review changed profiles.");
    const before = await homepage(tx);
    const rows =
      await tx`update website_homepage set featured_coach_ids=${input.featuredCoachIds}::text[],revision=revision+1,updated_by=${actor},updated_at=now() where id='home' and revision=${input.revision} returning revision`;
    if (!rows.length) throw new Error("Homepage settings changed. Reload before saving.");
    await record(tx, actor, "homepage", "home", before, input);
    return { ok: true };
  });
}
export async function saveTestimonialFor(sql: Sql, actor: string, raw: unknown) {
  const input = testimonialInput.parse(raw);
  return owner(sql, actor, async (tx) => {
    const id = input.id || randomUUID();
    const [before] = await tx`select * from website_testimonials where id=${id} for update`;
    if (
      (input.id && !before) ||
      (before && before.revision !== input.revision) ||
      (!before && input.revision !== 0)
    )
      throw new Error("This testimonial changed. Reload before saving.");
    await tx`insert into website_testimonials(id,quote,attribution,team_affiliation,status,consent_confirmed,consent_note,consent_by,consent_at,sort_order,updated_by)
      values(${id},${input.quote},${input.attribution},${input.teamAffiliation},${input.status},${input.consentConfirmed},${input.consentNote},${input.consentConfirmed ? actor : null},${input.consentConfirmed ? new Date().toISOString() : null},${input.sortOrder},${actor})
      on conflict(id) do update set quote=excluded.quote,attribution=excluded.attribution,team_affiliation=excluded.team_affiliation,status=excluded.status,consent_confirmed=excluded.consent_confirmed,consent_note=excluded.consent_note,consent_by=excluded.consent_by,consent_at=excluded.consent_at,sort_order=excluded.sort_order,updated_by=excluded.updated_by,updated_at=now(),revision=website_testimonials.revision+1`;
    await record(tx, actor, "testimonial", id, before, input);
    return { ok: true, id };
  });
}
