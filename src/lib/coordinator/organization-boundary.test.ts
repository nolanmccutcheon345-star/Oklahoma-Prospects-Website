import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import {
  financiallyRestricted,
  hasOrganizationOperations,
  requireOrganizationOperations,
  requireUnrestrictedLegacyAccess,
} from "./access.server";
import { resolveIdentity } from "../identity.server";
import { staffWorkspace, saveAssignment } from "./admin.server";
import { permissionKeys } from "./contracts";
import { frontOfficeFor } from "../front-office.server";

async function fixture() {
  const db = new PGlite();
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile(`migrations/${name}`, "utf8"));
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (q: string, values: unknown[] = []) =>
      (await query(q, values)).rows) as Sql["query"];
    sql.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  const sql = wrap(db.query.bind(db));
  for (const id of ["steve", "sara", "other", "fake"]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
    await sql`insert into profiles(user_id,name,email,role) values(${id},${id},${id + "@example.invalid"},${id === "steve" || id === "fake" ? "admin" : "parent"})`;
  }
  await sql`insert into owner_grants(email,user_id) values('steve@example.invalid','steve')`;
  await sql`insert into staff_authorities(email,capability) values('steve@example.invalid','staff_roles.manage')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('sara','active','steve')`;
  return { db, sql };
}

test("org operations are independent of owner identity; all legacy data access fails closed", async () => {
  const { db, sql } = await fixture();
  try {
    assert.equal(await hasOrganizationOperations(sql, "sara"), true);
    assert.equal((await requireOrganizationOperations(sql, "sara")).id, "sara");
    for (const id of ["other", "fake"])
      await assert.rejects(() => requireOrganizationOperations(sql, id));
    await requireOrganizationOperations(sql, "steve");
    await requireUnrestrictedLegacyAccess(sql, "steve");
    assert.equal((await resolveIdentity(sql, "steve")).role, "admin");
    assert.equal((await resolveIdentity(sql, "fake")).role, "parent");
    await assert.rejects(() => requireUnrestrictedLegacyAccess(sql, "sara"));
    await assert.rejects(() => resolveIdentity(sql, "sara"));
    await assert.rejects(() => frontOfficeFor(sql, "sara"));
    await assert.rejects(() => staffWorkspace(sql, "sara"));
    await assert.rejects(() =>
      saveAssignment(sql, "sara", {
        userId: "sara",
        sport: "baseball",
        revision: 0,
        status: "active",
        coverage: "sport",
        teamIds: [],
        permissions: permissionKeys,
        confirm: true,
        independentRolesReviewed: true,
      }),
    );
    const [profile] = await sql`select role from profiles where user_id='sara'`;
    assert.equal(profile.role, "parent");
    const owners = await sql`select user_id from owner_grants where user_id='sara'`;
    assert.equal(owners.length, 0);
  } finally {
    await db.close();
  }
});

test("suspension and revocation keep financial denial; disabled/unverified users cannot operate", async () => {
  const { db, sql } = await fixture();
  try {
    for (const status of ["suspended", "removed"]) {
      await sql`update organization_operational_access set status=${status} where user_id='sara'`;
      assert.equal(await hasOrganizationOperations(sql, "sara"), false);
      assert.equal(await financiallyRestricted(sql, "sara"), true);
      await assert.rejects(() => requireOrganizationOperations(sql, "sara"));
      await assert.rejects(() => requireUnrestrictedLegacyAccess(sql, "sara"));
    }
    await sql`update organization_operational_access set status='active' where user_id='sara'`;
    await sql`update "user" set "emailVerified"=false where id='sara'`;
    await assert.rejects(() => requireOrganizationOperations(sql, "sara"));
    await sql`update "user" set "emailVerified"=true,"disabledAt"=now() where id='sara'`;
    await assert.rejects(() => requireOrganizationOperations(sql, "sara"));
    await assert.rejects(
      () =>
        sql`update organization_operational_access set financial_restricted=false where user_id='sara'`,
    );
  } finally {
    await db.close();
  }
});

test("legacy and alternate financial transports enforce deny while reviewed org endpoints opt in", async () => {
  const middleware = await readFile("src/lib/auth/middleware.ts", "utf8");
  assert.match(middleware, /export const authMiddleware[\s\S]*requireUnrestrictedLegacyAccess/);
  assert.match(
    await readFile("src/lib/commerce/payment-auth.ts", "utf8"),
    /requireUnrestrictedLegacyAccess/,
  );
  for (const file of ["checkout", "receipt"])
    assert.match(
      await readFile(`src/lib/fundraising/${file}.ts`, "utf8"),
      /await requireFinancialSessionAccess\(\)/,
    );
  assert.match(
    await readFile("src/lib/identity.server.ts", "utf8"),
    /await requireUnrestrictedLegacyAccess\(sql, userId\)/,
  );
});

test("directory hides unpublished mixed biographies and preserves them on operational metadata edits", async () => {
  const { db, sql } = await fixture();
  try {
    const { saveStaffListingFor, listStaffDirectoryFor } =
      await import("../staff-directory.server");
    const id = "0c49c1ad-5412-4bdc-8fb0-6757829f652a";
    const initial = {
      id,
      version: 0,
      name: "Staff",
      title: "Coordinator",
      program: "Organization" as const,
      email: "staff@example.invalid",
      phone: "",
      bio: "PRIVATE salary and budget 56789",
      published: false,
    };
    await saveStaffListingFor(sql, "steve", initial);
    const [row] = await listStaffDirectoryFor(sql, "sara");
    assert.equal(row.bio, "");
    assert.doesNotMatch(JSON.stringify(row), /PRIVATE|56789/);
    const saved = await saveStaffListingFor(sql, "sara", {
      ...initial,
      version: 1,
      bio: "",
      title: "Team coordinator",
    });
    assert.equal(saved.bio, "");
    const [stored] = await sql`select bio from staff_directory where id=${id}`;
    assert.equal(stored.bio, initial.bio);
    await assert.rejects(() =>
      saveStaffListingFor(sql, "sara", { ...initial, version: 2, bio: "", published: true }),
    );
    await assert.rejects(() =>
      saveStaffListingFor(sql, "sara", { ...initial, version: 2, bio: "Overwrite" }),
    );
    assert.equal((await listStaffDirectoryFor(sql, "steve"))[0].bio, initial.bio);
  } finally {
    await db.close();
  }
});
