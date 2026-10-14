import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { paymentAuth, optionalPaymentAuth } from "../commerce/payment-auth";
import { shopCheckoutSchema } from "./contracts";
export const getShop = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("../db");
  return (await import("./store.server")).publicShop(await getSql());
});
export const quoteShop = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(shopCheckoutSchema)
  .handler(async ({ data, context }) => {
    const { rateLimit } = await import("../commerce/checkout.server");
    await rateLimit("shop-quote", 15);
    const { getSql } = await import("../db");
    return (await import("./store.server")).createShopQuote(
      await getSql(),
      context.paymentUserId,
      data,
    );
  });
export const myShopOrders = createServerFn({ method: "GET" })
  .middleware([paymentAuth])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./store.server")).shopOrders(await getSql(), context.paymentUserId);
  });
export const getShopOffice = createServerFn({ method: "GET" })
  .middleware([paymentAuth])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    const sql = await getSql();
    const store = await import("./store.server");
    await store.owner(sql, context.paymentUserId);
    return {
      readiness: {
        vendor: Boolean(
          process.env.FULFILL_ENGINE_API_KEY && process.env.FULFILL_ENGINE_ACCOUNT_ID,
        ),
        campaign: Boolean(process.env.FULFILL_ENGINE_CAMPAIGN_ID),
        shipping: false,
        fulfillment: false,
        tax: store.shopReadiness().tax,
      },
      settings: await (await import("./management.server")).settings(sql),
      products: (
        await sql<import("./contracts").ShopProduct>`select * from shop_products order by title`
      ).map((p) => ({
        ...p,
        variants: p.variants.map((v) => ({
          id: v.id,
          label: v.label,
          priceCents: v.priceCents,
          available: v.available,
          vendorCostCents: v.vendorCostCents,
          costOverrideCents: v.costOverrideCents ?? null,
          priceOverrideCents: v.priceOverrideCents ?? null,
          sellEnabled: v.sellEnabled !== false,
        })),
      })),
      orders: await store.shopOrders(sql, context.paymentUserId, true),
    };
  });
export const syncShopProduct = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(
    z
      .object({
        id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
        targetId: z.string().max(80).optional(),
        provider: z.enum(["printify", "fulfill-engine"]).default("fulfill-engine"),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const management = await import("./management.server");
    return (
      data.provider === "printify"
        ? management.syncPrintifyProduct
        : management.syncFulfillEngineProduct
    )(await getSql(), context.paymentUserId, data.id, data.targetId);
  });
export const saveShopProduct = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(
    z
      .object({
        id: z.string().max(80),
        revision: z.number().int().positive(),
        description: z.string().max(5000),
        sizeGuide: z.string().max(5000),
        teamLabel: z.string().max(100),
        category: z.string().max(60),
        taxCode: z.string().max(30),
        sampleApproved: z.boolean(),
        published: z.boolean(),
        title: z.string().trim().min(1).max(200),
        preparationNotes: z.string().max(5000).optional(),
        pricingMode: z.enum(["default", "markup", "margin", "fixed"]),
        pricingBps: z.number().int().min(0).max(100000),
        variants: z
          .array(
            z
              .object({
                id: z.number().int().positive(),
                costOverrideCents: z.number().int().min(1).max(250000).nullable(),
                priceOverrideCents: z.number().int().min(1).max(250000).nullable(),
                sellEnabled: z.boolean(),
              })
              .strict(),
          )
          .max(500),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./store.server")).publishProduct(
      await getSql(),
      context.paymentUserId,
      data,
    );
  });

export const createShopDraft = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(z.object({ title: z.string().trim().min(1).max(200) }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./management.server")).createDraft(
      await getSql(),
      context.paymentUserId,
      data.title,
    );
  });
export const archiveShopProduct = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(
    z
      .object({
        id: z.string().max(80),
        revision: z.number().int().positive(),
        archived: z.boolean(),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./management.server")).archiveProduct(
      await getSql(),
      context.paymentUserId,
      data.id,
      data.revision,
      data.archived,
    );
  });
export const saveShopPricing = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(
    z
      .object({
        revision: z.number().int().positive(),
        markupBps: z.number().int().min(0).max(100000),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./management.server")).savePricingSettings(
      await getSql(),
      context.paymentUserId,
      data.revision,
      data.markupBps,
    );
  });
export const uploadShopPhoto = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(
    z
      .object({
        id: z.string().max(80),
        revision: z.number().int().positive(),
        data: z.string().max(2800000),
        alt: z.string().trim().min(1).max(200),
        variantIds: z.array(z.number().int().positive()).max(500),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { rateLimit } = await import("../commerce/checkout.server");
    await rateLimit("shop-image", 20);
    const { getSql } = await import("../db");
    return (await import("./management.server")).uploadStudioPhoto(
      await getSql(),
      context.paymentUserId,
      data,
    );
  });
export const saveShopGallery = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(
    z
      .object({
        id: z.string().max(80),
        revision: z.number().int().positive(),
        imageIds: z.array(z.string().uuid()).max(8),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./management.server")).editGallery(
      await getSql(),
      context.paymentUserId,
      data,
    );
  });
export const checkPrintifyConnection = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    await (await import("./store.server")).owner(await getSql(), context.paymentUserId);
    return (await import("./printify.server")).inspectPrintifyConnection();
  });
export const refreshShopOrders = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    const sql = await getSql();
    await (await import("./store.server")).owner(sql, context.paymentUserId);
    return (await import("./fulfillment.server")).processShopOrders(sql);
  });

export const canManageShop = createServerFn({ method: "GET" })
  .middleware([optionalPaymentAuth])
  .handler(async ({ context }) => {
    if (!context.verifiedUserId) return false;
    try {
      const { getSql } = await import("../db");
      await (await import("./store.server")).owner(await getSql(), context.verifiedUserId);
      return true;
    } catch {
      return false;
    }
  });

export const checkFulfillEngineConnection = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    await (await import("./store.server")).owner(await getSql(), context.paymentUserId);
    return (await import("./fulfill-engine.server")).inspectFulfillEngineConnection();
  });
export const searchFulfillEngineCatalog = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(z.object({ query: z.string().trim().min(2).max(100) }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    await (await import("./store.server")).owner(await getSql(), context.paymentUserId);
    await (await import("../commerce/checkout.server")).rateLimit("shop-catalog", 10);
    return (await import("./fulfill-engine.server")).browseFulfillEngineCatalog(data.query);
  });
