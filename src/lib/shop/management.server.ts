import { randomUUID } from "node:crypto";
import { inflateSync } from "node:zlib";
import type { Sql } from "../db";
import { owner } from "./store.server";
import { priceVariant, type PricingMode } from "./pricing";
import type { ShopProduct, ShopImage } from "./contracts";
import { shopNavigationSchema, collectionIdsSchema, type ShopNavigation } from "./collections";
import {
  printifyClient,
  shopPath,
  parsePrintifyProduct,
  type PrintifyRequest,
} from "./printify.server";

export type ShopSettings = {
  default_markup_bps: number;
  revision: number;
  navigation: ShopNavigation;
};
export async function settings(sql: Sql) {
  return (await sql<ShopSettings>`select * from shop_settings where id=1`)[0];
}
async function audit(
  sql: Sql,
  userId: string,
  action: string,
  productId: string | null,
  detail: unknown = {},
) {
  await sql`insert into shop_changes(actor,action,product_id,detail) values(${userId},${action},${productId},${JSON.stringify(detail)}::jsonb)`;
}
export async function createDraft(sql: Sql, userId: string, title: string) {
  await owner(sql, userId);
  const id = "draft-" + randomUUID();
  await sql.transaction(async (tx) => {
    await tx`insert into shop_products(id,title,image_url,variants,updated_by,provider,pricing_mode,image_approved) values(${id},${title},'','[]',${userId},'fulfill-engine','default',false)`;
    await audit(tx, userId, "create-draft", id);
  });
  return id;
}
export async function syncPrintifyProduct(
  sql: Sql,
  userId: string,
  id: string,
  targetId?: string,
  request?: PrintifyRequest,
  base?: string,
) {
  await owner(sql, userId);
  const p = parsePrintifyProduct(
    await (request || printifyClient())(
      (base || shopPath()) + "/products/" + encodeURIComponent(id) + ".json",
    ),
  );
  if (p.id !== id) throw new Error("Supplier product identity mismatch.");
  return sql.transaction(async (tx) => {
    const [s] = await tx<ShopSettings>`select * from shop_settings where id=1 for update`;
    const [existing] =
      await tx<ShopProduct>`select * from shop_products where provider='printify' and provider_product_id=${id} for update`;
    if (targetId && existing && existing.id !== targetId)
      throw new Error("That Printify product is already linked to another shop product.");
    const [target] = targetId
      ? await tx<ShopProduct>`select * from shop_products where id=${targetId} for update`
      : [];
    if (targetId && (!target || target.provider !== "printify"))
      throw new Error("Choose a current Printify draft.");
    const current = target || existing,
      key = current?.id || "printify-" + id;
    const mode = current?.pricing_mode || "default",
      bps = current?.pricing_bps ?? 9000;
    const variants = p.variants.map((v) => {
      const old = current?.variants.find((o) => o.id === v.id);
      const next = {
        ...v,
        costOverrideCents: old?.costOverrideCents ?? null,
        priceOverrideCents: old?.priceOverrideCents ?? null,
        sellEnabled: old?.sellEnabled ?? true,
      };
      if (mode === "fixed" && old) next.priceCents = old.priceCents;
      return { ...next, priceCents: priceVariant(next, mode, bps, s.default_markup_bps) };
    });
    const unchanged = Boolean(current?.manufacturing_hash && current.manufacturing_hash === p.hash);
    if (current)
      await tx`update shop_products set provider_product_id=${id},variants=${JSON.stringify(variants)}::jsonb,manufacturing_hash=${p.hash},published=${unchanged && current.published && !current.archived},sample_approved=${unchanged && current.sample_approved},revision=revision+1,updated_by=${userId},updated_at=now() where id=${key}`;
    else
      await tx`insert into shop_products(id,title,description,image_url,variants,provider,provider_product_id,pricing_mode,pricing_bps,manufacturing_hash,image_approved,updated_by) values(${key},${p.title},${p.description},${p.image},${JSON.stringify(variants)}::jsonb,'printify',${id},'default',9000,${p.hash},false,${userId})`;
    await audit(tx, userId, "sync-printify", key, {
      manufacturingChanged: !unchanged,
      variantCount: variants.length,
    });
    return key;
  });
}
export type ManagedProductInput = {
  id: string;
  revision: number;
  title?: string;
  preparationNotes?: string;
  description: string;
  sizeGuide: string;
  teamLabel: string;
  category: string;
  taxCode: string;
  sampleApproved: boolean;
  published: boolean;
  comingSoon?: boolean;
  shopStatus?: "draft" | "coming-soon" | "for-sale";
  collectionIds?: string[];
  pricingMode?: PricingMode;
  pricingBps?: number;
  variants?: {
    id: number;
    costOverrideCents: number | null;
    priceOverrideCents: number | null;
    sellEnabled: boolean;
  }[];
};
export async function saveManagedProduct(sql: Sql, userId: string, input: ManagedProductInput) {
  await owner(sql, userId);
  await sql.transaction(async (tx) => {
    const [s] = await tx<ShopSettings>`select * from shop_settings where id=1 for update`;
    const [p] = await tx<ShopProduct>`select * from shop_products where id=${input.id} for update`;
    if (!p || p.revision !== input.revision)
      throw new Error("Product changed. Reload before saving.");
    // One explicit status wins. Older editors also publish when Coming soon is selected.
    const comingSoon = input.shopStatus
      ? input.shopStatus === "coming-soon"
      : (input.comingSoon ?? p.coming_soon ?? false);
    const published = input.shopStatus
      ? input.shopStatus !== "draft"
      : input.published || input.comingSoon === true;
    const collectionIds = collectionIdsSchema.parse(input.collectionIds ?? p.collection_ids ?? []);
    const validIds = new Set(s.navigation.flatMap((g) => g.options.map((o) => o.id)));
    // Removed labels do not alter a product; unknown new assignments are rejected.
    if (collectionIds.some((id) => !validIds.has(id) && !p.collection_ids?.includes(id)))
      throw new Error("Shop collections changed. Reload before saving.");
    if (published && comingSoon && (p.archived || !p.image_approved || !p.image_url))
      throw new Error("Add an approved product photo before showing a coming-soon product.");
    const mode = input.pricingMode || p.pricing_mode,
      bps = input.pricingBps ?? p.pricing_bps;
    if (
      input.variants &&
      (input.variants.length !== p.variants.length ||
        new Set(input.variants.map((v) => v.id)).size !== p.variants.length ||
        input.variants.some((v) => !p.variants.some((o) => o.id === v.id)))
    )
      throw new Error("Supplier variants changed. Re-sync the product.");
    const variants = p.variants.map((v) => {
      const edit = input.variants?.find((e) => e.id === v.id);
      const next = { ...v, ...edit };
      return { ...next, priceCents: priceVariant(next, mode, bps, s.default_markup_bps) };
    });
    if (
      published &&
      !comingSoon &&
      (p.archived ||
        !input.sampleApproved ||
        !input.description.trim() ||
        !input.sizeGuide.trim() ||
        !/^txcd_\d{8}$/.test(input.taxCode) ||
        !p.image_approved ||
        !p.image_url ||
        !p.provider_product_id ||
        !variants.some((v) => v.available && v.sellEnabled !== false))
    )
      throw new Error(
        "Approve the physical sample and studio photo, link supplier variants, and add a description, size guide and tax category before publishing.",
      );
    if (p.provider === "fulfill-engine" && published && !comingSoon)
      throw new Error((await import("./fulfill-engine.server")).FULFILL_ENGINE_LAUNCH_BLOCKER);
    const title = (input.title ?? p.title).trim();
    if (!title) throw new Error("Product title is required.");
    await tx`update shop_products set coming_soon=${comingSoon},collection_ids=${JSON.stringify(collectionIds)}::jsonb,preparation_notes=${input.preparationNotes ?? p.preparation_notes},title=${title},description=${input.description},size_guide=${input.sizeGuide},team_label=${input.teamLabel},category=${input.category},tax_code=${input.taxCode},sample_approved=${input.sampleApproved},published=${published},pricing_mode=${mode},pricing_bps=${bps},variants=${JSON.stringify(variants)}::jsonb,revision=revision+1,updated_by=${userId},updated_at=now() where id=${p.id}`;
    await audit(tx, userId, "edit-product", p.id, {
      pricingMode: mode,
      pricingBps: bps,
      published,
      comingSoon,
      collectionIds,
      prices: variants.map((v) => ({
        id: v.id,
        cents: v.priceCents,
        costOverrideCents: v.costOverrideCents ?? null,
      })),
    });
  });
}
export async function savePricingSettings(sql: Sql, userId: string, revision: number, bps: number) {
  await owner(sql, userId);
  await sql.transaction(async (tx) => {
    const [s] = await tx<ShopSettings>`select * from shop_settings where id=1 for update`;
    if (s.revision !== revision) throw new Error("Pricing settings changed. Reload before saving.");
    const products =
      await tx<ShopProduct>`select * from shop_products where pricing_mode='default' order by id for update`;
    for (const p of products) {
      const variants = p.variants.map((v) => ({
        ...v,
        priceCents: priceVariant(v, "default", p.pricing_bps, bps),
      }));
      await tx`update shop_products set variants=${JSON.stringify(variants)}::jsonb,revision=revision+1,updated_by=${userId},updated_at=now() where id=${p.id}`;
    }
    await tx`update shop_settings set default_markup_bps=${bps},revision=revision+1,updated_by=${userId},updated_at=now() where id=1`;
    await audit(tx, userId, "store-pricing", null, {
      defaultMarkupBps: bps,
      products: products.length,
    });
  });
}
export async function archiveProduct(
  sql: Sql,
  userId: string,
  id: string,
  revision: number,
  archived: boolean,
) {
  await owner(sql, userId);
  await sql.transaction(async (tx) => {
    const r =
      await tx`update shop_products set archived=${archived},published=false,revision=revision+1,updated_by=${userId},updated_at=now() where id=${id} and revision=${revision} returning id`;
    if (!r.length) throw new Error("Product changed. Reload before saving.");
    await audit(tx, userId, archived ? "archive" : "restore", id);
  });
}
export function validateStudioPng(data: string) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length > 2800000)
    throw new Error("Use a studio PNG under 2 MB.");
  const content = data.slice(data.indexOf(",") + 1),
    bytes = Buffer.from(content, "base64");
  if (
    bytes.length < 33 ||
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    bytes.toString("ascii", 12, 16) !== "IHDR" ||
    bytes.readUInt32BE(16) !== 1000 ||
    bytes.readUInt32BE(20) !== 1000
  )
    throw new Error("Prepare the photo in the shop studio before uploading.");
  const crc = (chunk: Buffer) => {
    let c = 0xffffffff;
    for (const byte of chunk) {
      c ^= byte;
      for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const parts: Buffer[] = [];
  let offset = 8,
    ended = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset),
      end = offset + 12 + length;
    if (
      end > bytes.length ||
      crc(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)
    )
      throw new Error("The PNG is damaged. Prepare the photo again.");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") parts.push(bytes.subarray(offset + 8, end - 4));
    offset = end;
    if (type === "IEND") {
      ended = true;
      break;
    }
  }
  if (
    !ended ||
    offset !== bytes.length ||
    bytes[24] !== 8 ||
    ![2, 6].includes(bytes[25]) ||
    bytes[26] ||
    bytes[27] ||
    bytes[28]
  )
    throw new Error("Use the shop studio to prepare a standard PNG.");
  const stride = 1000 * (bytes[25] === 6 ? 4 : 3) + 1;
  const decoded = inflateSync(Buffer.concat(parts), { maxOutputLength: stride * 1000 });
  if (decoded.length !== stride * 1000) throw new Error("The PNG image data is incomplete.");
  for (let row = 0; row < 1000; row++)
    if (decoded[row * stride] > 4) throw new Error("The PNG image data is invalid.");
  return content;
}
export async function uploadStudioPhoto(
  sql: Sql,
  userId: string,
  input: { id: string; revision: number; data: string; alt: string; variantIds: number[] },
) {
  await owner(sql, userId);
  const content = validateStudioPng(input.data),
    id = randomUUID();
  await sql.transaction(async (tx) => {
    const [p] = await tx<ShopProduct>`select * from shop_products where id=${input.id} for update`;
    if (!p || p.revision !== input.revision)
      throw new Error("Product changed. Reload before saving.");
    if (p.gallery.length >= 8) throw new Error("Each product can have up to 8 photos.");
    if (input.variantIds.some((id) => !p.variants.some((v) => v.id === id)))
      throw new Error("Choose current variants for this photo.");
    const gallery: ShopImage[] = [
      ...p.gallery,
      { id, url: "/api/shop/images/" + id, alt: input.alt, variantIds: input.variantIds },
    ];
    await tx`insert into shop_images(id,product_id,png_base64,created_by) values(${id},${p.id},${content},${userId})`;
    await tx`update shop_products set gallery=${JSON.stringify(gallery)}::jsonb,image_url=${gallery[0].url},image_approved=true,revision=revision+1,updated_by=${userId},updated_at=now() where id=${p.id}`;
    await audit(tx, userId, "upload-studio-photo", p.id, { imageId: id });
  });
}
export async function editGallery(
  sql: Sql,
  userId: string,
  input: { id: string; revision: number; imageIds: string[] },
) {
  await owner(sql, userId);
  await sql.transaction(async (tx) => {
    const [p] = await tx<ShopProduct>`select * from shop_products where id=${input.id} for update`;
    if (!p || p.revision !== input.revision)
      throw new Error("Product changed. Reload before saving.");
    if (
      new Set(input.imageIds).size !== input.imageIds.length ||
      input.imageIds.some((id) => !p.gallery.some((i) => i.id === id))
    )
      throw new Error("Choose existing product photos.");
    const gallery = input.imageIds.map((id) => p.gallery.find((i) => i.id === id)!);
    await tx`update shop_products set gallery=${JSON.stringify(gallery)}::jsonb,image_url=${gallery[0]?.url || ""},image_approved=${Boolean(gallery.length)},published=${p.published && Boolean(gallery.length)},revision=revision+1,updated_by=${userId},updated_at=now() where id=${p.id}`;
    await audit(tx, userId, "edit-gallery", p.id, { imageIds: input.imageIds });
  });
}

