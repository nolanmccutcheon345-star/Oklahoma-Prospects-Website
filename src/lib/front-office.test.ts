import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { saveWorkFor, markReviewedFor, frontOfficeFor } from "./front-office.server";
test("owner work queues preserve placement, protect billing, and track evaluation revisions", async () => {
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
    for (const [id, role] of [
      ["owner", "admin"],
      ["coach", "coach"],
      ["parent", "parent"],
      ["fake", "admin"],
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.invalid"},${id},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role) values(${id},${id + "@example.invalid"},${id},${role})`;
    }
    await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
    await sql`insert into club_requests(id,kind,payload,status) values('r','tryout','{"player":"Sample","stage":"evaluated"}'::jsonb,'evaluated'),('bill','refund-review','{}','open')`;
    const data = {
      id: "r",
      assignee: "coach",
      status: "contacted" as const,
      note: "Called family; follow up tomorrow.",
      noteId: randomUUID(),
    };
    for (const id of ["parent", "coach", "fake"]) {
      await assert.rejects(() => saveWorkFor(sql, id, data), /Owner access/);
      await assert.rejects(() => frontOfficeFor(sql, id), /Owner access/);
    }
    assert.equal((await frontOfficeFor(sql, "owner")).counts.requests, 2);
    await saveWorkFor(sql, "owner", data);
    await saveWorkFor(sql, "owner", data);
    assert.equal((await sql`select id from office_request_notes`).length, 1);
    assert.equal(
      (await sql<{ status: string }>`select status from club_requests where id='r'`)[0].status,
      "evaluated",
    );
    await assert.rejects(
      () => saveWorkFor(sql, "owner", { ...data, assignee: "parent" }),
      /active staff/,
    );
    await assert.rejects(
      () => saveWorkFor(sql, "owner", { ...data, id: "bill", status: "closed" }),
      /billing/,
    );
    await saveWorkFor(sql, "owner", { ...data, status: "closed", note: "" });
    assert.equal((await frontOfficeFor(sql, "owner")).counts.requests, 1);
    await sql`update club_requests set status='resolved' where id='r'`;
    await assert.rejects(() => saveWorkFor(sql, "owner", data), /already completed/);
    await saveWorkFor(sql, "owner", { ...data, status: "closed", note: "" });
    await sql`insert into tryout_evaluations(id,team_id,evaluator_id,evaluator_name,player_name,age_group,sport,evaluation_date,status,recommendation,payload) values('e','','coach','Coach','Sample','13U','baseball','2026-10-09','submitted','undecided','{}')`;
    assert.equal((await frontOfficeFor(sql, "owner")).counts.evaluations, 1);
    await assert.rejects(
      () => markReviewedFor(sql, "coach", { id: "e", revision: 1 }),
      /Owner access/,
    );
    await markReviewedFor(sql, "owner", { id: "e", revision: 1 });
    assert.equal((await frontOfficeFor(sql, "owner")).counts.evaluations, 0);
    await sql`update tryout_evaluations set revision=2 where id='e'`;
    assert.equal((await frontOfficeFor(sql, "owner")).counts.evaluations, 1);
    await assert.rejects(() => markReviewedFor(sql, "owner", { id: "e", revision: 1 }), /changed/);
  } finally {
    await db.close();
  }
});
