import type { Sql } from "../db";
import { publicPeopleFor } from "../person-public.server";
import {
  articleDocument,
  documentText,
  type ArticleDocument,
  type PublicArticle,
} from "./contracts";
import { consentValid } from "./editorial.server";
export type Publication = {
  article_id: string;
  revision: number;
  document: ArticleDocument;
  published_at: string;
  updated_at: string;
};
export async function visiblePublications(sql: Sql) {
  return sql<Publication>`select article_id::text,revision,document,published_at::text,updated_at::text from journal_visible_publications order by published_at desc`;
}
export async function projectPublic(
  sql: Sql,
  rows: Publication[],
  includeBody = true,
): Promise<PublicArticle[]> {
  if (!rows.length) return [];
  const people = await publicPeopleFor(sql);
  const byline = (id: string | null) => {
    const p = people.find((p) => p.id === id);
    return p
      ? { id: p.id, name: p.name, href: `/articles/authors/${encodeURIComponent(p.id)}` }
      : null;
  };
  return rows.map((r) => {
    const d = articleDocument.parse(r.document);
    // Deliberate allowlist: no guardian IDs, consent evidence, internal notes, account IDs or private player records.
    const document: PublicArticle["document"] = {
      title: d.title,
      subtitle: d.subtitle,
      slug: d.slug,
      excerpt: d.excerpt,
      sport: d.sport,
      teamIds: d.teamIds,
      categoryIds: d.categoryIds,
      tags: d.tags,
      body: includeBody ? d.body : [],
      heroId: d.heroId,
      heroAlt: d.heroAlt,
      sources: d.sources,
      related: d.related,
      seoTitle: d.seoTitle,
      seoDescription: d.seoDescription,
      canonical: d.canonical,
      noindex: d.noindex,
      news: d.news,
      featured: d.featured,
      series: d.series,
    };
    return {
      id: r.article_id,
      revision: r.revision,
      document,
      author: byline(d.authorId),
      reviewer: byline(d.reviewerId),
      publishedAt: r.published_at,
      updatedAt: r.updated_at,
      readingMinutes: Math.max(1, Math.ceil(documentText(d).split(/\s+/).length / 220)),
    };
  });
}
export type ArticleFilters = {
  q?: string;
  category?: string;
  sport?: string;
  page?: number;
  author?: string;
  team?: string;
  featured?: boolean;
};
export async function publicFeedFor(sql: Sql, filters: ArticleFilters = {}) {
  const categories = await sql<{
    id: string;
    name: string;
    slug: string;
  }>`select id,name,slug from journal_categories where active order by display_order,name`;
  const params: unknown[] = [],
    clauses: string[] = [];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.sport) clauses.push(`document->>'sport'=${bind(filters.sport)}`);
  if (filters.category) clauses.push(`document->'categoryIds' ? ${bind(filters.category)}`);
  if (filters.author) clauses.push(`document->>'authorId'=${bind(filters.author)}`);
  if (filters.team) clauses.push(`document->'teamIds' ? ${bind(filters.team)}`);
  if (filters.q?.trim())
    clauses.push(
      `to_tsvector('english',search_text) @@ plainto_tsquery('english',${bind(filters.q)})`,
    );
  if (filters.featured)
    clauses.push(
      `document->'featured'->>'homepage'='true' and (document->'featured'->>'expiresAt' is null or (document->'featured'->>'expiresAt')::timestamptz>now())`,
    );
  const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";
  const [count] = await sql.query<{ total: string }>(
    `select count(*)::text total from journal_visible_publications${where}`,
    params,
  );
  const total = Number(count.total),
    page = Math.max(1, filters.page || 1),
    size = filters.featured ? 3 : 12;
  const priority = filters.featured ? "homepage" : filters.category ? "category" : "newsroom";
  // The only interpolated SQL identifier is selected from the fixed three-value set above.
  const order = `case when document->'featured'->>'${priority}'='true' and (document->'featured'->>'expiresAt' is null or (document->'featured'->>'expiresAt')::timestamptz>now()) then 1 else 0 end desc, coalesce((document->'featured'->>'priority')::integer,0) desc,published_at desc,article_id`;
  const rows = await sql.query<Publication>(
    `select article_id::text,revision,document,published_at::text,updated_at::text from journal_visible_publications${where} order by ${order} limit ${size} offset ${(page - 1) * size}`,
    params,
  );
  const popular =
    filters.featured || filters.q || filters.category || filters.sport || filters.author || page > 1
      ? []
      : await sql<{
          slug: string;
          title: string;
          views: string;
        }>`select p.document->>'slug' slug,p.document->>'title' title,sum(m.count)::text views from journal_metrics m join journal_visible_publications p on p.article_id=m.article_id join journal_settings s on s.id=true and s.metrics_enabled where m.event='view' group by p.article_id,p.document having sum(m.count)>0 order by sum(m.count) desc limit 3`;
  return {
    popular,
    articles: await projectPublic(sql, rows, false),
    categories,
    total,
    page,
    pages: Math.ceil(total / size),
    filtered: Boolean(filters.q || filters.category || filters.sport || page > 1),
  };
}
export async function publicArticleFor(sql: Sql, slug: string) {
  const [s] = await sql<{
    article_id: string;
  }>`select article_id::text from journal_slugs where slug=${slug}`;
  if (!s) return null;
  const rows =
    await sql<Publication>`select article_id::text,revision,document,published_at::text,updated_at::text from journal_publications where article_id=${s.article_id} and visible`;
  if (
    !rows[0] ||
    !(await consentValid(sql, rows[0].article_id, rows[0].revision, rows[0].document))
  )
    return null;
  if (rows[0].document.slug !== slug) return { redirect: rows[0].document.slug } as const;
  const [article] = await projectPublic(sql, rows);
  const related =
    await sql<Publication>`select article_id::text,revision,document,published_at::text,updated_at::text from journal_visible_publications where article_id<>${article.id} and document->'categoryIds' ?| ${article.document.categoryIds} order by published_at desc limit 3`;
  const links: { name: string; href: string }[] = [];
  const people = await publicPeopleFor(sql);
  const refs = [
    ...article.document.related,
    ...article.document.teamIds.map((id) => ({ kind: "team" as const, id })),
  ];
  for (const ref of refs) {
    if (ref.kind === "team") {
      const [t] = await sql<{
        name: string;
      }>`select t->>'name' name from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t where c.id='oklahoma-prospects' and not c.demo and t->>'id'=${ref.id} and coalesce(t->>'closed','false')<>'true'`;
      if (t) links.push({ name: t.name, href: `/teams/${encodeURIComponent(ref.id)}` });
    }
    if (ref.kind === "coach") {
      const p = people.find((p) => p.id === ref.id);
      if (p)
        links.push({ name: p.name, href: `/training?instructor=${encodeURIComponent(p.coachId)}` });
    }
    if (ref.kind === "event") {
      const [e] = await sql<{
        name: string;
      }>`select payload->>'name' name from training_events where id=${ref.id} and payload->>'status'='published'`;
      if (e) links.push({ name: e.name, href: "/events" });
    }
    if (ref.kind === "service") {
      const [p] = await sql<{
        name: string;
        kind: string;
      }>`select name,kind from club_services where id=${ref.id} and active`;
      if (p) links.push({ name: p.name, href: p.kind === "cage" ? "/book" : "/training" });
    }
  }
  const credits = await sql<{
    id: string;
    credit: string;
  }>`select id::text,credit from journal_media where article_id=${article.id}`;
  return { article, related: await projectPublic(sql, related, false), credits, links } as const;
}
export async function recordMetricFor(sql: Sql, id: string, event: "view" | "cta") {
  const [settings] = await sql<{
    metrics_enabled: boolean;
  }>`select metrics_enabled from journal_settings where id=true`;
  if (!settings?.metrics_enabled) return false;
  const [r] =
    await sql<Publication>`select article_id::text,revision,document from journal_publications where article_id=${id} and visible`;
  if (!r || !(await consentValid(sql, id, r.revision, r.document))) return false;
  await sql`insert into journal_metrics(article_id,day,event,count) values(${id},current_date,${event},1) on conflict(article_id,day,event) do update set count=journal_metrics.count+1`;
  return true;
}
