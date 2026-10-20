import { execFileSync } from "node:child_process";
import { readFileSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { netlifyMigrationSlug, wrapMigration } from "./netlify-migrations.mjs";
function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}
/** Build-generated mirrors are accepted only when byte-identical to a tracked source.
 * Untracked source, changed tracked files, arbitrary artifacts and symlinks fail closed. */
export function sourceCheckoutClean(root = process.cwd()) {
  try {
    const changes = git(root, ["status", "--porcelain", "-z", "--untracked-files=all"])
      .split("\0")
      .filter(Boolean);
    if (!changes.length) return true;
    const sources = git(root, ["ls-files", "-z", "migrations/*.sql"]).split("\0").filter(Boolean);
    const mirrors = new Map(
      sources.map((path) => {
        const name = path.slice("migrations/".length);
        return [
          "netlify/database/migrations/" + netlifyMigrationSlug(name) + "/migration.sql",
          { path, name },
        ];
      }),
    );
    return changes.every((entry) => {
      if (!entry.startsWith("?? ")) return false;
      const path = entry.slice(3),
        source = mirrors.get(path);
      if (
        !source ||
        !lstatSync(join(root, path)).isFile() ||
        !lstatSync(join(root, source.path)).isFile()
      )
        return false;
      return (
        readFileSync(join(root, path), "utf8") ===
        wrapMigration(source.name, readFileSync(join(root, source.path), "utf8"))
      );
    });
  } catch {
    return false;
  }
}
export function reviewedReleaseIdentity({ command, mode, root = process.cwd() }) {
  const denied = { commit: "", dirty: true };
  if (command !== "build" || mode !== "production") return denied;
  try {
    const manifest = JSON.parse(readFileSync(join(root, "public/release.json"), "utf8")),
      commit = git(root, ["rev-parse", "HEAD"]).trim();
    if (
      !/^[a-f0-9]{40}$/.test(commit) ||
      manifest.commit !== commit ||
      manifest.dirty !== false ||
      !sourceCheckoutClean(root)
    )
      return denied;
    return { commit, dirty: false };
  } catch {
    return denied;
  }
}
