import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./with-app-env.mjs";
import { pendingMigrations } from "./migration-plan.mjs";

export function wrapMigration(name, sql) {
  if (!/^\d+_[a-z0-9_]+\.sql$/.test(name)) throw new Error("Invalid migration filename");
  return `-- Generated from migrations/${name}; do not edit this copy.\nCREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());\nDO $netlify_apply$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '${name}') THEN\n${sql}\n    INSERT INTO _migrations (name) VALUES ('${name}');\n  END IF;\nEND\n$netlify_apply$;\n`;
}

// These PR migrations arrived after 0035 had already been published. Keep the
// application ledger keys intact, but append their Netlify versions after 35.
const lateVersions = {
  '0028_staff_directory.sql': '0041',
  '0030_fundraising_publication_consent.sql': '0036',
  '0031_fundraising_roster_links.sql': '0037',
  '0032_tryout_events.sql': '0038',
  '0033_tryout_enrollment.sql': '0039',
  '0034_tryout_notice_delivery.sql': '0040',
};
export function netlifyMigrationSlug(name) {
  const versioned = lateVersions[name] ? name.replace(/^\d+/, lateVersions[name]) : name;
  return versioned.replace(/\.sql$/, '').replaceAll('_', '-').replace('-', '_');
}

export async function prepareNetlifyMigrations(root) {
  const source = join(root, "migrations");
  const entries = pendingMigrations(await readdir(source), []);
  const versions = entries.map(({ name }) => netlifyMigrationSlug(name).split('_')[0]);
  if (new Set(versions).size !== versions.length) throw new Error('Duplicate Netlify migration version; allocate a new append-only version.');
  for (const { name } of entries) {
    const slug = netlifyMigrationSlug(name);
    if (lateVersions[name]) {
      const oldSlug = name.replace(/\.sql$/, '').replaceAll('_', '-').replace('-', '_');
      const oldPath = join(root, 'netlify/database/migrations', oldSlug);
      const oldSql = await readFile(join(oldPath, 'migration.sql'), 'utf8').catch(error => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
      if (oldSql !== null) {
        if (!oldSql.startsWith(`-- Generated from migrations/${name}; do not edit this copy.\n`)) throw new Error(`Refusing to remove non-generated migration ${oldSlug}`);
        await rm(join(oldPath, 'migration.sql'));
        // Remove only an empty generated directory, never other files.
        if ((await readdir(oldPath)).length === 0) await rm(oldPath, { recursive: true });
      }
    }
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
