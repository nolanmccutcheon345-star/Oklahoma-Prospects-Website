import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { reviewedReleaseIdentity } from "./reviewed-release.mjs";
test("grant build identity rejects development, stale manifests, tracked and untracked source", async () => {
  const root = await mkdtemp(join(tmpdir(), "release-seal-"));
  try {
    const git = (args) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    git(["init"]);
    await mkdir(join(root, "public"));
    await writeFile(join(root, ".gitignore"), "public/release.json\n");
    await writeFile(join(root, "source.ts"), "export const ok=true;");
    git(["add", "."]);
    git([
      "-c",
      "user.name=Synthetic",
      "-c",
      "user.email=synthetic@example.invalid",
      "commit",
      "-m",
      "fixture",
    ]);
    const commit = git(["rev-parse", "HEAD"]);
    const check = (command = "build", mode = "production") =>
      reviewedReleaseIdentity({ root, command, mode });
    await writeFile(join(root, "public/release.json"), JSON.stringify({ commit, dirty: false }));
    assert.deepEqual(check(), { commit, dirty: false });
    assert.equal(check("serve").dirty, true);
    assert.equal(check("build", "development").dirty, true);
    await writeFile(join(root, "new.ts"), "untracked source");
    assert.equal(check().dirty, true);
    await rm(join(root, "new.ts"));
    await writeFile(join(root, "source.ts"), "changed");
    assert.equal(check().dirty, true);
    git(["checkout", "--", "source.ts"]);
    await writeFile(
      join(root, "public/release.json"),
      JSON.stringify({ commit: "a".repeat(40), dirty: false }),
    );
    assert.equal(check().dirty, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("only exact generated Netlify mirrors of tracked migration sources preserve the release seal", async () => {
  const root = await mkdtemp(join(tmpdir(), "release-mirror-"));
  try {
    const git = (args) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    git(["init"]);
    await mkdir(join(root, "public"));
    await mkdir(join(root, "migrations"));
    await writeFile(join(root, ".gitignore"), "public/release.json\n");
    const source = "select 1;\n";
    await writeFile(join(root, "migrations/0001_fixture.sql"), source);
    git(["add", "."]);
    git([
      "-c",
      "user.name=Synthetic",
      "-c",
      "user.email=synthetic@example.invalid",
      "commit",
      "-m",
      "fixture",
    ]);
    const commit = git(["rev-parse", "HEAD"]);
    await writeFile(join(root, "public/release.json"), JSON.stringify({ commit, dirty: false }));
    const { wrapMigration } = await import("./netlify-migrations.mjs");
    const folder = join(root, "netlify/database/migrations/0001_fixture");
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "migration.sql"), wrapMigration("0001_fixture.sql", source));
    const check = () => reviewedReleaseIdentity({ root, command: "build", mode: "production" });
    assert.deepEqual(check(), { commit, dirty: false });
    await writeFile(join(folder, "migration.sql"), wrapMigration("0001_fixture.sql", "select 2;"));
    assert.equal(check().dirty, true);
    await writeFile(join(folder, "migration.sql"), wrapMigration("0001_fixture.sql", source));
    await writeFile(join(folder, "extra.sql"), "select 3;");
    assert.equal(check().dirty, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
