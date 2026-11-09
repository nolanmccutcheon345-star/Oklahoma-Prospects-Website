import test from "node:test";
import assert from "node:assert/strict";
import { enrollmentFixture } from "../enrollment/test-fixture";
import { readAdministrativeAuditEvents } from "./audit-report.server";

test("owner cleanup audit projection identifies actor and reason without leaking source payloads", async () => {
  const { db, sql } = await enrollmentFixture();
  try {
    for (const action of [
      "message.remove",
      "roster.remove",
      "roster.merge",
      "staff.role.remove",
      "account.deactivate",
      "unrelated",
    ])
      await sql`insert into audit_events(actor_id,action,target_table,target_id,after_state) values('owner',${action},'synthetic','one',${JSON.stringify({ reason: "Synthetic cleanup reason", body: "PRIVATE MESSAGE", parentEmail: "private@example.invalid", balance: 12345 })}::jsonb)`;
    await assert.rejects(readAdministrativeAuditEvents(sql, "guardian"), /Owner access/);
    await assert.rejects(readAdministrativeAuditEvents(sql, "coach"), /Owner access/);
    await assert.rejects(readAdministrativeAuditEvents(sql, "fake"), /Owner access/);
    const events = (await readAdministrativeAuditEvents(sql, "owner")).filter(
      (e) => e.target_table === "synthetic",
    );
    assert.equal(events.length, 6);
    for (const e of events) {
      assert.equal(e.actor_id, "owner");
      assert.equal(e.actor_name, "owner");
      assert.equal(e.reason, e.action === "unrelated" ? null : "Synthetic cleanup reason");
    }
    assert.doesNotMatch(JSON.stringify(events), /PRIVATE MESSAGE|private@example|12345/);
    const id = "10000000-0000-4000-8000-000000000000";
    await sql`insert into team_message_removals(channel,message_id,team_id,actor_id,reason,author,excerpt,source_digest) values('team',${id},'base','owner','Synthetic removal reason','Synthetic author','Reviewed first words','synthetic-digest')`;
    await sql`insert into audit_events(actor_id,action,target_table,target_id,after_state) values('owner','message.remove','team_chat_messages',${id},'{"reason":"Synthetic removal reason"}'::jsonb)`;
    const receipt = (await readAdministrativeAuditEvents(sql, "owner")).find(
      (e) => e.target_id === id,
    )!;
    assert.equal(receipt.message_author, "Synthetic author");
    assert.equal(receipt.message_excerpt, "Reviewed first words");
    const familyId = "20000000-0000-4000-8000-000000000000";
    await sql`insert into team_message_removals(channel,message_id,team_id,actor_id,reason,author,excerpt,source_digest) values('family',${familyId},'base','owner','Synthetic family reason','Family author','Family first words','synthetic-digest')`;
    await sql`insert into audit_events(actor_id,action,target_table,target_id,after_state) values('owner','message.remove','team_hub_family_messages',${familyId},'{}'::jsonb),('owner','message.remove','team_chat_messages',${familyId},'{}'::jsonb)`;
    const familyEvents = (await readAdministrativeAuditEvents(sql, "owner")).filter(
      (e) => e.target_id === familyId,
    );
    assert.equal(familyEvents.length, 2);
    assert.equal(
      familyEvents.find((e) => e.target_table === "team_hub_family_messages")?.message_excerpt,
      "Family first words",
    );
    assert.equal(
      familyEvents.find((e) => e.target_table === "team_chat_messages")?.message_excerpt,
      null,
    );
  } finally {
    await db.close();
  }
});
