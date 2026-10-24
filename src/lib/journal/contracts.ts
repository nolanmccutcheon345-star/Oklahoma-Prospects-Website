import { z } from "zod";

export const journalPermissions = [
  "view",
  "create",
  "edit.own",
  "edit.all",
  "submit",
  "review",
  "approve",
  "publish",
  "categories",
  "features",
  "seo",
] as const;
export type JournalPermission = (typeof journalPermissions)[number];
export const sport = z.enum(["baseball", "softball", "academy"]);
export const slug = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const safeLink = z
  .string()
  .max(2000)
  .refine((value) => {
    if (/^\/(?!\/)[a-zA-Z0-9/_.?=&%#-]*$/.test(value)) return true;
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Use a site path or an HTTPS URL without credentials.");
const text = z.string().max(12000);
export const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text }).strict(),
  z
    .object({
      type: z.literal("heading"),
      text: z.string().max(250),
      level: z.union([z.literal(2), z.literal(3)]),
    })
    .strict(),
  z
    .object({
      type: z.literal("list"),
      ordered: z.boolean(),
      items: z.array(z.string().max(2000)).max(30),
    })
    .strict(),
  z.object({ type: z.literal("quote"), text, attribution: z.string().max(250) }).strict(),
  z.object({ type: z.literal("callout"), title: z.string().max(250), text }).strict(),
  z.object({ type: z.literal("drill"), title: z.string().max(250), text }).strict(),
  z
    .object({
      type: z.literal("image"),
      mediaId: z.uuid(),
      alt: z.string().min(1).max(500),
      caption: z.string().max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal("video"),
      url: safeLink.refine((v) =>
        /^https:\/\/(www\.youtube\.com\/watch\?v=[\w-]{11}|youtu\.be\/[\w-]{11}|vimeo\.com\/\d+)$/.test(
          v,
        ),
      ),
      title: z.string().min(1).max(250),
    })
    .strict(),
  z
    .object({
      type: z.literal("table"),
      headers: z.array(z.string().max(250)).min(1).max(6),
      rows: z.array(z.array(z.string().max(1500)).min(1).max(6)).max(30),
    })
    .strict(),
]);
export type JournalBlock = z.infer<typeof block>;
export const articleDocument = z
  .object({
    title: z.string().min(1).max(180),
    subtitle: z.string().max(300).default(""),
    slug,
    excerpt: z.string().max(500).default(""),
    sport,
    teamIds: z.array(z.string().min(1).max(200)).max(20).default([]),
    categoryIds: z.array(z.string().max(100)).max(8).default([]),
    tags: z.array(z.string().max(60)).max(20).default([]),
    authorId: z.string().max(200).nullable().default(null),
    reviewerId: z.string().max(200).nullable().default(null),
    body: z.array(block).max(150).default([]),
    heroId: z.uuid().nullable().default(null),
    heroAlt: z.string().max(500).default(""),
    sources: z
      .array(
        z
          .object({
            title: z.string().min(1).max(300),
            url: safeLink,
            checkedOn: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .nullable(),
          })
          .strict(),
      )
      .max(30)
      .default([]),
    related: z
      .array(
        z
          .object({
            kind: z.enum(["team", "coach", "event", "service"]),
            id: z.string().min(1).max(200),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    // Athletes never enter public projections by database join. Each appearance requires separate exact-version consent.
    athleteIds: z.array(z.string().min(1).max(200)).max(20).default([]),
    containsMinorIdentity: z.boolean().default(false),
    rightsConfirmed: z.boolean().default(false),
    factsVerified: z.boolean().default(false),
    seoTitle: z.string().max(180).default(""),
    seoDescription: z.string().max(300).default(""),
    canonical: z
      .string()
      .max(2000)
      .refine((v) => !v || /^https:\/\/prospectssports\.club\/articles\/[a-z0-9-]+$/.test(v))
      .default(""),
    noindex: z.boolean().default(false),
    news: z.boolean().default(false),
    featured: z
      .object({
        homepage: z.boolean(),
        newsroom: z.boolean(),
        category: z.boolean(),
        priority: z.number().int().min(0).max(100),
        expiresAt: z.iso.datetime().nullable(),
      })
      .default({ homepage: false, newsroom: false, category: false, priority: 0, expiresAt: null }),
    series: z.string().max(150).default(""),
    targetDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
    priority: z.enum(["high", "normal", "low"]).default("normal"),
    planningNotes: z.string().max(10000).default(""),
    seoTarget: z.string().max(300).default(""),
  })
  .strict()
  .refine(
    (d) => !d.heroId || Boolean(d.heroAlt.trim()),
    "Add descriptive alternative text for the hero image.",
  );
export type ArticleDocument = z.infer<typeof articleDocument>;
export const articleSave = z
  .object({ id: z.uuid().optional(), revision: z.number().int().min(0), document: articleDocument })
  .strict();
export const articleAction = z
  .object({
    id: z.uuid(),
    revision: z.number().int().min(1),
    action: z.enum([
      "submit",
      "return",
      "approve",
      "publish",
      "schedule",
      "unpublish",
      "archive",
      "restore",
    ]),
    scheduledAt: z.iso.datetime().optional(),
    restoreRevision: z.number().int().positive().optional(),
    note: z.string().max(2000).default(""),
  })
  .strict();
export type ArticleRow = {
  id: string;
  revision: number;
  status: "draft" | "pending" | "approved" | "scheduled" | "published" | "archived";
  document: ArticleDocument;
  created_by: string | null;
  approved_revision: number | null;
  approved_by: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  updated_at: string;
};
export type PublicArticle = {
  id: string;
  revision: number;
  document: Omit<
    ArticleDocument,
    | "athleteIds"
    | "containsMinorIdentity"
    | "rightsConfirmed"
    | "factsVerified"
    | "planningNotes"
    | "seoTarget"
    | "targetDate"
    | "priority"
    | "authorId"
    | "reviewerId"
  >;
  author: { id: string; name: string; href: string } | null;
  reviewer: { id: string; name: string; href: string } | null;
  publishedAt: string;
  updatedAt: string;
  readingMinutes: number;
};
export function blankArticle(title = "Untitled article"): ArticleDocument {
  return articleDocument.parse({
    title,
    slug: title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    sport: "academy",
  });
}
export function documentText(d: ArticleDocument) {
  return [
    d.title,
    d.subtitle,
    d.excerpt,
    ...d.body.map((b) =>
      "text" in b
        ? b.text
        : b.type === "list"
          ? b.items.join(" ")
          : b.type === "table"
            ? b.rows.flat().join(" ")
            : "",
    ),
  ].join(" ");
}
export function mediaIds(d: ArticleDocument) {
  return [
    ...new Set(
      [d.heroId, ...d.body.filter((b) => b.type === "image").map((b) => b.mediaId)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
}
