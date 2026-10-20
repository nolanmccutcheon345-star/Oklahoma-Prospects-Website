import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { wrapMigration, netlifyMigrationSlug } from "./netlify-migrations.mjs";
import { pendingMigrations } from "./migration-plan.mjs";

test("Netlify release migrations create the schema once and preserve existing records", async () => {
  const db = new PGlite();
  try {
    const source = new URL("../migrations/", import.meta.url);
    const entries = pendingMigrations(await readdir(source), []);
    const apply = async () => {
      for (const { name } of entries)
        await db.exec(wrapMigration(name, await readFile(new URL(name, source), "utf8")));
    };
    await apply();
    await db.exec("UPDATE club_services SET detail = 'preserved club edit' WHERE id = 'm1'");
    await apply();
    assert.equal(
      (await db.query("SELECT count(*)::int AS count FROM _migrations")).rows[0].count,
      entries.length,
    );
    assert.equal(
      (await db.query("SELECT detail FROM club_services WHERE id = 'm1'")).rows[0].detail,
      "preserved club edit",
    );
  } finally {
    await db.close();
  }
});

test("late PR migrations append after deployed version 35 without changing ledger keys", async () => {
  const source = new URL("../migrations/", import.meta.url);
  const entries = pendingMigrations(await readdir(source), []);
  const ordered = [...entries].sort((a, b) =>
    netlifyMigrationSlug(a.name).localeCompare(netlifyMigrationSlug(b.name)),
  );
  assert.equal(netlifyMigrationSlug("0035_tryout_evaluations.sql"), "0035_tryout-evaluations");
  assert.equal(
    netlifyMigrationSlug("0030_fundraising_publication_consent.sql"),
    "0036_fundraising-publication-consent",
  );
  assert.equal(
    netlifyMigrationSlug("0034_tryout_notice_delivery.sql"),
    "0040_tryout-notice-delivery",
  );
  const db = new PGlite();
  try {
    const baseline = ordered.filter(
      ({ name }) => Number(netlifyMigrationSlug(name).split("_")[0]) <= 35,
    );
    const late = ordered.filter(
      ({ name }) => Number(netlifyMigrationSlug(name).split("_")[0]) > 35,
    );
    for (const { name } of baseline)
      await db.exec(wrapMigration(name, await readFile(new URL(name, source), "utf8")));
    for (const { name } of late) {
      const sql = wrapMigration(name, await readFile(new URL(name, source), "utf8"));
      await db.exec(sql);
      await db.exec(sql);
    }
    assert.equal(
      (await db.query("select count(*)::int as count from _migrations")).rows[0].count,
      entries.length,
    );
    assert.ok(
      (
        await db.query(
          "select name from _migrations where name='0030_fundraising_publication_consent.sql'",
        )
      ).rows.length,
    );
  } finally {
    await db.close();
  }
});

for (const baselineVersion of [66, 76, 79])
  test(`lifecycle migrations upgrade release ${baselineVersion} with original ledger/data preserved`, async () => {
    const source = new URL("../migrations/", import.meta.url);
    const entries = pendingMigrations(await readdir(source), []).sort((a, b) =>
      netlifyMigrationSlug(a.name).localeCompare(netlifyMigrationSlug(b.name)),
    );
    assert.equal(netlifyMigrationSlug("0072_operational_people.sql"), "0078_operational-people");
    assert.equal(netlifyMigrationSlug("0074_operational_content.sql"), "0079_operational-content");
    assert.equal(
      netlifyMigrationSlug("0075_operational_services.sql"),
      "0075_operational-services",
    );
    assert.equal(
      netlifyMigrationSlug("0076_operational_instruction_access.sql"),
      "0076_operational-instruction-access",
    );
    assert.equal(
      new Set(entries.map(({ name }) => netlifyMigrationSlug(name).split("_")[0])).size,
      entries.length,
    );
    const db = new PGlite();
    try {
      for (const { name } of entries.filter(
        ({ name }) => Number(netlifyMigrationSlug(name).split("_")[0]) <= baselineVersion,
      ))
        await db.exec(wrapMigration(name, await readFile(new URL(name, source), "utf8")));
      await db.exec("update club_services set detail='preserved preview edit' where id='m1'");
      const before = (await db.query("select * from finance_state order by id")).rows;
      const late = entries.filter(
        ({ name }) => Number(netlifyMigrationSlug(name).split("_")[0]) > baselineVersion,
      );
      if (baselineVersion === 76)
        assert.deepEqual(
          late.map(({ name }) => name),
          [
            "0077_financial_basis_activation.sql",
            "0072_operational_people.sql",
            "0074_operational_content.sql",
            "0080_retire_blanket_delivery.sql",
            "0081_coordinator_scoped_transition.sql",
            "0082_coordinator_recruiting_workflow.sql",
            "0083_coordinator_review_runs.sql",
          ],
        );
      for (const { name } of late) {
        const sql = wrapMigration(name, await readFile(new URL(name, source), "utf8"));
        await db.exec(sql);
        await db.exec(sql);
      }
      assert.equal(
        (await db.query("select count(*)::int as count from _migrations")).rows[0].count,
        entries.length,
      );
      assert.deepEqual((await db.query("select * from finance_state order by id")).rows, before);
      assert.equal(
        (await db.query("select detail from club_services where id='m1'")).rows[0].detail,
        "preserved preview edit",
      );
      assert.equal(
        (await db.query("select count(*)::int as count from organization_operational_access"))
          .rows[0].count,
        0,
      );
      assert.equal(
        (await db.query("select count(*)::int as count from financial_basis_state")).rows[0].count,
        0,
      );
    } finally {
      await db.close();
    }
  });
