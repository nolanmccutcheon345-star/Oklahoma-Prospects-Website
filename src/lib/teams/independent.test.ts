import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { enrollmentFixture } from "../enrollment/test-fixture";
import { defaultBudget, calculateFees, scheduleRows, type FeeBudget } from "./fee-model";
import { independentSchedule, independentDraft } from "./independent-model";
import { feeHealth } from "./fee-health";
import { mutateFeePlan } from "./fee.server";
import {
  independentWorkspace,
  mutateIndependentTeam,
  independentDocument,
  independentExport,
} from "./independent.server";
import {
  collectionStatus,
  authorizeTeamCollection,
  collectionAgreement,
} from "./collection-authorization.server";
import { withFinancialContext } from "../finance/context.server";
import { mutateStoredClub } from "./club-store.server";
import { revisedIndependentSchedule } from "./independent-prospects.server";
import type { IndependentEntry } from "./independent-ledger";
import type { ClubRecord } from "./types";
import { prepareTeamCheckout } from "./payment.server";
import { fulfillSquarePayment } from "../commerce/square-payments.server";
import {
  previewFinancialBasisInitialization,
  initializeFinancialBasisForOwner,
} from "../finance/basis.server";
import { applyFutureActiveSchemaForTest } from "../finance/context.test-fixture";
const terms = (): FeeBudget => ({
  ...defaultBudget(),
  fundingModel: "independent",
  independent: {
    seasonKey: randomUUID(),
    uniformDeposit: 25000,
    monthlyDues: 12500,
    uniformDue: "2098-01-01",
    firstDue: "2098-01-31",
    billingDay: 31,
    lastDue: "2098-04-30",
    seasonEnd: "2098-04-30",
    processingExplanation: "No processing fee is charged.",
  },
  policy:
    "Independent team terms. Uniforms already purchased or paid for are not refunded; obligations remain capped at the accepted deposit.",
  processingBps: 0,
  processingFixed: 0,
});

