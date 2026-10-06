import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import {
  publicationGate,
  publicFields,
  recordConsent,
  publicationPlayers,
  publishedPlayer,
} from "./publication";
test("publication requires explicit owner consent, approval and active status; withdrawal survives admin resume", async () => {
  const pg = new PGlite();
  const sql = {
    query: async (text: string, params: unknown[] = []) => (await pg.query(text, params)).rows,
  } as Sql;
  try {
    await pg.exec(
      `CREATE TABLE "user"(id text PRIMARY KEY); INSERT INTO "user" VALUES('owner'),('other'),('admin');`,
    );
    for (const name of [
      "0027_player_fundraising.sql",
      "0030_fundraising_publication_consent.sql",
      "0031_fundraising_roster_links.sql",
    ])
      await pg.exec(
        await readFile(new URL("../../../migrations/" + name, import.meta.url), "utf8"),
      );
    await pg.exec(
      `INSERT INTO fundraising_players(id,owner_id,parent_email,name,team,goal,story,approved,active,created) VALUES('page','owner','private@test.invalid','Player','13U',10000,'Story',1,1,'2026-10-06');`,
    );
    const visible = async () =>
      (await sql.query(`SELECT p.* FROM fundraising_players p WHERE ${publicationGate}`)).length;
    assert.equal(await visible(), 0, "legacy approval is not consent");
    await assert.rejects(recordConsent(sql, "page", "other", "accept"));
    await recordConsent(sql, "page", "owner", "accept");
    assert.equal(await visible(), 1);
    const publicRows = await publicationPlayers(sql, "home");
    assert.equal(publicRows.length, 1);
    assert.deepEqual(Object.keys(publicRows[0]), [
      "id",
      "name",
      "team",
      "goal",
      "story",
      "raised",
      "sponsors",
    ]);
    assert.equal((await publicationPlayers(sql, "my", "other")).length, 0);
    assert.equal((await publicationPlayers(sql, "my", "owner"))[0].publication_allowed, true);
    assert.ok(await publishedPlayer(sql, "page"));
    await pg.exec("UPDATE fundraising_players SET approved=0");
    assert.equal(await visible(), 0);
    await pg.exec("UPDATE fundraising_players SET approved=1,active=0");
    assert.equal(await visible(), 0);
    await pg.exec("UPDATE fundraising_players SET active=1");
    await assert.rejects(recordConsent(sql, "page", "other", "withdraw"));
    assert.equal(await visible(), 1);
    await recordConsent(sql, "page", "owner", "withdraw");
    assert.equal(await visible(), 0);
    await pg.exec("UPDATE fundraising_players SET active=1,approved=1");
    assert.equal(await publishedPlayer(sql, "page"), null);
    assert.equal((await publicationPlayers(sql, "home")).length, 0);
    assert.equal((await publicationPlayers(sql, "my", "owner"))[0].publication_allowed, false);
    assert.equal(await visible(), 0);
    await recordConsent(sql, "page", "owner", "accept");
    assert.equal(await visible(), 1);
    await recordConsent(sql, "page", "admin", "invalidate");
    assert.equal(await visible(), 0);
    const events = await sql.query("SELECT action FROM fundraising_consent_events ORDER BY id");
    assert.deepEqual(
      events.map((e) => e.action),
      ["accept", "withdraw", "accept", "invalidate"],
    );
    const row = (await sql.query("SELECT * FROM fundraising_players"))[0];
    assert.deepEqual(Object.keys(publicFields({ ...row, raised: 0, sponsors: 0 })), [
      "id",
      "name",
      "team",
      "goal",
      "story",
      "raised",
      "sponsors",
    ]);
    assert.equal("parent_email" in publicFields(row), false);
    await assert.rejects(
      pg.transaction(async (tx) => {
        const txsql = {
          query: async (text: string, params: unknown[] = []) =>
            (await tx.query(text, params)).rows,
        } as Sql;
        await recordConsent(txsql, "page", "owner", "accept");
        throw new Error("abort");
      }),
    );
    assert.equal(await visible(), 0, "rolled-back confirmation does not publish");
  } finally {
    await pg.close();
  }
});
