import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "../db";
import { operationalAuthMiddleware } from "../auth/middleware";
import { articleSave, articleAction } from "./contracts";
export const getJournalEditor = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) =>
    (await import("./editorial.server")).editorFor(await getSql(), context.userId),
  );
export const getArticleEditor = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .validator(z.object({ id: z.uuid() }).strict())
  .handler(async ({ context, data }) =>
    (await import("./editorial.server")).detailFor(await getSql(), context.userId, data.id),
  );
export const saveArticle = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(articleSave)
  .handler(async ({ context, data }) =>
    (await import("./editorial.server")).saveArticleFor(await getSql(), context.userId, data),
  );
export const actOnArticle = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(articleAction)
  .handler(async ({ context, data }) =>
    (await import("./editorial.server")).actionFor(await getSql(), context.userId, data),
  );
export const saveEditorialGrant = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(z.unknown())
  .handler(async ({ context, data }) =>
    (await import("./editorial.server")).grantFor(await getSql(), context.userId, data),
  );
export const saveJournalCategory = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(z.unknown())
  .handler(async ({ context, data }) =>
    (await import("./editorial.server")).categoryFor(await getSql(), context.userId, data),
  );
export const saveJournalConsent = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(z.unknown())
  .handler(async ({ context, data }) =>
    (await import("./editorial.server")).consentFor(await getSql(), context.userId, data),
  );
export const withdrawJournalConsent = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(z.object({ id: z.uuid() }).strict())
  .handler(async ({ context, data }) =>
    (await import("./editorial.server")).withdrawConsentFor(
      await getSql(),
      context.userId,
      data.id,
    ),
  );
export const getFamilyJournalConsents = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) =>
    (await import("./editorial.server")).familyConsentsFor(await getSql(), context.userId),
  );
export const uploadJournalImage = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(z.unknown())
  .handler(async ({ context, data }) => {
    await (await import("../commerce/checkout.server")).rateLimit("journal-image", 20);
    return (await import("./media.server")).uploadFor(await getSql(), context.userId, data);
  });
export const getJournalFeed = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        q: z.string().max(200).optional(),
        category: z.string().max(100).optional(),
        sport: z.enum(["baseball", "softball", "academy"]).optional(),
        page: z.number().int().min(1).max(10000).optional(),
        author: z.string().max(200).optional(),
        team: z.string().max(200).optional(),
        featured: z.boolean().optional(),
      })
      .strict(),
  )
  .handler(async ({ data }) =>
    (await import("./public.server")).publicFeedFor(await getSql(), data),
  );
export const getPublicArticle = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().max(160) }).strict())
  .handler(async ({ data }) =>
    (await import("./public.server")).publicArticleFor(await getSql(), data.slug),
  );
export const getHomepageJournal = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return {
      feed: await (
        await import("./public.server")
      ).publicFeedFor(await getSql(), { featured: true }),
      failed: false,
    };
  } catch {
    return { feed: null, failed: true };
  }
});
export const recordJournalMetric = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.uuid(), event: z.enum(["view", "cta"]) }).strict())
  .handler(async ({ data }) => {
    const { assertSameSiteRequest } = await import("../auth/isolation.server");
    assertSameSiteRequest();
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    if (request.headers.get("DNT") === "1" || request.headers.get("Sec-GPC") === "1") return false;
    await (await import("../commerce/checkout.server")).rateLimit("journal-metric", 60);
    return (await import("./public.server")).recordMetricFor(await getSql(), data.id, data.event);
  });
export const setJournalMetrics = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(z.object({ enabled: z.boolean(), revision: z.number().int().positive() }).strict())
  .handler(async ({ context, data }) => {
    const { secured, record, JournalDenied } = await import("./editorial.server");
    return secured(await getSql(), context.userId, async (tx, p) => {
      if (!p.owner) throw new JournalDenied();
      const rows =
        await tx`update journal_settings set metrics_enabled=${data.enabled},revision=revision+1 where id=true and revision=${data.revision} returning revision`;
      if (!rows.length) throw new Error("Settings changed. Reload first.");
      await record(tx, p.id, null, "metrics-setting", { enabled: data.enabled });
      return true;
    });
  });
export const importJournalAssignments = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) =>
    (await import("./launch.server")).importAssignmentsFor(await getSql(), context.userId),
  );
