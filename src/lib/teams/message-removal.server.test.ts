import { teamCommunications } from "../coordinator/operations.server";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { enrollmentFixture } from "../enrollment/test-fixture";
import { readHub, writeHub } from "../team-hub/server";
import { teamActivityWorkspace } from "./activity.server";
import { removeTeamMessage } from "./message-removal.server";
import { reviewableTeamMessages, reviewTeamMessage } from "../coordinator/communications.server";

test("owner-only removal preserves records, hides all shared reads and cannot revive withheld messages", async () => {
  const { db, sql } = await enrollmentFixture();
  try {
    await sql`insert into staff_authorities(email,capability) values('owner@example.invalid','staff_approvals.review') on conflict do nothing`;
    const id = randomUUID();
    await writeHub(sql, "coach", {
      kind: "message",
      teamId: "base",
      playerId: null,
      requestId: id,
      body: "Synthetic test message only",
    });
    const input = {
      channel: "team" as const,
      teamId: "base",
      id,
      author: "coach",
      body: "Synthetic test message only",
      reason: "Synthetic cleanup reason",
      confirm: true as const,
    };
    for (const actor of ["coach", "guardian", "fake", "coordinator", "stranger"])
      await assert.rejects(removeTeamMessage(sql, actor, input));
    await assert.rejects(removeTeamMessage(sql, "owner", { ...input, reason: "" }));
    await assert.rejects(removeTeamMessage(sql, "owner", { ...input, teamId: "soft" }));
    await assert.rejects(removeTeamMessage(sql, "owner", { ...input, body: "Stale text" }));
    const before = await reviewableTeamMessages(sql, "owner", { teamId: "base" });
    assert.equal(before.items[0].operational, false);
    assert.equal(before.canRemoveMessages, true);
    assert.equal((await teamActivityWorkspace(sql, "coach", "base")).canRemoveMessages, false);
    const [first, retry] = await Promise.all([
      removeTeamMessage(sql, "owner", input),
      removeTeamMessage(sql, "owner", input),
    ]);
    assert.equal(first.ok, true);
    assert.equal(retry.ok, true);
    assert.equal((await sql`select * from team_message_removals`).length, 1);
    assert.equal((await sql`select * from team_chat_messages where id=${id}`).length, 1);
    assert.equal(
      (await readHub(sql, "guardian", { teamId: "base" })).workspace!.messages.length,
      0,
    );
    assert.equal((await teamActivityWorkspace(sql, "coach", "base")).messages.length, 0);
    assert.equal((await reviewableTeamMessages(sql, "owner", { teamId: "base" })).items.length, 0);
    await assert.rejects(
      reviewTeamMessage(sql, "owner", {
        id,
        sourceDigest: before.items[0].sourceDigest,
        operational: true,
        reason: "Synthetic classification reason",
        confirm: true,
      }),
      /changed/,
    );
    await writeHub(sql, "coach", {
      kind: "message",
      teamId: "base",
      playerId: null,
      requestId: id,
      body: input.body,
    });
    assert.equal(
      (await readHub(sql, "guardian", { teamId: "base" })).workspace!.messages.length,
      0,
      "post retry cannot restore removed message",
    );
    const [receipt] = await sql<{
      author: string;
      excerpt: string;
      actor_id: string;
      reason: string;
    }>`select * from team_message_removals`;
    assert.equal(receipt.actor_id, "owner");
    assert.equal(receipt.author, "coach");
    assert.equal(receipt.excerpt, input.body);
    assert.equal(receipt.reason, input.reason);
    const events = await sql<{
      actor_id: string;
      target_id: string;
      after_state: { reason: string };
    }>`select actor_id,target_id,after_state from audit_events where action='message.remove'`;
    assert.equal(events.length, 1);
    assert.equal(events[0].actor_id, "owner");
    assert.equal(events[0].target_id, id);
    assert.equal(events[0].after_state.reason, input.reason);
    assert.doesNotMatch(JSON.stringify(events), /Synthetic test message only|excerpt|author/);
    await assert.rejects(
      sql`update team_message_removals set reason='Changed reason'`,
      /append-only/,
    );
    await assert.rejects(sql`delete from team_message_removals`, /append-only/);
    await sql`insert into coordinator_assignments(user_id,sport,status,coverage,team_ids,permissions,updated_by) values('coordinator','baseball','active','teams',array['base'],array['communications.read'],'owner')`;
    assert.equal(
      (await teamCommunications(sql, "coordinator", { teamId: "base" })).items.length,
      0,
    );
    const visibleId = randomUUID();
    await writeHub(sql, "coach", {
      kind: "message",
      teamId: "base",
      playerId: null,
      requestId: visibleId,
      body: "Synthetic operational message",
    });
    const visible = (await reviewableTeamMessages(sql, "owner", { teamId: "base" })).items[0];
    await reviewTeamMessage(sql, "owner", {
      id: visibleId,
      sourceDigest: visible.sourceDigest,
      operational: true,
      reason: "Synthetic operational classification",
      confirm: true,
    });
    assert.equal(
      (await teamCommunications(sql, "coordinator", { teamId: "base" })).items.length,
      1,
    );
    await removeTeamMessage(sql, "owner", { ...input, id: visibleId, body: visible.body });
    assert.equal(
      (await teamCommunications(sql, "coordinator", { teamId: "base" })).items.length,
      0,
    );
    await assert.rejects(sql`truncate team_message_removals`, /append-only/);
    await sql`update owner_grants set revoked_at=now() where user_id='owner'`;
    await assert.rejects(removeTeamMessage(sql, "owner", input));
  } finally {
    await db.close();
  }
});

test("family removal preserves the private conversation boundary and source history", async () => {
  const { db, sql } = await enrollmentFixture();
  try {
    const id = randomUUID(),
      body = "Private synthetic family message";
    await writeHub(sql, "guardian", {
      kind: "message",
      teamId: "base",
      playerId: "base-player",
      requestId: id,
      body,
    });
    assert.equal(
      (await readHub(sql, "guardian", { teamId: "base" })).workspace!.messages.length,
      0,
    );
    await removeTeamMessage(sql, "owner", {
      channel: "family",
      teamId: "base",
      id,
      author: "guardian",
      body,
      reason: "Remove synthetic family duplicate",
      confirm: true,
    });
    assert.equal(
      (await readHub(sql, "coach", { teamId: "base", playerId: "base-player" })).workspace!.messages
        .length,
      0,
    );
    assert.equal((await sql`select * from team_hub_family_messages where id=${id}`).length, 1);
  } finally {
    await db.close();
  }
});
