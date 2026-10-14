import type { Sql } from "../db";
import { owner } from "./store.server";
export async function shopImageResponse(sql: Sql, id: string, userId: string | null) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!/^[a-f0-9-]{36}$/.test(id))
    return new Response("Image unavailable", { status: 404, headers });
  const [image] = await sql<{
    png_base64: string;
    published: boolean;
    sample_approved: boolean;
    archived: boolean;
    image_approved: boolean;
  }>`select i.png_base64,p.published,p.sample_approved,p.archived,p.image_approved from shop_images i join shop_products p on p.id=i.product_id where i.id=${id} and exists(select 1 from jsonb_array_elements(p.gallery) g where g->>'id'=i.id)`;
  if (!image) return new Response("Image unavailable", { status: 404, headers });
  if (!image.published || !image.sample_approved || !image.image_approved || image.archived) {
    try {
      if (!userId) throw new Error("Not signed in");
      await owner(sql, userId);
    } catch {
      return new Response("Image unavailable", { status: 404, headers });
    }
  }
  return new Response(Buffer.from(image.png_base64, "base64"), {
    headers: { ...headers, "Content-Type": "image/png" },
  });
}