export async function syncFulfillEngineProduct(
  sql: Sql,
  userId: string,
  id: string,
  targetId?: string,
  request?: import("./fulfill-engine.server").FulfillEngineRequest,
  campaign?: string,
) {
  await owner(sql, userId);
  const p = await (
    await import("./fulfill-engine.server")
  ).fetchFulfillEngineProduct(id, request, campaign);
  return sql.transaction(async (tx) => {
    const [s] = await tx<ShopSettings>`select * from shop_settings where id=1 for update`;
    const [existing] =
      await tx<ShopProduct>`select * from shop_products where provider='fulfill-engine' and provider_product_id=${id} for update`;
    if (targetId && existing && existing.id !== targetId)
      throw new Error("That supplier product is already linked to another listing.");
    const [target] = targetId
      ? await tx<ShopProduct>`select * from shop_products where id=${targetId} for update`
      : [];
    if (targetId && (!target || target.provider !== "fulfill-engine"))
      throw new Error("Choose a Fulfill Engine draft.");
    const current = target || existing,
      key = current?.id || "fe-" + randomUUID();
    const mode = current?.pricing_mode || "default",
      bps = current?.pricing_bps ?? 9000;
    const variants = p.variants.map((v) => {
      const old = current?.variants.find((o) => o.id === v.id);
      const next = {
        ...v,
        costOverrideCents: old?.costOverrideCents ?? null,
        priceOverrideCents: old?.priceOverrideCents ?? null,
        sellEnabled: old?.sellEnabled ?? true,
      };
      if (mode === "fixed" && old) next.priceCents = old.priceCents;
      return { ...next, priceCents: priceVariant(next, mode, bps, s.default_markup_bps) };
    });
    // A design ID can be edited remotely in place; every sync requires artwork/sample reapproval.
    if (current)
      await tx`update shop_products set provider_product_id=${id},variants=${JSON.stringify(variants)}::jsonb,manufacturing_hash=${p.hash},published=false,sample_approved=false,revision=revision+1,updated_by=${userId},updated_at=now() where id=${key}`;
    else
      await tx`insert into shop_products(id,title,description,image_url,variants,provider,provider_product_id,pricing_mode,manufacturing_hash,image_approved,updated_by) values(${key},${p.title},${p.description},'',${JSON.stringify(variants)}::jsonb,'fulfill-engine',${id},'default',${p.hash},false,${userId})`;
    await audit(tx, userId, "sync-fulfill-engine", key, {
      variantCount: variants.length,
      costsArePreliminary: true,
    });
    return key;
  });
}

export async function saveNavigation(
  sql: Sql,
  userId: string,
  revision: number,
  input: ShopNavigation,
) {
  await owner(sql, userId);
  const navigation = shopNavigationSchema.parse(input);
  await sql.transaction(async (tx) => {
    const [s] = await tx<ShopSettings>`select * from shop_settings where id=1 for update`;
    if (!s || s.revision !== revision)
      throw new Error("Shop settings changed. Reload before saving.");
    await tx`update shop_settings set navigation=${JSON.stringify(navigation)}::jsonb,revision=revision+1,updated_by=${userId},updated_at=now() where id=1`;
    await audit(tx, userId, "shop-navigation", null, { navigation });
  });
}
