import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { wrapMigration } from "./netlify-migrations.mjs";
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