test("closeout keeps commitments, credits and matched carryforward separate from income", async () => {
  const f = await enrollmentFixture(),
    { sql } = f;
  try {
    const first = terms(),
      second = terms();
    f.club.teams[1].coachEmail = "coach@example.invalid";
    await sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb where id='oklahoma-prospects'`;
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 0,
      budget: first,
      confirmed: true,
    });
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "soft",
      revision: 0,
      budget: second,
      confirmed: true,
    });
    const source = first.independent!.seasonKey,
      destination = second.independent!.seasonKey;
    const settings = {
      categories: [{ category: "other" as const, budget: 100000 }],
      policy: "Coach-approved carryforward of unrestricted remaining team funds",
      instructions: "Team independently collects",
      shared: true,
      closing: false,
      closed: false,
    };
    for (const seasonId of [source, destination])
      await mutateIndependentTeam(sql, "coach", {
        action: "settings",
        seasonId,
        revision: 0,
        settings,
        reason: "Publish explicit disposition policy",
      });
    const common = {
      date: "2026-01-01",
      amount: 50000,
      category: "other" as const,
      note: "Synthetic external funds",
    };
    const post = (entry: IndependentEntry, requestId = randomUUID()) =>
      mutateIndependentTeam(sql, "coach", { action: "entry", seasonId: source, requestId, entry });
    const receipt = {
      ...common,
      kind: "income" as const,
      method: "Team bank",
      reference: "SYNTHETIC-SPONSOR",
    };
    await post(receipt);
    await assert.rejects(() => post(receipt), /already recorded/);
    const commitmentId = randomUUID();
    await post({ ...common, kind: "commitment", amount: 20000 }, commitmentId);
    await post({
      ...common,
      kind: "expense",
      amount: 5000,
      commitmentId,
      method: "Team bank",
      reference: "SYNTHETIC-FIELD",
    });
    const s = (await independentWorkspace(sql, "coach")).spaces.find((s) => s.id === source)!;
    assert.equal(s.summary!.funds, 45000);
    assert.equal(s.summary!.committed, 15000);
    assert.equal(s.summary!.available, 30000);
    assert.equal(s.categories.find((c) => c.key === "other")!.budgetRemaining, 80000);
    await mutateIndependentTeam(sql, "coach", {
      action: "settings",
      seasonId: source,
      revision: 1,
      settings: { ...settings, closing: true },
      reason: "Review season before closeout",
    });
    await mutateIndependentTeam(sql, "coach", {
      action: "settings",
      seasonId: source,
      revision: 2,
      settings: { ...settings, closed: true },
      reason: "Close season without moving money",
    });
    await assert.rejects(() => post({ ...receipt, reference: "NEW-RECEIPT" }), /season is closed/);
    const carry = {
      action: "carry" as const,
      seasonId: source,
      destinationId: destination,
      requestId: randomUUID(),
      amount: 30000,
      date: "2026-01-01",
      category: "other" as const,
      note: "Explicit authorized bookkeeping carryforward",
      method: "Same team bank",
      reference: "SYNTHETIC-CARRY",
      mode: "bookkeeping" as const,
    };
    await mutateIndependentTeam(sql, "coach", carry);
    await mutateIndependentTeam(sql, "coach", carry);
    await assert.rejects(
      () => mutateIndependentTeam(sql, "coach", { ...carry, reference: "CHANGED" }),
      /request changed/,
    );
    const spaces = (await independentWorkspace(sql, "owner")).spaces;
    assert.equal(spaces.find((s) => s.id === source)!.summary!.funds, 15000);
    assert.equal(spaces.find((s) => s.id === destination)!.summary!.funds, 30000);
    assert.equal(
      spaces.reduce((sum, s) => sum + s.summary!.received, 0),
      50000,
      "moving existing money never creates income",
    );
    assert.equal(
      (
        await sql`select id from independent_team_entries where payload->>'kind' in ('carryIn','carryOut')`
      ).length,
      2,
    );
    assert.equal((await sql`select id from finance_records`).length, 0);
  } finally {
    await f.db.close();
  }
});

test("shared budgets, family statements and receipt routes never reveal another family's records", async () => {
  const f = await enrollmentFixture(),
    { sql } = f;
  try {
    const b = terms(),
      seasonId = b.independent!.seasonKey,
      team = f.club.teams[0];
    const other = structuredClone(team.roster[0]);
    other.id = "other-family-player";
    other.name = "PRIVATE-OTHER-ATHLETE";
    other.teamId = team.id;
    other.familyId = "other-private-home";
    other.parents = [
      { name: "PRIVATE-OTHER-PARENT", email: "stranger@example.invalid", rel: "parent", phone: "" },
    ];
    team.roster.push(other);
    await sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb where id='oklahoma-prospects'`;
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: team.id,
      revision: 0,
      budget: b,
      confirmed: true,
    });
    const post = (entry: IndependentEntry, requestId = randomUUID()) =>
      mutateIndependentTeam(sql, "coach", { action: "entry", seasonId, requestId, entry });
    const common = {
      date: "2026-01-01",
      amount: 30000,
      category: "other" as const,
      note: "PRIVATE-OTHER-BALANCE",
    };
    await post({ ...common, kind: "obligation", playerId: other.id, due: "2098-01-01" });
    const paymentId = randomUUID(),
      documentId = randomUUID();
    await post(
      {
        ...common,
        kind: "payment",
        payerUserId: "stranger",
        method: "PRIVATE-OTHER-METHOD",
        reference: "PRIVATE-OTHER-RECEIPT",
      },
      paymentId,
    );
    await mutateIndependentTeam(sql, "coach", {
      action: "document",
      seasonId,
      entryId: paymentId,
      requestId: documentId,
      filename: "PRIVATE-OTHER-DOCUMENT.pdf",
      mimeType: "application/pdf",
      body: Buffer.from("%PDF-1.4 PRIVATE-OTHER-DOCUMENT").toString("base64"),
    });
    await mutateIndependentTeam(sql, "coach", {
      action: "settings",
      seasonId,
      revision: 0,
      settings: {
        categories: [{ category: "other", budget: 40000 }],
        policy: "Approved public team disposition terms",
        instructions: "Contact the coach for team payment instructions",
        shared: true,
        closed: false,
      },
      reason: "Coach shares category totals only",
    });
    const family = await independentWorkspace(sql, "guardian");
    assert.doesNotMatch(JSON.stringify(family), /PRIVATE-OTHER/);
    assert.equal(family.spaces[0].categories.find((c) => c.key === "other")!.budget, 40000);
    assert.equal(family.spaces[0].documents.length, 0);
    assert.doesNotMatch((await independentExport(sql, "guardian", seasonId)).text, /PRIVATE-OTHER/);
    await assert.rejects(
      () => independentDocument(sql, "guardian", seasonId, documentId),
      /Receipt access/,
    );
    assert.equal(
      (await independentDocument(sql, "stranger", seasonId, documentId)).filename,
      "PRIVATE-OTHER-DOCUMENT.pdf",
    );
    assert.equal((await independentWorkspace(sql, "player")).spaces.length, 0);
    assert.equal((await independentWorkspace(sql, "coordinator")).spaces.length, 0);
    await sql`insert into organization_operational_access(user_id,status,updated_by) values('coordinator','active','owner')`;
    await assert.rejects(() => independentWorkspace(sql, "coordinator"), /unavailable/);
  } finally {
    await f.db.close();
  }
});

