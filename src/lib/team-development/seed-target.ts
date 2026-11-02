/**
 * Where the Team Development seed may be imported. Production is never a target.
 * - local:   an in-memory PGlite with every migration applied (validation run).
 * - preview: PREVIEW_DATABASE_URL in a Netlify deploy-preview/branch-deploy context,
 *            distinct from every production database variable, with an explicit
 *            TEAM_DEV_SEED_CONFIRM=preview-only.
 */
export type SeedTarget = { kind: "local" } | { kind: "preview"; databaseUrl: string };

const PRODUCTION_VARS = ["DATABASE_URL", "NETLIFY_DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED", "PRODUCTION_DATABASE_URL"] as const;

function host(url: string) {
  try { return new URL(url).host.toLowerCase(); } catch { return ""; }
}

export function resolveSeedTarget(env: Record<string, string | undefined>): SeedTarget {
  const context = (env.CONTEXT || "").trim();
  if (context === "production" || env.NODE_ENV === "production")
    throw new Error("Refusing: the Team Development seed never runs in a production context.");
  const target = (env.TEAM_DEV_SEED_TARGET || "").trim();
  if (target === "local") return { kind: "local" };
  if (target !== "preview") throw new Error("Set TEAM_DEV_SEED_TARGET=local or TEAM_DEV_SEED_TARGET=preview.");
  if (!["deploy-preview", "branch-deploy"].includes(context))
    throw new Error("Refusing: preview seeding requires CONTEXT=deploy-preview or branch-deploy.");
  if (env.TEAM_DEV_SEED_CONFIRM !== "preview-only") throw new Error("Refusing: set TEAM_DEV_SEED_CONFIRM=preview-only.");
  const databaseUrl = (env.PREVIEW_DATABASE_URL || "").trim();
  if (!databaseUrl || !host(databaseUrl)) throw new Error("Refusing: PREVIEW_DATABASE_URL is required.");
  for (const name of PRODUCTION_VARS) {
    const value = (env[name] || "").trim();
    if (value && (value === databaseUrl || host(value) === host(databaseUrl)))
      throw new Error(`Refusing: PREVIEW_DATABASE_URL matches ${name}.`);
  }
  return { kind: "preview", databaseUrl };
}
