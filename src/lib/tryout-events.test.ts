import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import {
  adminTryoutEventsFor,
  publicTryoutEventsFor,
  saveTryoutEventFor,
} from "./tryout-events.server";
import { tryoutEventInput } from "./tryout-events-contracts";
test("owner events publish by sport with permission, audit and stale-edit protection", async () => {
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (text: string, values: unknown[] = []) =>
      (await query(text, values)).rows) as Sql["query"];
    sql.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  try {
    for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + name, "utf8"));
    const sql = wrap(db.query.bind(db));
    for (const id of [
      "owner",
      "reader",
      "parent",
      "coach",
      "player",
      "fake-admin",
      "disabled",
      "unverified",
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt","disabledAt") values(${id},${id + "@example.invalid"},${id},${id !== "unverified"},now(),now(),${id === "disabled" ? "2026-09-28" : null})`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${id === "owner" || id === "fake-admin" ? "admin" : ["coach", "player"].includes(id) ? id : "parent"},${"fam-" + id})`;
    }
    await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;

    const input = {
      id: randomUUID(),
      revision: 0,
      sport: "Baseball" as const,
      season: "Spring 2030",
      ageGroups: ["9U", "10U"],
      date: "2030-04-05",
      startTime: "14:00",
      endTime: "15:00",
      location: "Test facility",
      capacity: 20,
      status: "draft" as const,
    };
    for (const id of [
      "reader",
      "parent",
      "coach",
      "player",
      "fake-admin",
      "disabled",
      "unverified",
      "unknown",
    ]) {
      await assert.rejects(() => adminTryoutEventsFor(sql, id));
      await assert.rejects(() => saveTryoutEventFor(sql, id, input));
    }
    await saveTryoutEventFor(sql, "owner", input);
    assert.deepEqual(await publicTryoutEventsFor(sql), []);
    const [event] = await adminTryoutEventsFor(sql, "owner");
    assert.equal(event.revision, 1);
    await saveTryoutEventFor(sql, "owner", { ...event, status: "published" });
    const [published] = await publicTryoutEventsFor(sql);
    assert.equal(published.location, "Test facility");
    assert.deepEqual(published.ageGroups, ["9U", "10U"]);
    assert.equal("updated_by" in published, false);
    assert.equal("updated_at" in published, false);
    await assert.rejects(
      () => saveTryoutEventFor(sql, "owner", { ...event, status: "cancelled" }),
      /Another editor/,
    );
    await saveTryoutEventFor(sql, "owner", { ...published, status: "cancelled" });
    assert.deepEqual(await publicTryoutEventsFor(sql), []);
    await saveTryoutEventFor(sql, "owner", {
      ...input,
      id: randomUUID(),
      sport: "Softball",
      status: "published",
    });
    assert.equal((await publicTryoutEventsFor(sql))[0].sport, "Softball");
    await saveTryoutEventFor(sql, "owner", {
      ...input,
      id: randomUUID(),
      date: "2020-01-01",
      status: "published",
    });
    assert.equal((await publicTryoutEventsFor(sql)).length, 1);
    await assert.rejects(() => saveTryoutEventFor(sql, "owner", input), /already exists/);
    assert.ok(
      (await sql`select * from audit_events where target_table='tryout_events'`).length >= 5,
    );
    for (const invalid of [
      { date: "2030-02-30" },
      { startTime: "25:00" },
      { endTime: "13:00" },
      { capacity: 0 },
      { ageGroups: [] },
      { ageGroups: ["9U", "9u"] },
    ]) {
      assert.equal(tryoutEventInput.safeParse({ ...input, ...invalid }).success, false);
    }
  } finally {
    await db.close();
  }
});
