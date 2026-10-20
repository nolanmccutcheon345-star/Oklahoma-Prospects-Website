import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { Sql } from "../db";
import { secured, authority, audit } from "./access.server";
import { privacyPolicyInput, privacyReviewInput, privacyCategories } from "./privacy-contracts";
type Policy = {
  category: (typeof privacyCategories)[number];
  revision: number;
  purpose: string;
  retentionDays: number;
  legalBasis: string;
  updatedAt: string;
};
export async function privacyWorkspace(sql: Sql, actor: string) {
  return secured(sql, actor, "staff.privacy.read", async (tx) => {
    await authority(tx, actor, "staff_activity.read");
    const policies =
      await tx<Policy>`select category,revision,purpose,retention_days "retentionDays",legal_basis "legalBasis",updated_at::text "updatedAt" from coordinator_privacy_policies order by category`;
    const reviews = await tx<{
      id: string;
      category: string;
      revision: number;
      evidence: string;
      outcome: string;
      createdAt: string;
    }>`select id::text,category,revision,evidence,outcome,created_at::text "createdAt" from coordinator_privacy_reviews order by created_at desc,id limit 100`;
    const candidates: { category: string; count: number }[] = [];
    // Counts identify candidates for a human purpose/hold/guardian review. No data is deleted or exported.
    for (const p of policies) {
      const target = {
        recruiting: "club_requests",
        communications: "coordinator_communication_versions",
        operational: "operational_event_records",
        publication: "coordinator_publication_versions",
        audit: "coordinator_audit",
      }[p.category];
      const [count] = await tx.query<{ n: number }>(
        `select count(*)::int n from ${target} where ${["publication", "communications"].includes(p.category) ? "recorded_at" : p.category === "operational" ? "updated_at" : "created_at"} < now()-$1*interval '1 day'`,
        [p.retentionDays],
      );
      candidates.push({ category: p.category, count: count.n });
    }
    await audit(tx, actor, "staff.privacy.read", "policies", "allowed", {
      categories: policies.length,
    });
    return { policies, reviews, candidates };
  });
}
export async function savePrivacyPolicy(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof privacyPolicyInput>,
) {
  const v = privacyPolicyInput.parse(raw);
  return secured(sql, actor, "staff.privacy.policy", async (tx) => {
    await authority(tx, actor, "staff_activity.read");
    await tx`select pg_advisory_xact_lock(hashtext('coordinator-privacy-policy'))`;
    const [old] = await tx<{
      revision: number;
    }>`select revision from coordinator_privacy_policies where category=${v.category} for update`;
    if ((old?.revision || 0) !== v.revision) throw Error("Policy changed. Refresh before saving.");
    await tx`insert into coordinator_privacy_policies(category,purpose,retention_days,legal_basis,revision,reviewer_id) values(${v.category},${v.purpose},${v.retentionDays},${v.legalBasis},1,${actor}) on conflict(category) do update set purpose=excluded.purpose,retention_days=excluded.retention_days,legal_basis=excluded.legal_basis,revision=coordinator_privacy_policies.revision+1,reviewer_id=excluded.reviewer_id,updated_at=now()`;
    await tx`insert into coordinator_privacy_reviews(id,actor_id,category,revision,evidence,outcome) values(${randomUUID()},${actor},${v.category},${v.revision + 1},${JSON.stringify({ purpose: v.purpose, retentionDays: v.retentionDays, legalBasis: v.legalBasis })},'policy')`;
    await audit(tx, actor, "staff.privacy.policy", v.category, "allowed", {
      revision: v.revision + 1,
      retentionDays: v.retentionDays,
    });
    return { ok: true };
  });
}
export async function recordPrivacyReview(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof privacyReviewInput>,
) {
  const v = privacyReviewInput.parse(raw);
  return secured(sql, actor, "staff.privacy.review", async (tx) => {
    await authority(tx, actor, "staff_activity.read");
    if (v.category !== "privacy-flows") {
      const [p] = await tx<{
        revision: number;
      }>`select revision from coordinator_privacy_policies where category=${v.category} for share`;
      if (!p || p.revision !== v.revision) throw Error("Review the current policy first.");
    } else if (v.revision !== 0) throw Error("Invalid privacy flow revision.");
    const [existing] = await tx<{
      same: boolean;
    }>`select actor_id=${actor} and category=${v.category} and revision=${v.revision} and evidence=${v.evidence} same from coordinator_privacy_reviews where id=${v.id}`;
    if (existing) {
      if (!existing.same) throw Error("Review ID already used.");
      return { ok: true };
    }
    await tx`insert into coordinator_privacy_reviews(id,actor_id,category,revision,evidence,outcome) values(${v.id},${actor},${v.category},${v.revision},${v.evidence},${v.category === "privacy-flows" ? "privacy-flow-review" : "retention-review"})`;
    await audit(tx, actor, "staff.privacy.review", v.category, "allowed", {
      revision: v.revision,
      reviewId: v.id,
    });
    return { ok: true };
  });
}
