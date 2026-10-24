import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import type { Sql } from "../db";
import {
  secured,
  can,
  lockedArticle,
  JournalDenied,
  record,
  consentValid,
} from "./editorial.server";
import { mediaIds, type ArticleDocument } from "./contracts";
export const uploadInput = z
  .object({
    articleId: z.uuid(),
    revision: z.number().int().positive(),
    dataUrl: z.string().max(5600000),
    credit: z.string().min(1).max(300),
    rightsNote: z.string().min(5).max(2000),
  })
  .strict();
export async function uploadFor(sql: Sql, actor: string, value: unknown) {
  const v = uploadInput.parse(value);
  return secured(sql, actor, async (tx, p) => {
    const row = await lockedArticle(tx, v.articleId, v.revision);
    if (
      !can(p, "edit.all", row.document, row.created_by) &&
      !can(p, "edit.own", row.document, row.created_by)
    )
      throw new JournalDenied();
    const [count] = await tx<{
      n: string;
    }>`select count(*)::text n from journal_media where article_id=${v.articleId}`;
    if (Number(count.n) >= 30)
      throw new Error("An article can contain at most 30 uploaded images.");
    const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(v.dataUrl);
    if (!match) throw new Error("Upload a PNG, JPEG or WebP image.");
    const bytes = Buffer.from(match[1], "base64");
    if (bytes.length > 4 * 1024 * 1024) throw new Error("Images must be smaller than 4 MB.");
    const image = sharp(bytes, { limitInputPixels: 20000000, animated: false, failOn: "warning" });
    const meta = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(meta.format || "") || (meta.pages || 1) > 1)
      throw new Error("Use a single-frame raster image.");
    const { data, info } = await image
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > 1024 * 1024)
      throw new Error("Optimized image exceeds 1 MB; use a smaller image.");
    const id = randomUUID();
    await tx`insert into journal_media(id,article_id,uploaded_by,webp_base64,width,height,credit,rights_note) values(${id},${v.articleId},${actor},${data.toString("base64")},${info.width},${info.height},${v.credit},${v.rightsNote})`;
    await record(tx, actor, v.articleId, "media-upload", { mediaId: id });
    return { id, width: info.width, height: info.height };
  });
}
export async function mediaResponse(sql: Sql, id: string, actor: string | null) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
    "X-Robots-Tag": "noindex",
  };
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404, headers });
  const [m] = await sql<{
    article_id: string;
    webp_base64: string;
  }>`select article_id::text,webp_base64 from journal_media where id=${id}`;
  if (!m) return new Response("Not found", { status: 404, headers });
  const [pub] = await sql<{
    revision: number;
    document: ArticleDocument;
  }>`select revision,document from journal_publications where article_id=${m.article_id} and visible`;
  let allowed = Boolean(
    pub &&
    mediaIds(pub.document).includes(id) &&
    (await consentValid(sql, m.article_id, pub.revision, pub.document)),
  );
  if (!allowed && actor) {
    try {
      allowed = await secured(sql, actor, async (tx, p) => {
        const a = await lockedArticle(tx, m.article_id);
        return can(p, "view", a.document, a.created_by);
      });
    } catch {
      allowed = false;
    }
  }
  if (!allowed) return new Response("Not found", { status: 404, headers });
  return new Response(new Uint8Array(Buffer.from(m.webp_base64, "base64")), {
    headers: { ...headers, "Content-Type": "image/webp" },
  });
}
