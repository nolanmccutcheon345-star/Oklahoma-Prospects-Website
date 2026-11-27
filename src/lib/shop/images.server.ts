import type { Sql } from "../db";
import { owner } from "./store.server";

const MAX_WIDTH = 1600;

export async function shopImageResponse(
  sql: Sql,
  id: string,
  userId: string | null,
  width?: number,
) {
  const privateHeaders = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (!/^[a-f0-9-]{36}$/.test(id))
    return new Response("Image unavailable", { status: 404, headers: privateHeaders });
  const [image] = await sql<{
    png_base64: string;
    published: boolean;
    coming_soon: boolean;
    sample_approved: boolean;
    archived: boolean;
    image_approved: boolean;
  }>`select i.png_base64,p.published,p.coming_soon,p.sample_approved,p.archived,p.image_approved from shop_images i join shop_products p on p.id=i.product_id where i.id=${id} and exists(select 1 from jsonb_array_elements(p.gallery) g where g->>'id'=i.id)`;
  if (!image) return new Response("Image unavailable", { status: 404, headers: privateHeaders });
  const isPublic =
    image.published &&
    (image.sample_approved || image.coming_soon) &&
    image.image_approved &&
    !image.archived;
  if (!isPublic) {
    try {
      if (!userId) throw new Error("Not signed in");
      await owner(sql, userId);
    } catch {
      return new Response("Image unavailable", { status: 404, headers: privateHeaders });
    }
  }
  const headers = isPublic
    ? {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      }
    : privateHeaders;
  let body: Buffer = Buffer.from(image.png_base64, "base64");
  const size =
    typeof width === "number" && Number.isFinite(width) ? Math.round(width) : undefined;
  if (size && size > 0) {
    const sharp = (await import("sharp")).default;
    body = await sharp(body)
      .resize({ width: Math.min(size, MAX_WIDTH), withoutEnlargement: true })
      .png()
      .toBuffer();
  }
  return new Response(new Uint8Array(body), {
    headers: { ...headers, "Content-Type": "image/png" },
  });
}
