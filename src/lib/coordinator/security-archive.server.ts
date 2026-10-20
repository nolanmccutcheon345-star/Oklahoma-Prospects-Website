import { createHash, randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import type { Sql } from "../db";
import { authority, secured, audit } from "./access.server";
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
const bodyOf = (v: unknown) => JSON.stringify(canonical(v));
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
type Env = Record<string, string | undefined>;
function config(env: Env) {
  const bucket = env.COORDINATOR_ARCHIVE_BUCKET,
    region = env.COORDINATOR_ARCHIVE_REGION,
    accessKeyId = env.COORDINATOR_ARCHIVE_ACCESS_KEY_ID,
    secretAccessKey = env.COORDINATOR_ARCHIVE_SECRET_ACCESS_KEY;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) || !/^[a-z]{2}-[a-z]+-\d$/.test(region))
    throw Error("Invalid protected archive configuration.");
  return {
    bucket,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      ...(env.COORDINATOR_ARCHIVE_SESSION_TOKEN
        ? { sessionToken: env.COORDINATOR_ARCHIVE_SESSION_TOKEN }
        : {}),
    },
  };
}
type Batch = {
  id: string;
  coordinator_through: string;
  staff_through: string;
  digest: string;
  previous_digest: string;
  bucket: string;
  region: string;
  object_key: string;
  retain_until: string;
  payload: Record<string, unknown>;
};
export type ArchiveTransport = {
  put: (input: {
    bucket: string;
    key: string;
    body: string;
    digest: string;
    retainUntil: Date;
  }) => Promise<void>;
  head: (input: {
    bucket: string;
    key: string;
  }) => Promise<{ versionId?: string; mode?: string; retainUntil?: Date; digest?: string }>;
};
function transport(c: NonNullable<ReturnType<typeof config>>): ArchiveTransport {
  const s3 = new S3Client({
    region: c.region,
    credentials: c.credentials,
    maxAttempts: 2,
    followRegionRedirects: false,
  });
  return {
    put: async (v) => {
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: v.bucket,
            Key: v.key,
            Body: v.body,
            ContentType: "application/json",
            ChecksumSHA256: createHash("sha256").update(v.body).digest("base64"),
            ServerSideEncryption: "AES256",
            IfNoneMatch: "*",
            ObjectLockMode: "COMPLIANCE",
            ObjectLockRetainUntilDate: v.retainUntil,
            Metadata: { sha256: v.digest },
          }),
          { abortSignal: AbortSignal.timeout(15000) },
        );
      } catch (e) {
        if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412)
          throw e;
      }
    },
    head: async (v) => {
      const r = await s3.send(
        new HeadObjectCommand({ Bucket: v.bucket, Key: v.key, ChecksumMode: "ENABLED" }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
      return {
        versionId: r.VersionId,
        mode: r.ObjectLockMode,
        retainUntil: r.ObjectLockRetainUntilDate,
        digest: r.ChecksumSHA256
          ? Buffer.from(r.ChecksumSHA256, "base64").toString("hex")
          : undefined,
      };
    },
  };
}
/** Only the authenticated production scheduler calls this. No client accepts destinations or credentials. */
export async function archiveStaffActivity(sql: Sql, env: Env, remote?: ArchiveTransport) {
  const c = config(env);
  if (!c) return { configured: false, archived: 0 };
  if (env.CONTEXT !== "production" || env.SQUARE_DEPLOY_CONTEXT !== "production")
    return { configured: true, archived: 0, skipped: true };
  const batch = await sql.transaction(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('coordinator-protected-archive'))`;
    const [pending] =
      await tx<Batch>`select b.* from coordinator_archive_batches b left join coordinator_archive_receipts r on r.batch_id=b.id where r.batch_id is null order by b.seq limit 1`;
    if (pending) return pending;
    const [policy] = await tx<{
      retention_days: number;
    }>`select p.retention_days from coordinator_privacy_policies p join "user" u on u.id=p.reviewer_id join owner_grants g on g.user_id=u.id and g.email=lower(trim(u.email)) and g.revoked_at is null join staff_authorities a on a.email=g.email and a.capability='staff_activity.read' where p.category='audit' and u."emailVerified" and u."disabledAt" is null`;
    if (!policy) return null;
    const [last] =
      await tx<Batch>`select * from coordinator_archive_batches order by seq desc limit 1`;
    const events = await tx<{
      id: string;
      actor_id: string;
      action: string;
      sport: string;
      team_id: string;
      target_id: string;
      result: string;
      correlation_id: string;
      created_at: string;
      actor_roles: unknown;
      details_digest: string;
    }>`select id::text,actor_id,action,sport,team_id,target_id,result,correlation_id::text,created_at::text,actor_roles,encode(sha256(convert_to(details::text,'UTF8')),'hex') details_digest from coordinator_audit a where not exists(select 1 from coordinator_archive_members m where m.stream='coordinator' and m.event_id=a.id) order by id limit 500`;
    const staff = await tx<{
      id: string;
      actor_id: string;
      action: string;
      target_table: string;
      target_id: string;
      correlation_id: string;
      created_at: string;
      actor_roles: unknown;
    }>`select id::text,actor_id,action,target_table,target_id,correlation_id::text,created_at::text,actor_roles from audit_events a where not exists(select 1 from coordinator_archive_members m where m.stream='staff' and m.event_id=a.id) order by id limit 500`;
    if (!events.length && !staff.length) return null;
    const previousDigest = last?.digest || "",
      payload = { version: 1, previousDigest, events, staff },
      digest = hash(bodyOf(payload)),
      id = randomUUID(),
      key = `coordinator-audit/${id}-${digest}.json`,
      until = new Date(Date.now() + policy.retention_days * 86400000).toISOString();
    const [b] =
      await tx<Batch>`insert into coordinator_archive_batches(id,coordinator_through,staff_through,digest,previous_digest,bucket,region,object_key,retain_until,payload) values(${id},${events.at(-1)?.id || last?.coordinator_through || "0"},${staff.at(-1)?.id || last?.staff_through || "0"},${digest},${previousDigest},${c.bucket},${c.region},${key},${until},${JSON.stringify(payload)}::jsonb) returning *`;
    for (const [stream, rows] of [
      ["coordinator", events],
      ["staff", staff],
    ] as const)
      if (rows.length)
        await tx`insert into coordinator_archive_members(stream,event_id,batch_id) select ${stream},v::bigint,${id}::uuid from unnest(${rows.map((r) => r.id)}::text[]) v`;
    return b;
  });
  if (!batch) return { configured: true, archived: 0 };
  if (batch.bucket !== c.bucket || batch.region !== c.region)
    throw Error("Pending archive destination changed. Owner review required.");
  const body = bodyOf(batch.payload);
  if (hash(body) !== batch.digest) throw Error("Archive batch integrity check failed.");
  const target = remote || transport(c);
  await target.put({
    bucket: batch.bucket,
    key: batch.object_key,
    body,
    digest: batch.digest,
    retainUntil: new Date(batch.retain_until),
  });
  const receipt = await target.head({ bucket: batch.bucket, key: batch.object_key });
  if (
    !receipt.versionId ||
    receipt.versionId === "null" ||
    receipt.mode !== "COMPLIANCE" ||
    !receipt.retainUntil ||
    receipt.retainUntil.getTime() < new Date(batch.retain_until).getTime() ||
    receipt.digest !== batch.digest
  )
    throw Error("Protected archive verification failed.");
  await sql`insert into coordinator_archive_receipts(batch_id,version_id,mode,retain_until,digest) values(${batch.id},${receipt.versionId},'COMPLIANCE',${receipt.retainUntil.toISOString()},${batch.digest}) on conflict(batch_id) do nothing`;
  return { configured: true, archived: 1 };
}
export async function archiveStatus(sql: Sql, actor: string, env: Env = process.env) {
  return secured(sql, actor, "staff.archive.status", async (tx) => {
    await authority(tx, actor, "staff_activity.read");
    const [status] = await tx<{
      pending: number;
      lastVerifiedAt: string | null;
      lastRetainUntil: string | null;
    }>`select (select count(*)::int from coordinator_archive_batches b where not exists(select 1 from coordinator_archive_receipts r where r.batch_id=b.id)) pending,(select max(verified_at)::text from coordinator_archive_receipts) "lastVerifiedAt",(select retain_until::text from coordinator_archive_receipts order by verified_at desc limit 1) "lastRetainUntil"`;
    await audit(tx, actor, "staff.archive.status", "archive", "allowed");
    return { configured: !!config(env), ...status };
  });
}

/** A storage failure must still reach owners instead of preventing the alert worker from flushing. */
export async function recordArchiveProblem(sql: Sql) {
  return sql.transaction(async (tx) => {
    const id = "protected-archive:" + new Date().toISOString().slice(0, 10);
    const added =
      await tx`insert into coordinator_risk_alerts(id,code,priority,actor_id,observed_count,window_hours) values(${id},'protected-archive-verification-failed','critical','',1,24) on conflict do nothing returning id`;
    if (!added.length) return;
    const recipients = await tx<{
      email: string;
    }>`select g.email from owner_grants g join "user" u on u.id=g.user_id join staff_authorities a on a.email=g.email where g.revoked_at is null and g.email=lower(trim(u.email)) and u."emailVerified" and u."disabledAt" is null and a.capability='staff_activity.read'`;
    for (const r of recipients)
      await tx`insert into site_alert_deliveries(id,recipient,audience,subject,body) values(${id + ":" + r.email},${r.email},'coordinator-owners','Prospects — protected audit archive requires review','The independent archive did not provide a verified protected copy. Local audit records remain intact. Review Privacy & Audit Protection and the storage configuration. https://prospectssports.club/office') on conflict do nothing`;
  });
}
