import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { assertCommerceRole, commerceIdentityFor } from "./access.server";
import { readFamilyBilling } from "./portal.server";
test("commerce role policy denies player and unknown roles", () => {
  for (const role of ["player", "guest", "", "staff"])
    assert.throws(() => assertCommerceRole({ role }), /Player accounts cannot/);
  for (const role of ["parent", "coach", "admin"])
    assert.doesNotThrow(() => assertCommerceRole({ role }));
});
test("verified player with household membership is denied commerce; family billing rejects before queries", async () => {
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
    for (const role of ["player", "parent", "coach"]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${role},${role + "@example.invalid"},${role},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${role},${role + "@example.invalid"},${role},${role},'shared-family')`;
    }
    await sql`insert into club_households(id,primary_email) values('shared-family','parent@example.invalid')`;
    await sql`insert into household_members(household_id,user_id) values('shared-family','player'),('shared-family','parent')`;
    await assert.rejects(() => commerceIdentityFor(sql, "player"), /Player accounts cannot/);
    const parent = await commerceIdentityFor(sql, "parent");
    assert.equal(parent.role, "parent");
    assert.ok(parent.billingHouseholdIds.includes("shared-family"));
    assert.equal((await commerceIdentityFor(sql, "coach")).role, "coach");
    let queried = false;
    const noQuery = (async () => {
      queried = true;
      throw new Error("Unexpected billing query");
    }) as unknown as Sql;
    await assert.rejects(
      () => readFamilyBilling(noQuery, { ...parent, role: "player" }),
      /Player accounts cannot/,
    );
    assert.equal(queried, false);
    await sql`update "user" set "disabledAt"=now() where id='parent'`;
    await assert.rejects(() => commerceIdentityFor(sql, "parent"), /Unauthorized/);
  } finally {
    await db.close();
  }
});
