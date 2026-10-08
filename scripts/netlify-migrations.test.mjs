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
      for (const { name } of entries) await db.exec(wrapMigration(name, await readFile(new URL(name, source), "utf8")));
    };
    await apply();
    await db.exec("UPDATE club_services SET detail = 'preserved club edit' WHERE id = 'm1'");
    await apply();
    assert.equal((await db.query("SELECT count(*)::int AS count FROM _migrations")).rows[0].count, entries.length);
    assert.equal((await db.query("SELECT detail FROM club_services WHERE id = 'm1'")).rows[0].detail, "preserved club edit");
  } finally { await db.close(); }
});

test('late PR migrations append after deployed version 35 without changing ledger keys', async () => {
  const source = new URL('../migrations/', import.meta.url);
  const entries = pendingMigrations(await readdir(source), []);
  const ordered = [...entries].sort((a, b) => netlifyMigrationSlug(a.name).localeCompare(netlifyMigrationSlug(b.name)));
  assert.equal(netlifyMigrationSlug('0035_tryout_evaluations.sql'), '0035_tryout-evaluations');
  assert.equal(netlifyMigrationSlug('0030_fundraising_publication_consent.sql'), '0036_fundraising-publication-consent');
  assert.equal(netlifyMigrationSlug('0034_tryout_notice_delivery.sql'), '0040_tryout-notice-delivery');
  const db = new PGlite();
  try {
    const baseline = ordered.filter(({name}) => Number(netlifyMigrationSlug(name).split('_')[0]) <= 35);
    const late = ordered.filter(({name}) => Number(netlifyMigrationSlug(name).split('_')[0]) > 35);
    for (const {name} of baseline) await db.exec(wrapMigration(name, await readFile(new URL(name, source), 'utf8')));
    for (const {name} of late) {
      const sql = wrapMigration(name, await readFile(new URL(name, source), 'utf8'));
      await db.exec(sql);
      await db.exec(sql);
    }
    assert.equal((await db.query('select count(*)::int as count from _migrations')).rows[0].count, entries.length);
    assert.ok((await db.query("select name from _migrations where name='0030_fundraising_publication_consent.sql'")).rows.length);
  } finally { await db.close(); }
});
