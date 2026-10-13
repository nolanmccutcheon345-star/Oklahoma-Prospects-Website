import { z } from "zod";
import { getSql, type Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import { trainingDrills } from "./training-catalog";
import { developmentPrograms } from "./development-programs";
export const curriculumDecision = z
  .object({
    kind: z.enum(["drill", "program"]),
    id: z.string().min(1).max(150),
    version: z.string().min(1).max(150),
    revision: z.number().int().min(0),
    status: z.enum(["review-required", "approved", "retired"]),
    recommended: z.boolean(),
    reason: z.string().trim().min(10).max(2000),
    qualifiedReview: z.literal(true),
  })
  .strict();
export type CurriculumControl = {
  kind: "drill" | "program";
  content_id: string;
  content_version: string;
  status: "review-required" | "approved" | "retired";
  recommended: boolean;
  reviewed_by: string;
  reviewed_at: Date;
  review_note: string;
  revision: number;
};
export async function curriculumControls(sql: Sql) {
  return sql<CurriculumControl>`select * from pd_curriculum_controls`;
}
export async function availablePrograms(sql: Sql) {
  const controls = await curriculumControls(sql);
  return developmentPrograms.filter(
    (p) =>
      !controls.some(
        (c) => c.kind === "program" && c.content_id === p.id && c.status === "retired",
      ),
  );
}
export async function reviewCurriculumForUser(
  userId: string,
  raw: z.infer<typeof curriculumDecision>,
) {
  const input = curriculumDecision.parse(raw),
    sql = await getSql(),
    me = await resolveIdentity(sql, userId);
  if (me.role !== "admin") throw new Error("Academy curriculum review requires an admin.");
  const content = (input.kind === "drill" ? trainingDrills : developmentPrograms).find(
    (c) => c.id === input.id,
  );
  if (!content || content.version !== input.version)
    throw new Error("Content changed. Reload and review the current version.");
  if (input.recommended && input.status !== "approved")
    throw new Error("Only approved content can be academy recommended.");
  return sql.transaction(async (tx) => {
    await tx`select set_config('app.actor_id',${userId},true)`;
    // Serialize decisions even when the first control row has not been created yet.
    await tx`select pg_advisory_xact_lock(hashtext(${input.kind + ":" + input.id}))`;
    const [prior] =
      await tx<CurriculumControl>`select * from pd_curriculum_controls where kind=${input.kind} and content_id=${input.id}`;
    if ((prior?.revision || 0) !== input.revision)
      throw new Error("Another reviewer changed this decision. Reload before reviewing again.");
    await tx`insert into pd_curriculum_controls(kind,content_id,content_version,status,recommended,reviewed_by,review_note)
      values(${input.kind},${input.id},${input.version},${input.status},${input.recommended},${userId},${input.reason})
      on conflict(kind,content_id) do update set content_version=excluded.content_version,status=excluded.status,recommended=excluded.recommended,reviewed_by=excluded.reviewed_by,review_note=excluded.review_note,reviewed_at=now(),revision=pd_curriculum_controls.revision+1`;
    return { ok: true };
  });
}
