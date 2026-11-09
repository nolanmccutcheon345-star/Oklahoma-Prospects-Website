import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isTargetAccountRowLock } from "./account-lock-checkpoint.mjs";

test("account checkpoint recognizes the actual assignment lock despite identity projection changes", async () => {
  const source = await readFile(
    new URL("../src/lib/coordinator/admin.server.ts", import.meta.url),
    "utf8",
  );
  const query = source.match(/`(select[^`]+where u\.id=\$\{input\.userId\} for update of u)`/)?.[1];
  assert.ok(query, "The assignment must retain its target-account FOR UPDATE query.");
  const statement = query.replace("${input.userId}", "$1");
  assert.equal(isTargetAccountRowLock(statement, ["synthetic-target"], "synthetic-target"), true);
  assert.equal(isTargetAccountRowLock(statement, ["different-target"], "synthetic-target"), false);
  assert.equal(
    isTargetAccountRowLock(
      statement.replace("for update of u", "for share of u"),
      ["synthetic-target"],
      "synthetic-target",
    ),
    false,
  );
  assert.equal(
    isTargetAccountRowLock(
      statement.replace("for update of u", ""),
      ["synthetic-target"],
      "synthetic-target",
    ),
    false,
  );
});

test("account checkpoint tolerates projection and whitespace but rejects unrelated locks", () => {
  const statements = [
    'select lower(trim(u.email)) as email from "user" u where u.id=$1 for update of u',
    ' SELECT u.name, u."disabledAt" IS NULL as eligible\n FROM "user" u WHERE u.id=$1 FOR UPDATE OF u ',
  ];
  for (const statement of statements)
    assert.equal(isTargetAccountRowLock(statement, ["target"], "target"), true);
  for (const statement of [
    'select u.id from "user" u where u.id=$2 for update of u',
    "select u.id from profiles u where u.id=$1 for update of u",
    'select u.id from "user" u where u.id=$1 for share of u',
  ])
    assert.equal(isTargetAccountRowLock(statement, ["target"], "target"), false);
});
