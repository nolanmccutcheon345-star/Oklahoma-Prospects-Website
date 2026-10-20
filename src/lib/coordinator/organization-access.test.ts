import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import {
  previewFinancialBasisInitialization,
  initializeFinancialBasisForOwner,
} from "../finance/basis.server";
import { applyFutureActiveSchemaForTest } from "../finance/context.test-fixture";
import { previewOrganizationAccess, applyOrganizationAccess } from "./organization-access.server";
const db = new PGlite();
after(() => db.close());
function wrap(query: PGlite["query"], outer = false): Sql {
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (
      await query(
        parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
        values,
      )
    ).rows) as Sql;
  sql.query = (async (q: string, v: unknown[] = []) => (await query(q, v)).rows) as Sql["query"];
  sql.transaction = outer
    ? (fn) => db.transaction((tx) => fn(wrap(tx.query.bind(tx) as PGlite["query"])))
    : async () => {
        throw Error("nested");
      };
  return sql;
}
async function fixture(active = true) {
  await db.exec("drop schema public cascade;create schema public");
  for (const n of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + n, "utf8"));
  const sql = wrap(db.query.bind(db), true);
  for (const [id, role] of [
    ["owner", "admin"],
    ["sara", "parent"],
    ["fake", "admin"],
  ]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
    await sql`insert into profiles(user_id,name,email,role) values(${id},${id},${id + "@example.invalid"},${role})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 1;
  club.teams = [];
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  const p = await previewFinancialBasisInitialization(sql, "owner");
  await initializeFinancialBasisForOwner(sql, "owner", {
    ...p,
    reason: "Reviewed synthetic capture",
  });
  if (active) await applyFutureActiveSchemaForTest(sql);
  process.env.APP_BUILD_SOURCE_COMMIT = "a".repeat(40);
  process.env.APP_BUILD_SOURCE_DIRTY = "false";
  return sql;
}
function command(p: Awaited<ReturnType<typeof previewOrganizationAccess>>) {
  return {
    userId: p.userId,
    reviewDigest: p.reviewDigest,
    expectedRelease: p.release,
    expectedBasisVersion: p.basisVersion!,
    expectedRevision: p.revision,
    confirmed: true as const,
    reason: "Explicit reviewed existing account grant",
  };
}
test("only current true owners can review; self and admin targets protected", async () => {
  const sql = await fixture();
  for (const actor of ["sara", "fake"])
    await assert.rejects(() => previewOrganizationAccess(sql, actor, { userId: "sara" }));
  for (const userId of ["owner", "fake", "missing"])
    await assert.rejects(() => previewOrganizationAccess(sql, "owner", { userId }));
});
test("captured, dirty, disabled and unverified states cannot grant", async () => {
  const sql = await fixture(false);
  let p = await previewOrganizationAccess(sql, "owner", { userId: "sara" });
  assert.equal(p.ready, false);
  await applyFutureActiveSchemaForTest(sql);
  for (const change of [
    async () => {
      process.env.APP_BUILD_SOURCE_DIRTY = "true";
    },
    async () => {
      process.env.APP_BUILD_SOURCE_DIRTY = "false";
      await sql`update "user" set "emailVerified"=false where id='sara'`;
    },
    async () => {
      await sql`update "user" set "emailVerified"=true,"disabledAt"=now() where id='sara'`;
    },
  ]) {
    await change();
    p = await previewOrganizationAccess(sql, "owner", { userId: "sara" });
    assert.equal(p.ready, false);
    await assert.rejects(() => applyOrganizationAccess(sql, "owner", command(p)));
  }
  assert.equal((await sql`select * from organization_operational_access`).length, 0);
});
test("review binds release, account and revision; grant preserves identity and financial basis", async () => {
  const sql = await fixture();
  const before = await sql`select * from financial_basis_versions`,
    owners = await sql`select * from owner_grants order by email`;
  let p = await previewOrganizationAccess(sql, "owner", { userId: "sara" });
  assert.equal(p.ready, true);
  await assert.rejects(() =>
    applyOrganizationAccess(sql, "owner", { ...command(p), expectedRelease: "b".repeat(40) }),
  );
  await sql`update "user" set name='Changed' where id='sara'`;
  await assert.rejects(() => applyOrganizationAccess(sql, "owner", command(p)));
  p = await previewOrganizationAccess(sql, "owner", { userId: "sara" });
  const result = await applyOrganizationAccess(sql, "owner", command(p));
  assert.equal(result.revision, 1);
  await assert.rejects(() => applyOrganizationAccess(sql, "owner", command(p)));
  assert.deepEqual(await sql`select * from financial_basis_versions`, before);
  assert.equal((await sql`select role from profiles where user_id='sara'`)[0].role, "parent");
  assert.deepEqual(await sql`select * from owner_grants order by email`, owners);
  assert.equal(
    (
      await sql`select financial_restricted,status from organization_operational_access where user_id='sara'`
    )[0].financial_restricted,
    true,
  );
  assert.equal(
    (await sql`select * from coordinator_audit where action='organization.access.grant'`).length,
    1,
  );
});
test("audit failure rolls back grant atomically", async () => {
  const sql = await fixture();
  const p = await previewOrganizationAccess(sql, "owner", { userId: "sara" });
  await db.exec(
    "create function reject_grant_audit() returns trigger language plpgsql as $$ begin raise exception 'audit failed'; end $$; create trigger reject_grant_audit before insert on coordinator_audit for each row execute function reject_grant_audit()",
  );
  await assert.rejects(() => applyOrganizationAccess(sql, "owner", command(p)), /audit failed/);
  assert.equal((await sql`select * from organization_operational_access`).length, 0);
});
