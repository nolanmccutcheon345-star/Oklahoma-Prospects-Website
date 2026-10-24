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
      const masterBefore = (await db.query("select * from team_budget_master order by id")).rows;
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
            "0084_coordinator_granular_intake_reports.sql",
            "0085_coordinator_program_events.sql",
            "0086_coordinator_tryout_events.sql",
            "0087_coordinator_audit_context.sql",
            "0088_coordinator_program_reviews.sql",
            "0089_coordinator_roster_eligibility.sql",
            "0090_coordinator_content_publication.sql",
            "0091_coordinator_communications.sql",
            "0092_coordinator_player_publication.sql",
            "0093_coordinator_program_notices.sql",
            "0094_coordinator_recovery.sql",
            "0095_coordinator_security_archive.sql",
            "0096_coordinator_provider_backup_reviews.sql",
            "0097_shop_collections.sql",
            "0098_athlete_registration_profiles.sql",
            "0099_team_pricing_defaults.sql",
            "0100_team_development.sql",
            "0101_membership_presentation_homepage.sql",
            "0102_prospects_journal.sql",
            "0103_journal_launch_drafts.sql",
            "0104_website_about.sql",
            "0105_handbook_versions.sql",
            "0106_guided_enrollment.sql",
            "0107_season_progress.sql",
            "0108_organization_enrollment.sql",
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
      assert.deepEqual(
        (await db.query("select * from team_budget_master order by id")).rows,
        masterBefore,
        "release configuration must not rewrite saved master snapshots",
      );
      assert.deepEqual(
        (await db.query("select payload from team_pricing_default_releases where version=1"))
          .rows[0].payload,
        {
          membershipMonthly: 8000,
          poMembershipMonthly: 8000,
          contingencyBps: 1250,
          eventPaymentSchedule: { percentages: [7000, 1500, 1500], weeksBefore: [14, 10, 6] },
        },
      );
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

test("shop collection upgrade preserves published products and pricing while assigning explicit legacy categories", async () => {
  const source = new URL("../migrations/", import.meta.url);
  const entries = pendingMigrations(await readdir(source), []);
  const db = new PGlite();
  try {
    for (const { name } of entries.filter((e) => e.name !== "0097_shop_collections.sql"))
      await db.exec(wrapMigration(name, await readFile(new URL(name, source), "utf8")));
    await db.exec(
      `insert into shop_products(id,title,category,image_url,variants,updated_by,published,sample_approved,revision) values('preserved-cap','Preserved cap','Caps','https://example.invalid/cap.png','[{"id":1,"priceCents":4200}]','synthetic',true,true,9)`,
    );
    await db.exec("update shop_settings set default_markup_bps=7500,revision=8 where id=1");
    const before = (
      await db.query(
        "select id,title,category,variants,published,sample_approved,revision from shop_products order by id",
      )
    ).rows;
    const upgrade = wrapMigration(
      "0097_shop_collections.sql",
      await readFile(new URL("0097_shop_collections.sql", source), "utf8"),
    );
    await db.exec(upgrade);
    await db.exec(upgrade);
    assert.deepEqual(
      (
        await db.query(
          "select id,title,category,variants,published,sample_approved,revision from shop_products order by id",
        )
      ).rows,
      before,
    );
    const [cap] = (
      await db.query(
        "select collection_ids,coming_soon from shop_products where id='preserved-cap'",
      )
    ).rows;
    assert.deepEqual(cap.collection_ids, ["hats"]);
    assert.equal(cap.coming_soon, false);
    const [settings] = (await db.query("select * from shop_settings where id=1")).rows;
    assert.equal(settings.default_markup_bps, 7500);
    assert.equal(settings.revision, 8);
    assert.equal(settings.navigation[0].options[0].label, "Hats");
  } finally {
    await db.close();
  }
});
