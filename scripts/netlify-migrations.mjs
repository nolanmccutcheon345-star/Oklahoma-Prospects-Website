import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./with-app-env.mjs";
import { pendingMigrations } from "./migration-plan.mjs";

export function wrapMigration(name, sql) {
  if (!/^\d+_[a-z0-9_]+\.sql$/.test(name)) throw new Error("Invalid migration filename");
  return `-- Generated from migrations/${name}; do not edit this copy.\nCREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());\nDO $netlify_apply$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '${name}') THEN\n${sql}\n    INSERT INTO _migrations (name) VALUES ('${name}');\n  END IF;\nEND\n$netlify_apply$;\n`;
}

export async function prepareNetlifyMigrations(root) {
  const source = join(root, "migrations");
  const entries = pendingMigrations(await readdir(source), []);
  for (const { name } of entries) {
    const slug = name.replace(/\.sql$/, "").replaceAll("_", "-").replace("-", "_");
    const target = join(root, "netlify/database/migrations", slug);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "migration.sql"), wrapMigration(name, await readFile(join(source, name), "utf8")));
  }
  return entries.length;
}

if (isMainModule(import.meta.url) && process.env.NETLIFY) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  console.log(`[migrations] Prepared ${await prepareNetlifyMigrations(root)} Netlify release migrations; no database was modified.`);
}
