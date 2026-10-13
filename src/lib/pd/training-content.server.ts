import { isDeepStrictEqual } from "node:util";
import { getSql, type Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import { drillSubmission, type DrillSubmission } from "./training-content";
import { trainingDrills, type TrainingDrill } from "./training-catalog";
import { curriculumControls } from "./curriculum-controls.server";
import { developmentPrograms } from "./development-programs";
type ContentVersion = {
  id: string;
  author_id: string;
  status: "draft" | "approved" | "retired";
  document: TrainingDrill;
  review_note: string | null;
};
export async function approvedDrills(sql: Sql) {
  const rows =
    await sql<ContentVersion>`select * from pd_curriculum_versions where status='approved' order by created_at desc`;
  const controls = await curriculumControls(sql);
  return [
    ...trainingDrills
      .filter(
        (d) =>
          !controls.some(
            (c) => c.kind === "drill" && c.content_id === d.id && c.status === "retired",
          ),
      )
      .map((d) => {
        const review = controls.find(
          (c) =>
            c.kind === "drill" &&
            c.content_id === d.id &&
            c.content_version === d.version &&
            c.status === "approved",
        );
        return {
          ...d,
          lastQualifiedReviewAt: review ? new Date(review.reviewed_at).toISOString() : null,
        };
      }),
    ...rows.map((r) => r.document),
  ];
}
export async function contentForUser(userId: string) {
  const sql = await getSql(),
    me = await resolveIdentity(sql, userId),
    canSubmit = me.role === "admin" || me.role === "coach" || me.canInstruct;
  const submissions = canSubmit
    ? await sql<ContentVersion>`select * from pd_curriculum_versions where author_id=${userId} or ${me.role === "admin"} order by created_at desc`
    : [];
  return {
    drills: await approvedDrills(sql),
    submissions,
    canSubmit,
    canApprove: me.role === "admin",
    builtins:
      me.role === "admin"
        ? {
            drills: trainingDrills,
            programs: developmentPrograms,
            controls: await curriculumControls(sql),
          }
        : null,
  };
}
export async function submitDrillForUser(userId: string, raw: DrillSubmission) {
  const input = drillSubmission.parse(raw),
    sql = await getSql(),
    me = await resolveIdentity(sql, userId);
  if (me.role !== "admin" && me.role !== "coach" && !me.canInstruct)
    throw new Error("Instructor access required.");
  return sql.transaction(async (tx) => {
    await tx`select set_config('app.actor_id',${userId},true)`;
    const [existing] =
      await tx<ContentVersion>`select * from pd_curriculum_versions where id=${input.id}`;
    if (existing) {
      if (existing.author_id !== userId) throw new Error("Version ID unavailable.");
      if (
        Object.keys(input)
          .filter((k) => k !== "id")
          .some(
            (k) =>
              !isDeepStrictEqual(
                existing.document[k as keyof TrainingDrill],
                input[k as keyof DrillSubmission],
              ),
          )
      )
        throw new Error("Version already submitted with different content. Create a new version.");
      return { id: existing.id };
    }
    if (input.parentId) {
      const [parent] =
        await tx<ContentVersion>`select * from pd_curriculum_versions where id=${input.parentId} and (author_id=${userId} or status='approved' or ${me.role === "admin"})`;
      if (!parent) throw new Error("Source version unavailable.");
    }
    const document: TrainingDrill = {
      ...input,
      id: `custom:${input.id}`,
      version: input.id,
      review: "qualified coach review required",
    };
    await tx`insert into pd_curriculum_versions(id,parent_id,author_id,document) values(${input.id},${input.parentId || null},${userId},${JSON.stringify(document)}::jsonb)`;
    return { id: input.id };
  });
}
export async function reviewDrillForUser(
  userId: string,
  input: { id: string; status: "approved" | "retired"; reason: string },
) {
  const sql = await getSql(),
    me = await resolveIdentity(sql, userId);
  if (me.role !== "admin") throw new Error("Academy curriculum review requires an admin.");
  return sql.transaction(async (tx) => {
    await tx`select set_config('app.actor_id',${userId},true)`;
    const rows =
      await tx`update pd_curriculum_versions set status=${input.status},reviewed_by=${userId},review_note=${input.reason} where id=${input.id} returning id`;
    if (!rows.length) throw new Error("Content version unavailable.");
    return { ok: true };
  });
}
