import { getConnectionString, MissingDatabaseConnectionError } from "@netlify/database";

type Environment = Record<string, string | undefined>;

/** Explicit previews stay isolated; Netlify supplies its own isolated database branch. */
export function configuredDatabaseUrl(
  env: Environment,
  nativeConnection: () => string = getConnectionString,
): string | undefined {
  const preview = Boolean(env.CONTEXT && env.CONTEXT !== "production" && env.CONTEXT !== "dev");
  const explicit = preview ? env.PREVIEW_DATABASE_URL : (env.DATABASE_URL || env.NETLIFY_DATABASE_URL);
  if (explicit?.trim()) return explicit.trim();

  // Native Netlify Database uses its runtime binding, not DATABASE_URL.
  // Its SDK resolves the branch attached to this deploy without exporting credentials.
  try {
    return nativeConnection().trim() || undefined;
  } catch (error) {
    if (error instanceof MissingDatabaseConnectionError) return undefined;
    throw error;
  }
}
