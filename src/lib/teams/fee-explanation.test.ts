import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { enrollmentFixture } from "../enrollment/test-fixture";
import { defaultBudget, calculateFees, type FeeBudget } from "./fee-model";
import {
  emptyFeeExplanation,
  feeExplanationSchema,
  feeExplanationIssues,
  feeExplanationText,
} from "./fee-explanation";
import { acceptedFeeAgreement } from "./fee-explanation.server";
import { mutateFeePlan, feeWorkspace } from "./fee.server";
import { independentWorkspace, independentExport } from "./independent.server";
import { independentPublishedPolicy } from "./independent-model";
import type { FeePlan } from "./fee-contracts";

const explanation = () => ({
  initialDeposit: "Uniform package and agreed coaching.\n• Two jerseys\n• One hat",
  monthlyDues: "Scheduled team indoor practice.",
  teamExpenses: "Tournament entries and independently arranged team travel.",
  additionalNotes: "Coach will explain fundraising. <script>literal text only</script>",
});
const budget = (): FeeBudget => ({
  ...defaultBudget(),
  fundingModel: "independent",
  processingBps: 0,
  processingFixed: 0,
  policy: "Synthetic withdrawal and refund policy.",
  parentExplanation: explanation(),
  independent: {
    seasonKey: randomUUID(),
    uniformDeposit: 70000,
    monthlyDues: 14900,
    uniformDue: "2098-01-01",
    firstDue: "2098-02-01",
    billingDay: 1,
    lastDue: "2098-06-01",
    seasonEnd: "2098-06-30",
    processingExplanation: "No processing fee.",
  },
});

test("explanations validate publication content without affecting money or injecting private costs", () => {
  assert.equal(feeExplanationIssues().length, 3);
  assert.equal(feeExplanationIssues(emptyFeeExplanation()).length, 3);
  assert.deepEqual(
    feeExplanationIssues({ ...explanation(), teamExpenses: "None currently planned" }),
    [],
  );
  assert.throws(() =>
    feeExplanationSchema.parse({ ...explanation(), initialDeposit: "x".repeat(4001) }),
  );
  assert.throws(() => feeExplanationSchema.parse({ ...explanation(), privateCost: 10000 }));
  const b = budget();
  assert.deepEqual(calculateFees(b), calculateFees({ ...b, parentExplanation: undefined }));
  assert.match(feeExplanationText(b.parentExplanation), /• Two jerseys\n• One hat/);
  assert.ok(independentPublishedPolicy(b).includes(feeExplanationText(b.parentExplanation)));
});

