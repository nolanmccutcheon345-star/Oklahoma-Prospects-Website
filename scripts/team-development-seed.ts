/**
 * Idempotent Team Development seed import (DRAFT + ESTIMATE only; nothing becomes
 * assignable). Never runs against production. See src/lib/team-development/seed-target.ts.
 *
 *   TEAM_DEV_SEED_TARGET=local npx tsx scripts/team-development-seed.ts
 *   CONTEXT=deploy-preview TEAM_DEV_SEED_TARGET=preview TEAM_DEV_SEED_CONFIRM=preview-only \
 *     PREVIEW_DATABASE_URL=... npx tsx scripts/team-development-seed.ts
 */
import { readFile, readdir } from "node:fs/promises";
import { resolveSeedTarget } from "../src/lib/team-development/seed-target";
import type { Sql } from "../src/lib/db";
import type { TeamDevSeedRecord } from "../src/lib/team-development/contracts";

const ACTOR = "seed:team-development-cli";

async function localSql(): Promise<{ sql: Sql; close: () => Promise<void> }> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  for (const f of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + f, "utf8"));
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (p: TemplateStringsArray, ...v: unknown[]) =>
      (await query(p.reduce((s, x, i) => s + (i ? `$${i}` : "") + x, ""), v)).rows) as Sql;
    sql.query = (async (q: string, v: unknown[] = []) => (await query(q, v)).rows) as Sql["query"];
    sql.transaction = (work) => db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  return { sql: wrap(db.query.bind(db)), close: () => db.close() };
}

async function previewSql(databaseUrl: string): Promise<{ sql: Sql; close: () => Promise<void> }> {
  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const wrap = (run: (text: string, values: unknown[]) => Promise<unknown[]>): Sql => {
    const sql = (async (p: TemplateStringsArray, ...v: unknown[]) =>
      run(p.reduce((s, x, i) => s + (i ? `$${i}` : "") + x, ""), v)) as Sql;
    sql.query = ((q: string, v: unknown[] = []) => run(q, v)) as Sql["query"];
    sql.transaction = async (work) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await work(wrap(async (t, v) => (await client.query(t, v)).rows));
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    };
    return sql;
  };
  return { sql: wrap(async (t, v) => (await pool.query(t, v)).rows), close: () => pool.end() };
}

const target = resolveSeedTarget(process.env);
const records = JSON.parse(
  await readFile(new URL("../src/lib/team-development/seed/appendix-8617b2b.json", import.meta.url), "utf8"),
) as TeamDevSeedRecord[];
const { importTeamDevelopmentSeedAs } = await import("../src/lib/team-development/store.server");
const db = target.kind === "local" ? await localSql() : await previewSql(target.databaseUrl);
try {
  const result = await importTeamDevelopmentSeedAs(db.sql, ACTOR, records);
  console.log(JSON.stringify({ target: target.kind, records: records.length, ...result }, null, 2));
  if (result.rejected.length) process.exitCode = 1;
} finally {
  await db.close();
}
