import type { z } from "zod";
import type { Sql } from "../db";
import { authority, secured, audit } from "./access.server";
import { backupReviewInput } from "./privacy-contracts";
type Env = Record<string, string | undefined>;
type BackupReview = {
  id: string;
  reference: string;
  snapshotAt: string;
  expiresAt: string;
  recoveryEvidence: string;
  reviewedAt: string;
};
async function latestReview(sql: Sql) {
  const [review] =
    await sql<BackupReview>`select id::text,reference,snapshot_at::text "snapshotAt",expires_at::text "expiresAt",recovery_evidence "recoveryEvidence",reviewed_at::text "reviewedAt" from coordinator_backup_reviews order by snapshot_at desc,reviewed_at desc limit 1`;
  return review || null;
}
function reviewDue(review: BackupReview | null) {
  return (
    !review ||
    Date.parse(review.expiresAt) <= Date.now() ||
    Date.parse(review.snapshotAt) < Date.now() - 7 * 86400000
  );
}
/** Netlify takes the copies outside the application. This worker checks review freshness,
 * never creates a backup, accesses provider credentials or claims a successful restore. */
export async function archiveStaffActivity(sql: Sql, env: Env) {
  if (
    env.CONTEXT !== "production" ||
    (env.SQUARE_DEPLOY_CONTEXT && env.SQUARE_DEPLOY_CONTEXT !== "production")
  )
    return { configured: false, archived: 0, skipped: true, mode: "provider-backups" };
  const review = await latestReview(sql);
  const due = reviewDue(review);
  if (due) await recordArchiveProblem(sql);
  return { configured: !!review, archived: 0, reviewDue: due, mode: "provider-backups" };
}
export async function archiveStatus(sql: Sql, actor: string) {
  return secured(sql, actor, "staff.archive.status", async (tx) => {
    await authority(tx, actor, "staff_activity.read");
    const review = await latestReview(tx);
    await audit(tx, actor, "staff.archive.status", "provider-backups", "allowed");
    return { mode: "provider-backups" as const, review, reviewDue: reviewDue(review) };
  });
}
export async function recordBackupReview(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof backupReviewInput>,
) {
  const v = backupReviewInput.parse(raw);
  const snapshot = Date.parse(v.snapshotAt),
    expires = Date.parse(v.expiresAt);
  if (snapshot > Date.now() || expires <= Date.now() || expires <= snapshot)
    throw Error("Record an existing, unexpired backup with a valid expiry date.");
  return secured(sql, actor, "staff.backup.review", async (tx) => {
    await authority(tx, actor, "staff_activity.read");
    const [old] = await tx<{
      same: boolean;
    }>`select actor_id=${actor} and reference=${v.reference} and snapshot_at=${v.snapshotAt}::timestamptz and expires_at=${v.expiresAt}::timestamptz and recovery_evidence=${v.recoveryEvidence} same from coordinator_backup_reviews where id=${v.id}`;
    if (old) {
      if (!old.same) throw Error("Review ID already used.");
      return { ok: true };
    }
    await tx`insert into coordinator_backup_reviews(id,actor_id,reference,snapshot_at,expires_at,recovery_evidence) values(${v.id},${actor},${v.reference},${v.snapshotAt},${v.expiresAt},${v.recoveryEvidence})`;
    await audit(tx, actor, "staff.backup.review", v.id, "allowed", { snapshotAt: v.snapshotAt });
    return { ok: true };
  });
}

/** A storage failure must still reach owners instead of preventing the alert worker from flushing. */
export async function recordArchiveProblem(sql: Sql) {
  return sql.transaction(async (tx) => {
    const id = "provider-backup-review:" + new Date().toISOString().slice(0, 10);
    const added =
      await tx`insert into coordinator_risk_alerts(id,code,priority,actor_id,observed_count,window_hours) values(${id},'provider-backup-review-due','review','',1,24) on conflict do nothing returning id`;
    if (!added.length) return;
    const recipients = await tx<{
      email: string;
    }>`select g.email from owner_grants g join "user" u on u.id=g.user_id join staff_authorities a on a.email=g.email where g.revoked_at is null and g.email=lower(trim(u.email)) and u."emailVerified" and u."disabledAt" is null and a.capability='staff_activity.read'`;
    for (const r of recipients)
      await tx`insert into site_alert_deliveries(id,recipient,audience,subject,body) values(${id + ":" + r.email},${r.email},'coordinator-owners','Prospects — database backup review is due','The last owner-reviewed provider backup is missing, expired or more than seven days old. This does not mean Netlify backups have failed. Check the Netlify Database dashboard and record current evidence in Privacy & Audit Protection. https://prospectssports.club/office') on conflict do nothing`;
  });
}
