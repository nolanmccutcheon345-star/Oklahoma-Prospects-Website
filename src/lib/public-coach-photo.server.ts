import { createHash } from "node:crypto";
import type { PublicPerson } from "./person-contracts";
const raster = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
export function publicPhotoVersion(photo: string) {
  return createHash("sha256").update(photo).digest("hex").slice(0, 24);
}
export function publicPhotoLink(person: PublicPerson) {
  if (!raster.test(person.photo) || person.photo.length > 250000)
    return person.photo.startsWith("data:") ? "" : person.photo;
  return `/api/public-coach-photo/${encodeURIComponent(person.id)}?v=${publicPhotoVersion(person.photo)}`;
}
export async function publicCoachPhotoResponse(
  request: Request,
  id: string,
  load: () => Promise<PublicPerson[]>,
) {
  const missing = () =>
    new Response("Photo unavailable", {
      status: 404,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id)) return missing();
  // Recheck current publication on every request, including conditional requests.
  const person = (await load()).find((p) => p.id === id);
  if (!person || person.photo.length > 250000) return missing();
  const match = person.photo.match(raster);
  if (!match) return missing();
  const version = publicPhotoVersion(person.photo);
  if (new URL(request.url).searchParams.get("v") !== version) return missing();
  const headers = {
    "Content-Type": `image/${match[1]}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=0, must-revalidate",
    ETag: `"${version}"`,
  };
  if (request.headers.get("if-none-match") === headers.ETag)
    return new Response(null, { status: 304, headers });
  return new Response(Buffer.from(match[2], "base64"), { headers });
}
