import { createHash } from "node:crypto";

export type DatabaseFingerprint = {
  source: "postgres" | "pglite" | "unconfigured";
  fingerprint: string | null;
};

/**
 * Comparing public deployment fingerprints is a read-only prerequisite, not
 * authorization to perform a mutation. Only the *destination* is hashed.
 * Never hash the complete URI: different credentials can target the SAME DB.
 */
export function databaseDestinationFingerprint(connectionString?: string): DatabaseFingerprint {
  if (!connectionString?.trim()) return { source: "unconfigured", fingerprint: null };
  let url: URL;
  try {
    url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname)
      return { source: "unconfigured", fingerprint: null };
  } catch {
    return { source: "unconfigured", fingerprint: null };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const port = url.port || "5432";
  const database = decodeURIComponent(url.pathname).replace(/^\//, "");
  if (!database) return { source: "unconfigured", fingerprint: null };
  // Do not incorporate user, password, Netlify context or deployment identity.
  // Branches at the same database endpoint must intentionally compare equal.
  const destination = ["postgres", host, port, database].join("\u0000");
  return {
    source: "postgres",
    fingerprint: createHash("sha256").update(destination).digest("hex"),
  };
}

/** No persistent database exists when running the embedded fallback. */
export const missingPersistentFingerprint: DatabaseFingerprint = {
  source: "pglite",
  fingerprint: null,
};
