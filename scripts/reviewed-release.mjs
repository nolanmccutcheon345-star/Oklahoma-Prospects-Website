import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
export function reviewedReleaseIdentity({ command, mode, root = process.cwd() }) {
  const denied = { commit: "", dirty: true };
  if (command !== "build" || mode !== "production") return denied;
  try {
    const manifest = JSON.parse(readFileSync(join(root, "public/release.json"), "utf8"));
    const git = (args) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    const commit = git(["rev-parse", "HEAD"]);
    if (
      !/^[a-f0-9]{40}$/.test(commit) ||
      manifest.commit !== commit ||
      manifest.dirty !== false ||
      git(["status", "--porcelain", "--untracked-files=all"])
    )
      return denied;
    return { commit, dirty: false };
  } catch {
    return denied;
  }
}
