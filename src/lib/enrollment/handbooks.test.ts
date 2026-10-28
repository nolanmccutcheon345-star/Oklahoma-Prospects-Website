import { enrollmentFixture, standards } from "./test-fixture";
import test from "node:test";
import assert from "node:assert/strict";
import {
  seedHandbooks,
  handbookWorkspace,
  saveHandbook,
  saveTeamStandards,
  publicHandbooks,
} from "./handbooks.server";
import { emptyReview, reviewedForSignatures } from "./contracts";

test("handbook drafts, ownership, scoped team standards, immutable publication and conflict handling", async () => {
  const { db, sql } = await enrollmentFixture();
  try {
    await assert.rejects(seedHandbooks(sql, "fake"), /Owner/);
    await seedHandbooks(sql, "owner");
    await seedHandbooks(sql, "owner");
    assert.equal((await handbookWorkspace(sql, "owner")).documents.length, 4);
    assert.deepEqual(await publicHandbooks(sql), []);
    const draft = (await handbookWorkspace(sql, "owner")).documents.find(
      (d) => d.documentId === "academy-2027",
    )!;
    const input = {
      documentId: draft.documentId,
      version: 1,
      revision: 0,
      action: "publish",
      effectiveOn: "2026-01-01",
      content: draft.content,
      review: emptyReview,
    };
    await assert.rejects(saveHandbook(sql, "coach", input), /Owner/);
    await saveHandbook(sql, "owner", input);
    const published = (await publicHandbooks(sql))[0];
    assert.equal(published.version, 1);
    await assert.rejects(
      sql`update handbook_versions set content='{}' where document_id='academy-2027' and version=1`,
      /immutable/,
    );
    await assert.rejects(saveHandbook(sql, "owner", input), /changed/);
    await saveHandbook(sql, "owner", {
      ...input,
      revision: 1,
      action: "draft",
      content: { ...draft.content, title: "Changed title" },
    });
    assert.equal((await publicHandbooks(sql))[0].content.title, draft.content.title);
    const teamInput = {
      teamId: "base",
      version: 0,
      revision: 0,
      action: "draft",
      effectiveOn: "2026-01-01",
      standards,
    };
    await assert.rejects(saveTeamStandards(sql, "othercoach", teamInput), /available/);
    await assert.rejects(saveTeamStandards(sql, "guardian", teamInput), /permission/);
    await saveTeamStandards(sql, "coach", teamInput);
    await assert.rejects(
      saveTeamStandards(sql, "coach", { ...teamInput, version: 1, action: "publish" }),
      /owner/,
    );
    await saveTeamStandards(sql, "owner", { ...teamInput, version: 1, action: "publish" });
    assert.equal(
      (await handbookWorkspace(sql, "guardian")).documents.filter((d) => d.kind === "team").length,
      1,
    );
    assert.equal(
      (await handbookWorkspace(sql, "stranger")).documents.filter((d) => d.kind === "team").length,
      0,
    );
    const c = await handbookWorkspace(sql, "coordinator");
    assert.equal(c.teams.length, 1);
    assert.equal(c.teams[0].id, "soft");
    await assert.rejects(saveTeamStandards(sql, "coordinator", teamInput), /available/);
    await saveTeamStandards(sql, "coordinator", { ...teamInput, teamId: "soft" });
    await sql`update coordinator_assignments set status='suspended' where user_id='coordinator'`;
    await assert.rejects(
      saveTeamStandards(sql, "coordinator", { ...teamInput, teamId: "soft", version: 1 }),
      /available/,
    );
    const snapshot = JSON.stringify(c);
    assert.ok(!snapshot.includes("feeLock"));
    assert.ok(!snapshot.includes('"payments":'));
    await sql`update "user" set "disabledAt"=now() where id='coach'`;
    await assert.rejects(handbookWorkspace(sql, "coach"), /authorized/);
  } finally {
    await db.close();
  }
});
test("review evidence requires named reviewers, valid past dates and a reference", () => {
  assert.equal(reviewedForSignatures(emptyReview, "2026-10-24"), false);
  const review = {
    legalReviewer: "Synthetic lawyer",
    legalReviewedOn: "2026-10-24",
    insuranceReviewer: "Synthetic insurer",
    insuranceReviewedOn: "2026-10-24",
    reviewReference: "Synthetic review only",
  };
  assert.equal(reviewedForSignatures(review, "2026-10-24"), true);
  assert.equal(
    reviewedForSignatures({ ...review, legalReviewedOn: "2027-01-01" }, "2026-10-24"),
    false,
  );
});
