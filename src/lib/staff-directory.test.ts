import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import {
  publicStaffFor,
  listStaffDirectoryFor,
  saveStaffListingFor,
} from "./staff-directory.server";
import { staffListingInput } from "./staff-directory";

function wrap(db: Pick<PGlite, "query" | "transaction">): Sql {
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (
      await db.query(
        parts.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, ""),
        values,
      )
    ).rows) as Sql;
  sql.query = async <T>(query: string, values: unknown[] = []) =>
    (await db.query<T>(query, values)).rows;
  sql.transaction = async (work) => db.transaction((tx) => work(wrap(tx as unknown as PGlite)));
  return sql;
}
test("staff listings persist independently of accounts and only published records are public", async () => {
  const db = new PGlite();
  const sql = wrap(db);
  try {
    for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
      await db.exec(await readFile(`migrations/${name}`, "utf8"));
    for (const [id, email] of [
      ["owner", "stevemccutcheon89@gmail.com"],
      ["parent", "parent@example.invalid"],
      ["coach", "coach@example.invalid"],
    ])
      await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${id},${id},${email},true,now(),now())`;
    await sql`insert into profiles(user_id,email,role) values('coach','coach@example.invalid','coach')`;
    await saveStaffListingFor(sql, "owner", {
      id: "4ebfbe1d-5772-43e6-a0cf-ef56e74619aa",
      version: 0,
      name: "Fixture Coordinator",
      title: "Softball Coordinator & Recruiter",
      program: "Softball",
      email: "staff@example.invalid",
      phone: "+1 (918) 555-0101",
      bio: "Coordinates the softball program.",
      published: true,
    });
    const initial = await publicStaffFor(sql);
    assert.equal(initial[0].title, "Softball Coordinator & Recruiter");
    assert.equal(initial[0].email, "staff@example.invalid");
    assert.equal(initial[0].phone, "+1 (918) 555-0101");
    assert.equal("version" in initial[0], false);
    const [staff] = await listStaffDirectoryFor(sql, "owner");
    for (const id of ["parent", "coach", "missing"]) {
      await assert.rejects(listStaffDirectoryFor(sql, id));
      await assert.rejects(saveStaffListingFor(sql, id, staff));
    }
    await assert.rejects(
      saveStaffListingFor(sql, "owner", { ...staff, role: "admin" } as typeof staff),
    );
    const saved = await saveStaffListingFor(sql, "owner", {
      ...staff,
      published: false,
      bio: "Updated biography.",
    });
    assert.equal(saved.version, 2);
    assert.equal((await publicStaffFor(sql)).length, 0);
    assert.equal((await listStaffDirectoryFor(sql, "owner"))[0].bio, "Updated biography.");
    await assert.rejects(saveStaffListingFor(sql, "owner", staff), /changed/);
    await saveStaffListingFor(sql, "owner", { ...saved, published: true });
    assert.equal((await publicStaffFor(sql))[0].bio, "Updated biography.");
    assert.equal((await sql`select id from "user" where email='staff@example.invalid'`).length, 0);
    assert.equal(
      (await sql`select id from club_invites where email='staff@example.invalid'`).length,
      0,
    );
    assert.equal(
      (await sql`select id from club_staff where lower(email)='staff@example.invalid'`).length,
      0,
    );
    assert.equal(
      (
        await sql`select id from audit_events where target_table='staff_directory' and actor_id='owner'`
      ).length,
      3,
    );
    assert.throws(() => staffListingInput.parse({ ...saved, phone: "javascript:alert(1)" }));
  } finally {
    await db.close();
  }
});