test("amendments preserve paid identities and guardian privacy under the financial basis", async () => {
  const f = await enrollmentFixture(),
    { sql } = f;
  try {
    const b = terms(),
      team = f.club.teams[0],
      player = team.roster[0];
    for (const t of f.club.teams) for (const p of t.roster) p.teamId = t.id;
    player.parents.push({
      name: "Second guardian",
      email: "stranger@example.invalid",
      rel: "parent",
      phone: "",
    });
    const sibling = structuredClone(player);
    sibling.id = "base-sibling";
    sibling.name = "Synthetic sibling";
    team.roster.push(sibling);
    await sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb where id='oklahoma-prospects'`;
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: team.id,
      revision: 0,
      budget: b,
      confirmed: true,
    });
    const accept = async (actor: string, id: string) => {
      const s = (await independentWorkspace(sql, actor)).spaces[0],
        p = s.prospects.find((p) => p.id === id)!;
      await mutateFeePlan(sql, actor, {
        action: "accept",
        teamId: team.id,
        playerId: id,
        revision: s.planRevision,
        basisVersion: s.basisVersion,
        consent: true,
        name: "Synthetic Guardian",
        independentOfferDigest: p.acceptancePreview!.digest,
      });
    };
    await accept("guardian", player.id);
    await accept("guardian", sibling.id);
    const [saved] = await sql<{
      payload: ClubRecord;
    }>`select payload from club_state where id='oklahoma-prospects'`;
    saved.payload.teams[0].roster[0].payments.push({
      amount: 375,
      date: "2026-01-01",
      method: "Synthetic verified fixture",
      fee: 0,
      charged: 375,
      label: "Deposit and January",
      receipt: "SYNTHETIC",
    });
    await sql`update club_state set payload=${JSON.stringify(saved.payload)}::jsonb where id='oklahoma-prospects'`;
    const capture = await previewFinancialBasisInitialization(sql, "owner");
    await initializeFinancialBasisForOwner(sql, "owner", {
      ...capture,
      reason: "Isolated independent model fixture",
    });
    await applyFutureActiveSchemaForTest(sql);
    let s = (await independentWorkspace(sql, "owner")).spaces[0];
    const changed = {
      ...b,
      independent: { ...b.independent!, uniformDeposit: 40000, monthlyDues: 15000 },
    };
    await mutateFeePlan(sql, "owner", {
      action: "independentOffer",
      teamId: team.id,
      playerId: player.id,
      revision: s.planRevision,
      basisVersion: s.basisVersion,
      budget: changed,
      payerUserId: "stranger",
      reason: "Explicit future installments and replacement payer",
    });
    const preview = (await independentWorkspace(sql, "stranger")).spaces[0].prospects.find(
      (p) => p.id === player.id,
    )!.acceptancePreview!;
    assert.equal(preview.rows.find((r) => r.id === "uniform")!.amount, 25000);
    assert.equal(preview.rows.find((r) => r.id === "monthly:2098-01")!.amount, 12500);
    await accept("stranger", player.id);
    s = (await independentWorkspace(sql, "owner")).spaces[0];
    assert.equal(s.prospects.find((p) => p.id === player.id)!.outstanding, 45000);
    assert.equal(s.prospects.find((p) => p.id === sibling.id)!.outstanding, 75000);
    assert.equal(s.plan!.players[player.id].independent!.agreements.length, 2);
    assert.equal(
      (await collectionStatus(sql, "guardian", { teamId: team.id, playerId: player.id }, "sandbox"))
        .canManage,
      false,
    );
    assert.equal(
      (await collectionStatus(sql, "stranger", { teamId: team.id, playerId: player.id }, "sandbox"))
        .canManage,
      true,
    );
    saved.payload.teams[0].coachEmail = "othercoach@example.invalid";
    await sql`update club_state set payload=${JSON.stringify(saved.payload)}::jsonb where id='oklahoma-prospects'`;
    assert.equal(
      (await independentWorkspace(sql, "coach")).spaces.length,
      0,
      "frozen historical coaching assignment cannot bypass revocation",
    );
    assert.equal(
      (await independentWorkspace(sql, "othercoach")).spaces[0].capabilities.includes("payments"),
      true,
    );
  } finally {
    await f.db.close();
  }
});

test("provider-confirmed payments after cancellation retain net cash and partial refunds without replacement charges", async () => {
  const f = await enrollmentFixture(),
    { sql } = f;
  try {
    const b = terms();
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 0,
      budget: b,
      confirmed: true,
    });
    const p = (await independentWorkspace(sql, "guardian")).spaces[0].prospects[0];
    await mutateFeePlan(sql, "guardian", {
      action: "accept",
      teamId: "base",
      playerId: "base-player",
      revision: 1,
      consent: true,
      name: "Synthetic Guardian",
      independentOfferDigest: p.acceptancePreview!.digest,
    });
    const checkout = await prepareTeamCheckout(
      sql,
      "guardian",
      {
        teamId: "base",
        playerId: "base-player",
        amount: 25000,
        requestId: randomUUID(),
        consent: true,
      },
      "production",
    );
    await sql`update commerce_orders set square_customer_id='synthetic-customer' where id=${checkout.orderId}`;
    await mutateFeePlan(sql, "owner", {
      action: "independentSeasonCancel",
      teamId: "base",
      revision: 2,
      reason: "Season canceled after this synthetic request was submitted",
    });
    const payment = {
      id: "synthetic-payment",
      referenceId: checkout.orderId,
      customerId: "synthetic-customer",
      locationId: "synthetic-location",
      amountMoney: { amount: 25000n, currency: "USD" as const },
      totalMoney: { amount: 25000n, currency: "USD" as const },
      refundedMoney: { amount: 5000n, currency: "USD" as const },
      sourceType: "CARD" as const,
      status: "COMPLETED" as const,
      createdAt: new Date(Date.now() + 1000).toISOString(),
    };
    const config = { environment: "production", locationId: "synthetic-location" };
    await sql.transaction((tx) => fulfillSquarePayment(tx, payment, config));
    await sql.transaction((tx) =>
      fulfillSquarePayment(
        tx,
        { ...payment, refundedMoney: { amount: 0n, currency: "USD" } },
        config,
      ),
    );
    const view = (await independentWorkspace(sql, "guardian")).spaces[0];
    assert.equal(view.prospects[0].outstanding, 0);
    assert.equal(
      view.prospects[0].credit,
      20000,
      "late confirmation and stale callback preserve actual net cash",
    );
    assert.equal(
      (await sql`select id from commerce_refunds`).length,
      0,
      "a recorded partial refund does not automatically refund the rest",
    );
    assert.equal(
      (
        await sql`select id from payment_notifications where id=${"independent-cutoff:" + checkout.orderId}`
      ).length,
      1,
    );
    const [record] = await sql<{
      payload: ClubRecord;
    }>`select payload from club_state where id='oklahoma-prospects'`;
    assert.equal(record.payload.teams[0].roster[0].payments.length, 1);
    assert.equal(record.payload.teams[0].roster[0].payments[0].amount, 200);
  } finally {
    await f.db.close();
  }
});

test("independent pricing ignores every legacy assessment and publishes a finite per-player schedule", () => {
  const b = {
    ...terms(),
    costs: [{ id: "coach", name: "Coaching", cents: 900000 }],
    tournament: 400000,
    fullOrg: 25000,
    poOrg: 14000,
    contingencyBps: 2000,
    overhead: 300000,
    uniformCost: 30000,
    lateFee: 7000,
    fullIncremental: 10000,
  };
  assert.equal(calculateFees(b).full, 75000);
  assert.equal(calculateFees(b).po, 75000);
  assert.deepEqual(
    independentSchedule(b).map((r) => r.due),
    ["2098-01-01", "2098-01-31", "2098-02-28", "2098-03-31", "2098-04-30"],
  );
  assert.equal(
    scheduleRows(b, 123, "po", "2099-01-01").reduce((s, r) => s + r.amount, 0),
    75000,
  );
  assert.equal(independentDraft(b).lateFee, 0);
  assert.equal(independentDraft(b).lateFeeBps, undefined);
  assert.equal(feeHealth(b, { today: "2097-01-01", overheadReviewed: false }).ready, true);
  const old = independentSchedule(b),
    next = independentSchedule({
      ...b,
      independent: { ...b.independent!, uniformDeposit: 40000, monthlyDues: 15000 },
    });
  const amended = revisedIndependentSchedule(old, next, 37500, "2098-02-01");
  assert.equal(amended.find((r) => r.id === "uniform")!.amount, 25000);
  assert.equal(amended.find((r) => r.id === "monthly:2098-01")!.amount, 12500);
  assert.equal(amended.find((r) => r.id === "monthly:2098-02")!.amount, 15000);
  assert.equal(new Set(amended.map((r) => r.id)).size, amended.length);
});

test("publication, per-player acceptance, independent ledger permissions, privacy and cancellation", async () => {
  const f = await enrollmentFixture(),
    { sql } = f;
  try {
    const b = terms(),
      seasonId = b.independent!.seasonKey;
    for (const t of f.club.teams) for (const p of t.roster) p.teamId = t.id;
    await sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb where id='oklahoma-prospects'`;
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 0,
      budget: b,
      confirmed: true,
    });
    const [empty] = await sql<{
      n: number;
    }>`select count(*)::int as n from team_collection_authorizations`;
    assert.equal(empty.n, 0, "publication creates no authorization");
    let view = await independentWorkspace(sql, "owner");
    assert.equal(view.spaces[0].published!.full, 75000);
    assert.equal(
      view.spaces[0].capabilities.length,
      0,
      "global owner is read-only for independent funds",
    );
    await assert.rejects(
      () =>
        mutateFeePlan(sql, "coach", {
          action: "publish",
          teamId: "base",
          revision: 1,
          confirmed: true,
        }),
      /owner access/,
    );
    await mutateFeePlan(sql, "guardian", {
      action: "accept",
      teamId: "base",
      playerId: "base-player",
      revision: 1,
      consent: true,
      name: "Verified Guardian",
      independentOfferDigest: (await independentWorkspace(sql, "guardian")).spaces[0].prospects[0]
        .acceptancePreview!.digest,
    });
    await assert.rejects(
      () =>
        mutateFeePlan(sql, "guardian", {
          action: "accept",
          teamId: "base",
          playerId: "base-player",
          revision: 2,
          consent: true,
          name: "Verified Guardian",
        }),
      /already accepted/,
    );
    const status = await collectionStatus(
      sql,
      "guardian",
      { teamId: "base", playerId: "base-player" },
      "sandbox",
    );
    assert.equal(status.terms.acceptedFeeCents, 75000);
    assert.equal(status.terms.lateFeeBps, 0);
    assert.equal(status.status, "not set up");
    await assert.rejects(
      () =>
        authorizeTeamCollection(
          sql,
          "guardian",
          { teamId: "base", playerId: "base-player" },
          "sandbox",
          "activate",
        ),
      /two different/,
    );
    const post = (user: string, entry: IndependentEntry, requestId = randomUUID()) =>
      mutateIndependentTeam(sql, user, { action: "entry", seasonId, requestId, entry });
    const common = {
      date: "2026-01-01",
      amount: 30000,
      category: "tournaments" as const,
      note: "Synthetic tournament entry",
    };
    const obligation: IndependentEntry = {
      ...common,
      kind: "obligation",
      playerId: "base-player",
      due: "2098-01-01",
    };
    await assert.rejects(() => post("owner", obligation), /read-only/);
    await assert.rejects(() => post("othercoach", obligation), /access is unavailable/);
    const obligationId = randomUUID();
    await post("coach", obligation, obligationId);
    await post("coach", obligation, obligationId);
    const paymentId = randomUUID();
    await post(
      "coach",
      {
        ...common,
        amount: 10000,
        kind: "payment",
        payerUserId: "guardian",
        method: "Team bank",
        reference: "EXTERNAL-100",
        note: "PRIVATE PAYER MEMO",
      },
      paymentId,
    );
    const allocationId = randomUUID();
    await post(
      "coach",
      { ...common, amount: 10000, kind: "allocation", paymentId, obligationId },
      allocationId,
    );
    view = await independentWorkspace(sql, "owner");
    assert.equal(
      view.spaces[0].summary!.received,
      10000,
      "payment and allocation count as one receipt",
    );
    assert.equal(view.spaces[0].summary!.funds, 10000);
    assert.equal(view.spaces[0].summary!.outstanding, 20000);
    assert.equal(
      view.spaces[0].prospects[0].outstanding,
      75000,
      "independent charge never alters Prospects fee",
    );
    const [counts] = await sql<{
      orders: number;
      finance: number;
    }>`select (select count(*)::int from commerce_orders) as orders,(select count(*)::int from finance_records) as finance`;
    assert.equal(counts.orders, 0);
    assert.equal(counts.finance, 0);
    await assert.rejects(
      () => post("coach", { ...common, amount: 1, kind: "allocation", paymentId, obligationId }),
      /exceeds/,
    );
    await assert.rejects(
      () =>
        post("coach", {
          ...common,
          amount: 1,
          kind: "allocation",
          paymentId,
          obligationId: randomUUID(),
        }),
      /crosses team/,
    );
    await mutateIndependentTeam(sql, "coach", {
      action: "grant",
      seasonId,
      userId: "stranger",
      capabilities: ["view", "payments"],
      revoke: false,
    });
    const manager = (await independentWorkspace(sql, "stranger")).spaces[0];
    assert.equal(
      manager.prospects.length,
      0,
      "manager appointment alone cannot see Prospects balances",
    );
    await assert.rejects(
      () =>
        mutateIndependentTeam(sql, "stranger", {
          action: "grant",
          seasonId,
          userId: "othercoach",
          capabilities: ["view"],
          revoke: false,
        }),
      /Only Nolan/,
    );
    await assert.rejects(() => post("stranger", obligation), /dues permission/);
    const doc = randomUUID();
    await mutateIndependentTeam(sql, "coach", {
      action: "document",
      seasonId,
      entryId: paymentId,
      requestId: doc,
      filename: "synthetic.pdf",
      mimeType: "application/pdf",
      body: Buffer.from("%PDF-1.4 synthetic fixture").toString("base64"),
    });
    assert.ok((await independentDocument(sql, "owner", seasonId, doc)).body);
    await mutateIndependentTeam(sql, "coach", {
      action: "grant",
      seasonId,
      userId: "stranger",
      capabilities: ["view"],
      revoke: true,
    });
    await assert.rejects(
      () => independentDocument(sql, "stranger", seasonId, doc),
      /access is unavailable/,
    );
    await assert.rejects(
      () => independentExport(sql, "stranger", seasonId),
      /access is unavailable/,
    );
    await post("coach", { ...common, kind: "unallocate", targetId: allocationId, amount: 4000 });
    const plannedId = randomUUID();
    await post("coach", { ...common, kind: "plannedRefund", paymentId, amount: 4000 }, plannedId);
    assert.equal(
      (await independentWorkspace(sql, "owner")).spaces[0].summary!.funds,
      10000,
      "planning a refund does not move cash",
    );
    await post("coach", {
      ...common,
      kind: "refund",
      paymentId,
      plannedId,
      amount: 4000,
      method: "Team bank",
      reference: "REFUND-40",
    });
    assert.equal((await independentWorkspace(sql, "owner")).spaces[0].summary!.funds, 6000);
    assert.equal((await independentWorkspace(sql, "owner")).spaces[0].plannedRefunds.length, 0);
    await assert.rejects(
      () =>
        post("coach", {
          ...common,
          kind: "refund",
          paymentId,
          amount: 1,
          method: "Team bank",
          reference: "EXCESS",
        }),
      /exceeds/,
    );
    await assert.rejects(
      () => sql`delete from independent_team_entries where id=${paymentId}`,
      /append-only/,
    );
    await mutateStoredClub(sql, "coach", "read", undefined, async (_tx, club) => {
      club.teams[0].roster = [];
    });
    await assert.rejects(
      () =>
        mutateStoredClub(sql, "owner", "owner", undefined, async (_tx, club) => {
          club.teams[0].roster[0].feeLock!.amount = 1;
        }),
      /agreement controls/,
    );
    const [club] = await sql<{
      payload: ClubRecord;
    }>`select payload from club_state where id='oklahoma-prospects'`;
    assert.equal(club.payload.teams[0].roster[0].withdrawn, true);
    assert.equal(
      (
        await collectionStatus(
          sql,
          "guardian",
          { teamId: "base", playerId: "base-player" },
          "sandbox",
        )
      ).terms.acceptedFeeCents,
      75000,
      "roster removal alone does not change the contract",
    );
    const authorization = await withFinancialContext(sql, "guardian", "read", (tx) =>
      collectionAgreement(tx, "guardian", { teamId: "base", playerId: "base-player" }),
    );
    const authId = randomUUID(),
      runId = randomUUID();
    await sql`insert into team_collection_authorizations(id,environment,agreement_key,team_id,player_id,locked_at,user_id,customer_id,primary_card_id,backup_card_id,primary_fingerprint,backup_fingerprint,status,terms,authorized_at) values(${authId},'production',${authorization.key},'base','base-player',${authorization.player.feeLock!.lockedAt},'guardian','synthetic-customer','synthetic-primary','synthetic-backup','a','b','active',${JSON.stringify(authorization.terms)}::jsonb,now())`;
    await sql`insert into team_collection_runs(id,authorization_id,installment_index,due_date,amount_cents,request_id,backup_request_id,primary_attempt_id,backup_attempt_id,primary_card_id,backup_card_id,next_attempt_at) values(${runId},${authId},1,'2098-01-31',12500,${randomUUID()},${randomUUID()},${randomUUID()},${randomUUID()},'synthetic-primary','synthetic-backup',now())`;
    await mutateFeePlan(sql, "owner", {
      action: "independentUniform",
      teamId: "base",
      playerId: "base-player",
      revision: 2,
      reference: "Synthetic vendor purchase, actual cost $300",
    });
    await mutateFeePlan(sql, "owner", {
      action: "independentWithdraw",
      teamId: "base",
      playerId: "base-player",
      revision: 3,
      reason: "Admin-approved withdrawal; cancel all future installments.",
    });
    assert.equal(
      (
        await sql<{
          status: string;
        }>`select status from team_collection_authorizations where id=${authId}`
      )[0].status,
      "revoked",
    );
    assert.equal(
      (await sql<{ status: string }>`select status from team_collection_runs where id=${runId}`)[0]
        .status,
      "cancelled",
      "pre-created future collection is canceled, not treated as already owed",
    );
    view = await independentWorkspace(sql, "owner");
    assert.equal(
      view.spaces[0].prospects[0].outstanding,
      25000,
      "committed deposit retained, no extra $50 vendor-cost charge",
    );
    assert.equal(
      view.spaces[0].prospects[0].rows
        .filter((r) => r.kind === "monthly")
        .reduce((s, r) => s + r.amount, 0),
      0,
    );
    await assert.rejects(
      () =>
        authorizeTeamCollection(
          sql,
          "guardian",
          { teamId: "base", playerId: "base-player" },
          "sandbox",
          "activate",
        ),
      /accepted agreement/,
    );
    await authorizeTeamCollection(
      sql,
      "guardian",
      { teamId: "base", playerId: "base-player" },
      "sandbox",
      "revoke",
    );
    club.payload.teams[0].coachEmail = "othercoach@example.invalid";
    await sql`update club_state set payload=${JSON.stringify(club.payload)}::jsonb where id='oklahoma-prospects'`;
    await assert.rejects(() => post("coach", obligation), /access is unavailable/);
    assert.equal(
      (await independentWorkspace(sql, "othercoach")).spaces[0].entries.length > 0,
      true,
      "replacement inherits team-owned records",
    );
  } finally {
    await f.db.close();
  }
});