test("draft, publish, acceptance and authenticated downloads keep fee explanations scoped and immutable", async () => {
  const f = await enrollmentFixture(),
    { sql } = f;
  try {
    const b = budget();
    const saved = async () =>
      (await sql<{ payload: FeePlan }>`select payload from team_fee_plans where team_id='base'`)[0]
        .payload;
    const save = async (revision: number, value: FeeBudget, actor = "owner") =>
      mutateFeePlan(sql, actor, {
        action: "save",
        teamId: "base",
        revision,
        budget: value,
        uniforms: [],
        expenses: [],
        adminBudget: {
          depositNote: "PRIVATE-COST-NOTE",
          uniforms: 20000,
          coaching: 300000,
          coachTravel: 100000,
        },
      });
    await save(0, { ...b, parentExplanation: emptyFeeExplanation() });
    assert.equal((await saved()).published, undefined);
    await assert.rejects(
      () =>
        mutateFeePlan(sql, "owner", {
          action: "publishIndependent",
          teamId: "base",
          revision: 1,
          budget: { ...b, parentExplanation: emptyFeeExplanation() },
          confirmed: true,
        }),
      /What the initial deposit covers/,
    );
    for (const actor of ["guardian", "coach", "othercoach", "fake", "coordinator"])
      await assert.rejects(() => save(1, b, actor));
    await save(1, b);
    assert.deepEqual((await saved()).budget.parentExplanation, explanation());
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 2,
      budget: b,
      confirmed: true,
    });
    const family = async () =>
      (await independentWorkspace(sql, "guardian")).spaces.find((s) => s.teamId === "base")!;
    const before = await family();
    assert.equal(before.prospects[0].policy, "", "unaccepted terms are not labeled as accepted");
    assert.deepEqual(before.prospects[0].explanation, explanation());
    const changed = {
      ...b,
      parentExplanation: {
        ...explanation(),
        teamExpenses: "REVISED: Team will arrange tournament and hotel costs.",
      },
    };
    await save(3, changed);
    assert.deepEqual(
      (await family()).prospects[0].explanation,
      explanation(),
      "draft stays private",
    );
    await assert.rejects(
      () =>
        mutateFeePlan(sql, "guardian", {
          action: "accept",
          teamId: "base",
          playerId: "base-player",
          revision: 4,
          consent: true,
          name: "Synthetic Guardian",
          independentOfferDigest: before.prospects[0].acceptancePreview!.digest,
        }),
      /changed/,
    );
    let view = await family();
    await mutateFeePlan(sql, "guardian", {
      action: "accept",
      teamId: "base",
      playerId: "base-player",
      revision: view.planRevision,
      consent: true,
      name: "Synthetic Guardian",
      independentOfferDigest: view.prospects[0].acceptancePreview!.digest,
    });
    const original = structuredClone((await saved()).players["base-player"]);
    const download = {
      teamId: "base",
      playerId: "base-player",
      seasonId: b.independent!.seasonKey,
      version: 1,
    };
    const firstFile = await acceptedFeeAgreement(sql, "guardian", download);
    assert.match(firstFile.text, /• Two jerseys\n• One hat/);
    assert.doesNotMatch(firstFile.text, /PRIVATE-COST-NOTE|REVISED|300000/);
    for (const actor of ["stranger", "othercoach", "coordinator", "player", "fake"])
      await assert.rejects(() => acceptedFeeAgreement(sql, actor, download));
    await acceptedFeeAgreement(sql, "coach", download);
    await assert.rejects(
      () => acceptedFeeAgreement(sql, "guardian", { ...download, seasonId: randomUUID() }),
      /season/,
    );
    await assert.rejects(
      () => acceptedFeeAgreement(sql, "guardian", { ...download, playerId: "soft-player" }),
      /access/,
    );
    await assert.rejects(
      () => acceptedFeeAgreement(sql, "guardian", { ...download, version: 999 }),
      /version/,
    );
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 5,
      budget: changed,
      confirmed: true,
    });
    assert.deepEqual((await saved()).players["base-player"], original);
    assert.equal((await acceptedFeeAgreement(sql, "guardian", download)).text, firstFile.text);
    view = await family();
    assert.deepEqual(view.prospects[0].explanation, explanation());
    assert.equal(view.prospects[0].canAccept, false);
    await mutateFeePlan(sql, "owner", {
      action: "independentOffer",
      teamId: "base",
      playerId: "base-player",
      revision: 6,
      budget: changed,
      payerUserId: "guardian",
      reason: "Review explicitly revised cost responsibilities",
    });
    view = await family();
    assert.match(view.prospects[0].acceptancePreview!.policy, /REVISED/);
    assert.deepEqual(view.prospects[0].explanation, explanation());
    await mutateFeePlan(sql, "guardian", {
      action: "accept",
      teamId: "base",
      playerId: "base-player",
      revision: 7,
      consent: true,
      name: "Synthetic Guardian",
      independentOfferDigest: view.prospects[0].acceptancePreview!.digest,
    });
    assert.deepEqual(
      (await saved()).players["base-player"].independent!.installments,
      original.independent!.installments,
    );
    assert.equal((await acceptedFeeAgreement(sql, "guardian", download)).text, firstFile.text);
    assert.match(
      (await acceptedFeeAgreement(sql, "guardian", { ...download, version: 2 })).text,
      /REVISED/,
    );
    for (const actor of ["guardian", "coach"]) {
      assert.doesNotMatch(
        JSON.stringify(await independentWorkspace(sql, actor)),
        /PRIVATE-COST-NOTE|independentAdmin|collectedMargin/,
      );
      assert.doesNotMatch(
        JSON.stringify(await feeWorkspace(sql, actor)),
        /PRIVATE-COST-NOTE|independentAdmin/,
      );
      assert.doesNotMatch(
        (await independentExport(sql, actor, b.independent!.seasonKey)).text,
        /PRIVATE-COST-NOTE/,
      );
    }
    assert.ok(
      (await saved()).history.some(
        (h) => h.actor === "owner" && h.action === "publishIndependent" && h.at,
      ),
    );
    const audit = await sql<{
      actor_id: string;
      reason: string;
      after_state: { revision: number; explanation: unknown };
    }>`select actor_id,reason,after_state from finance_audit where action='Parent fee explanation'`;
    assert.ok(audit.some((a) => a.actor_id === "owner" && a.reason === "save"));
    assert.ok(
      audit.some(
        (a) =>
          a.actor_id === "owner" &&
          a.reason === "publishIndependent" &&
          a.after_state.revision === 6,
      ),
    );
    assert.equal((await sql`select id from commerce_orders`).length, 0);
    assert.equal((await sql`select id from team_collection_authorizations`).length, 0);
    assert.equal((await sql`select id from finance_records`).length, 0);

    // Existing published legacy terms can still be accepted, but republishing needs explicit coverage.
    const legacy = { ...budget(), parentExplanation: undefined };
    const legacyPlan: FeePlan = {
      budget: legacy,
      publishedBudget: legacy,
      uniforms: [],
      expenses: [],
      revision: 1,
      status: "published",
      players: {},
      history: [],
      published: {
        full: calculateFees(legacy).full,
        po: calculateFees(legacy).po,
        policy: independentPublishedPolicy(legacy),
        secondDue: "",
        finalDue: legacy.independent!.lastDue,
        revision: 1,
        at: new Date().toISOString(),
      },
    };
    await sql`insert into team_fee_plans(team_id,payload,revision) values('soft',${JSON.stringify(legacyPlan)}::jsonb,1)`;
    await sql`insert into independent_team_spaces(id,team_id,payload) values(${legacy.independent!.seasonKey},'soft',${JSON.stringify({ categories: [], policy: "", instructions: "", shared: false, closed: false })}::jsonb)`;
    const soft = (await independentWorkspace(sql, "guardian")).spaces.find(
      (s) => s.teamId === "soft",
    )!;
    assert.equal(soft.prospects[0].explanation, null);
    await mutateFeePlan(sql, "guardian", {
      action: "accept",
      teamId: "soft",
      playerId: "soft-player",
      revision: 1,
      consent: true,
      name: "Synthetic Guardian",
      independentOfferDigest: soft.prospects[0].acceptancePreview!.digest,
    });
    const oldFile = await acceptedFeeAgreement(sql, "guardian", {
      teamId: "soft",
      playerId: "soft-player",
      seasonId: legacy.independent!.seasonKey,
    });
    assert.doesNotMatch(oldFile.text, /REVISED|What the initial deposit covers/);
    await assert.rejects(
      () =>
        mutateFeePlan(sql, "owner", {
          action: "publishIndependent",
          teamId: "soft",
          revision: 2,
          budget: legacy,
          confirmed: true,
        }),
      /What the initial deposit covers/,
    );
    // A revoked coach cannot keep using an old download request.
    await sql`update "user" set "disabledAt"=now() where id='coach'`;
    await assert.rejects(() => acceptedFeeAgreement(sql, "coach", download));
  } finally {
    await f.db.close();
  }
});
