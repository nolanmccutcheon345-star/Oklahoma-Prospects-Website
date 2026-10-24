import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { enrollmentFixture } from "./test-fixture";
import { publicHandbooks } from "./handbooks.server";
import { organizationPolicies } from "./organization-policy";

test("membership directive appends current full-price policy without rewriting prior policies or financial records", async () => {
  const { db, sql } = await enrollmentFixture();
  try {
    const migration = await readFile("migrations/0109_separate_personal_memberships.sql", "utf8");
    await db.exec(migration);
    assert.equal((await publicHandbooks(sql)).length, 0);
    await sql`update owner_grants set user_id=null where user_id='owner'`;
    await sql`update "user" set email='stevemccutcheon89@gmail.com' where id='owner'`;
    await sql`update owner_grants set user_id='owner' where email='stevemccutcheon89@gmail.com'`;
    const oldRelease = await readFile("migrations/0108_organization_enrollment.sql", "utf8");
    await db.exec(
      oldRelease
        .split("-- BEGIN OWNER AUTHORIZED PUBLICATION\n")[1]
        .split("-- END OWNER AUTHORIZED PUBLICATION")[0],
    );
    const before = await sql`select * from handbook_versions order by document_id,version`;
    const financial = JSON.stringify(await sql`select payload,rev from club_state`);
    const grants = JSON.stringify(await sql`select * from owner_grants order by email`);
    const oldMaster = before.find(
      (v) => v.document_id === "academy-2027" && v.status === "published",
    )!;
    await db.exec(migration);
    await db.exec(migration);
    const after = await sql`select * from handbook_versions order by document_id,version`;
    assert.equal(after.length, before.length + 1);
    for (const old of before)
      assert.deepEqual(
        after.find((v) => v.document_id === old.document_id && v.version === old.version),
        old,
      );
    const current = (await publicHandbooks(sql)).find((d) => d.documentId === "academy-2027")!;
    assert.equal(current.version, Number(oldMaster.version) + 1);
    const titles = ["Season fees and optional services", "Facility and equipment"];
    for (const title of titles) {
      assert.equal(
        current.content.sections.find((s) => s.title === title)?.body,
        organizationPolicies["academy-2027"].sections.find((s) => s.title === title)?.body,
      );
    }
    assert.match(JSON.stringify(current.content), /full published price/);
    assert.doesNotMatch(
      JSON.stringify(current.content),
      /Individual facility access is an optional selection/,
    );
    assert.equal(JSON.stringify(await sql`select payload,rev from club_state`), financial);
    assert.equal(JSON.stringify(await sql`select * from owner_grants order by email`), grants);
    assert.equal(
      (await sql`select * from handbook_audit where id='separate-memberships-2026-10-24'`).length,
      1,
    );
    await assert.rejects(
      sql`delete from handbook_versions where document_id='academy-2027' and status='published'`,
      /immutable/,
    );
  } finally {
    await db.close();
  }
});
