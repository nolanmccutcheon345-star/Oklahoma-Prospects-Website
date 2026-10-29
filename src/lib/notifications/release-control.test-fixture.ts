import assert from "node:assert/strict";
import type { Sql } from "../db";
import type { NoticeQueue } from "./release-control-contracts";
import { auditNoticeReleases, approveNoticeReleases } from "./release-control.server";

/** Uses the real owner preview and approval flow against disposable synthetic fixtures only. */
export async function approveSyntheticNotices(
  sql: Sql,
  queue: NoticeQueue,
  env: Record<string, string | undefined>,
  ids?: string[],
  owner = "owner",
) {
  let cursor: string | undefined;
  const approved: string[] = [];
  do {
    const page = await auditNoticeReleases(sql, owner, env, { queue, cursor, limit: 50 });
    const items = page.rows
      .filter((row) => (!ids || ids.includes(row.id)) && row.approvalStatus === "held")
      .map(({ queue: category, id, digest }) => ({ queue: category, id, digest }));
    for (let i = 0; i < items.length; i += 20) {
      await approveNoticeReleases(sql, owner, env, {
        items: items.slice(i, i + 20),
        confirmed: true,
      });
    }
    approved.push(...items.map((item) => item.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  if (ids)
    for (const id of ids)
      assert.ok(approved.includes(id), `Synthetic notice ${queue}/${id} was not approved`);
  return approved;
}
