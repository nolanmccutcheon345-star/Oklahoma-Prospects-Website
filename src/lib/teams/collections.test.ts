import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SquareClient, Square } from "square";
import { enrollmentFixture } from "../enrollment/test-fixture";
import { defaultBudget } from "./fee-model";
import {
  saveCollectionCard,
  authorizeTeamCollection,
  collectionStatus,
} from "./collection-authorization.server";
import { runTeamCollections, teamCollectionsEnabled } from "./collections.server";
import {
  backupDueAt,
  installmentRemaining,
  installmentLateFee,
  confirmedCollectionDecline,
} from "./collection-policy";
import type { SquareSettings } from "../commerce/square-config";
import { mutateFeePlan } from "./fee.server";
import type { FeePlan } from "./fee-contracts";
const ids = { teamId: "base", playerId: "base-player" };
const config = {
  environment: "production",
  checkoutScope: "all",
  applicationId: "synthetic",
  locationId: "location",
  merchantId: "merchant",
  token: "synthetic",
  signatureKey: "synthetic",
  webhookUrl: "https://synthetic.invalid/hook",
  origin: "https://synthetic.invalid",
} satisfies SquareSettings;
async function fixture(environment: "production" | "sandbox" = "production") {
  const h = await enrollmentFixture();
  const player = h.club.teams[0].roster[0];
  player.feeLock = {
    amount: 1000,
    lockedAt: "2026-01-01T10:00:00Z",
    policyVersion: "synthetic-auto",
    components: { season: 1000 },
  };
  player.planLock = {
    dep: 700,
    deadline: "2030-01-01",
    planType: "custom",
    rows: [
      { date: "2026-01-01", amount: 700 },
      { date: "2030-01-01", amount: 300 },
    ],
  };
  player.agreement = {
    version: "synthetic-auto",
    signedBy: "Synthetic Guardian",
    signedAt: player.feeLock.lockedAt,
  };
  await h.sql`update club_state set payload=${JSON.stringify(h.club)}::jsonb`;
  const plan: FeePlan = {
    budget: defaultBudget(),
    status: "published",
    revision: 1,
    players: {
      [player.id]: {
        status: "Confirmed",
        note: "",
        automaticPayments: true,
        acceptedFeeCents: 100000,
        acceptedSchedule: [
          { date: "2026-01-01", amountCents: 70000 },
          { date: "2030-01-01", amountCents: 30000 },
        ],
        latePolicy: { fee: 0, bps: 2000, grace: 5, hold: 10, removal: 14 },
      },
    },
    uniforms: [],
    expenses: [],
    history: [],
  };
  await h.sql`insert into team_fee_plans(team_id,payload,revision) values('base',${JSON.stringify(plan)}::jsonb,1)`;
  const calls: {
    idempotencyKey: string;
    sourceId: string;
    amountMoney: { amount: bigint; currency: string };
    referenceId: string;
    customerId: string;
  }[] = [];
  let fail: "primary" | "both" | "unknown" | "none" = "none";
  const payments = new Map<string, Square.Payment>();
  const client = {
    locations: {
      get: async () => ({
        location: {
          id: "location",
          merchantId: "merchant",
          status: "ACTIVE",
          currency: "USD",
          timezone: "America/Chicago",
          capabilities: ["CREDIT_CARD_PROCESSING"],
        },
      }),
    },
    customers: {
      create: async () => ({
        customer: {
          id: "customer",
          referenceId: "guardian",
          emailAddress: "guardian@example.invalid",
        },
      }),
      get: async () => ({
        customer: {
          id: "customer",
          referenceId: "guardian",
          emailAddress: "guardian@example.invalid",
        },
      }),
    },
    cards: {
      create: async ({ sourceId }: { sourceId: string }) => ({
        card: {
          id: sourceId,
          customerId: "customer",
          enabled: true,
          fingerprint: sourceId,
          cardBrand: "VISA",
          last4: sourceId === "primary" ? "1111" : "2222",
        },
      }),
      get: async ({ cardId }: { cardId: string }) => ({
        card: { id: cardId, customerId: "customer", enabled: true, fingerprint: cardId },
      }),
    },
    payments: {
      create: async (input: (typeof calls)[number]) => {
        calls.push(input);
        if (fail === "unknown") throw Error("Synthetic timeout");
        if (fail === "both" || (fail === "primary" && input.sourceId === "primary"))
          throw { body: { errors: [{ code: "CARD_DECLINED" }] } };
        const payment: Square.Payment = {
          id: input.idempotencyKey,
          referenceId: input.referenceId,
          customerId: input.customerId,
          locationId: "location",
          amountMoney: input.amountMoney,
          totalMoney: input.amountMoney,
          sourceType: "CARD",
          status: "COMPLETED",
          createdAt: new Date().toISOString(),
        };
        payments.set(payment.id!, payment);
        return { payment };
      },
      get: async ({ paymentId }: { paymentId: string }) => ({ payment: payments.get(paymentId) }),
    },
  } as unknown as SquareClient;
  const c = { ...config, environment };
  const save = (purpose: "primary" | "backup", sourceId = purpose) =>
    saveCollectionCard(h.sql, client, c, "guardian", {
      ...ids,
      purpose,
      sourceId,
      requestId: randomUUID(),
      consent: true,
    });
  async function setup() {
    await save("primary");
    await save("backup");
    await authorizeTeamCollection(h.sql, "guardian", ids, environment, "activate");
  }
  const run = (now = new Date()) => runTeamCollections(h.sql, client, c, { enabled: true, now });
  return {
    ...h,
    player,
    plan,
    client,
    c,
    calls,
    payments,
    save,
    setup,
    run,
    setFailure: (v: typeof fail) => {
      fail = v;
    },
  };
}
test("collection consent is guardian scoped, requires different cards, is revocable and cannot charge while globally paused", async () => {
  const f = await fixture();
  try {
    for (const actor of ["owner", "coach", "coordinator", "stranger", "player"])
      await assert.rejects(collectionStatus(f.sql, actor, ids, "production"));
    await f.save("primary");
    await assert.rejects(f.save("backup", "primary"), /different card/);
    await assert.rejects(
      authorizeTeamCollection(f.sql, "guardian", ids, "production", "activate"),
      /two different/,
    );
    await f.save("backup");
    await authorizeTeamCollection(f.sql, "guardian", ids, "production", "activate");
    assert.equal((await collectionStatus(f.sql, "guardian", ids, "production")).status, "active");
    await runTeamCollections(f.sql, f.client, f.c, { enabled: false });
    assert.equal(f.calls.length, 0);
    await authorizeTeamCollection(f.sql, "guardian", ids, "production", "revoke");
    await f.run();
    assert.equal(f.calls.length, 0);
  } finally {
    await f.db.close();
  }
});
test("automatic installment settles once in the original ledger; subsequent runs never duplicate the charge", async () => {
  const f = await fixture();
  try {
    await f.setup();
    await Promise.all([f.run(), f.run()]);
    await f.run();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].amountMoney.amount, 70000n);
    const [s] = await f.sql<{ payload: typeof f.club }>`select payload from club_state`;
    assert.equal(s.payload.teams[0].roster[0].payments[0].amount, 700);
    assert.deepEqual(s.payload.teams[0].roster[0].feeLock, f.player.feeLock);
    assert.equal((await f.sql`select id from team_collection_runs where status='paid'`).length, 1);
  } finally {
    await f.db.close();
  }
});
test("confirmed primary decline permits exactly one next-morning backup; partial payment reduces its amount", async () => {
  const f = await fixture();
  try {
    await f.setup();
    f.setFailure("primary");
    const now = new Date();
    await f.run(now);
    await f.run(now);
    assert.equal(f.calls.length, 1);
    f.player.payments = [
      {
        date: "2026-01-01",
        amount: 200,
        fee: 0,
        charged: 200,
        method: "Check",
        label: "Synthetic settled funds",
        receipt: "synthetic",
      },
    ];
    await f.sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb`;
    await f.run(backupDueAt(now));
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].sourceId, "backup");
    assert.equal(f.calls[1].amountMoney.amount, 50000n);
    assert.notEqual(f.calls[0].idempotencyKey, f.calls[1].idempotencyKey);
    await f.run(backupDueAt(now));
    assert.equal(f.calls.length, 2);
  } finally {
    await f.db.close();
  }
});
test("uncertain provider response blocks the backup and further collection until reconciliation", async () => {
  const f = await fixture();
  try {
    await f.setup();
    f.setFailure("unknown");
    await f.run();
    await f.run(backupDueAt(new Date()));
    assert.equal(f.calls.length, 1);
    assert.equal(
      (await f.sql<{ status: string }>`select status from team_collection_runs`)[0].status,
      "review",
    );
    assert.equal(
      (await f.sql<{ status: string }>`select status from square_payment_attempts`)[0].status,
      "unknown",
    );
  } finally {
    await f.db.close();
  }
});
test("both declines permit a reviewed 20 percent fee once on the unpaid installment and retain the original fee", async () => {
  const f = await fixture();
  try {
    await f.setup();
    f.setFailure("both");
    await f.run();
    await f.run(backupDueAt(new Date()));
    assert.equal(f.calls.length, 2);
    await assert.rejects(mutateFeePlan(f.sql, "coach", { action: "lateFee", ...ids, revision: 1 }));
    await mutateFeePlan(f.sql, "owner", {
      action: "lateFee",
      ...ids,
      revision: 1,
      installmentIndex: 0,
    });
    const [saved] = await f.sql<{
      payload: FeePlan;
      revision: number;
    }>`select payload,revision from team_fee_plans where team_id='base'`;
    assert.equal(saved.payload.players[ids.playerId].lateFeeApplied, 14000);
    assert.equal(saved.payload.players[ids.playerId].acceptedFeeCents, 100000);
    assert.deepEqual(
      saved.payload.players[ids.playerId].acceptedSchedule,
      f.plan.players[ids.playerId].acceptedSchedule,
    );
    const [club] = await f.sql<{ payload: typeof f.club }>`select payload from club_state`;
    assert.equal(club.payload.teams[0].roster[0].feeLock?.amount, 1140);
    assert.equal(club.payload.teams[0].roster[0].feeLock?.components.season, 1000);
    await assert.rejects(
      mutateFeePlan(f.sql, "owner", {
        action: "lateFee",
        ...ids,
        revision: saved.revision,
        installmentIndex: 0,
      }),
      /No unassessed/,
    );
  } finally {
    await f.db.close();
  }
});
test("Sandbox collection uses its own receipts without changing production ledger or repeating the deposit", async () => {
  const f = await fixture("sandbox");
  try {
    await f.setup();
    await f.run();
    await f.run();
    assert.equal(f.calls.length, 1);
    const [club] = await f.sql<{ payload: typeof f.club }>`select payload from club_state`;
    assert.equal(club.payload.teams[0].roster[0].payments.length, 0);
  } finally {
    await f.db.close();
  }
});
test("collection calculations exclude future installments and prior late fees and keep Central time across DST", () => {
  assert.equal(installmentLateFee(49500), 9900);
  assert.equal(installmentLateFee(231000), 46200);
  assert.equal(installmentLateFee(1), 0);
  const rows = installmentRemaining(
    {
      version: 1,
      acceptedFeeCents: 100000,
      rows: [
        { date: "2026-01-01", amountCents: 70000 },
        { date: "2026-03-01", amountCents: 30000 },
      ],
      graceDays: 5,
      lateFeeBps: 2000,
    },
    84000,
    [{ at: "2026-01-07", cents: 14000 }],
  );
  assert.equal(rows[1].remainingCents, 30000);
  assert.equal(
    backupDueAt(new Date("2026-10-31T15:00:00Z")).toISOString(),
    "2026-11-01T15:00:00.000Z",
  );
  assert.equal(
    confirmedCollectionDecline({ body: { errors: [{ code: "CARD_DECLINED" }] } }),
    "CARD_DECLINED",
  );
  assert.equal(
    confirmedCollectionDecline({
      body: { errors: [{ code: "CARD_DECLINED" }, { code: "AUTHENTICATION_REQUIRED" }] },
    }),
    null,
  );
  assert.equal(
    teamCollectionsEnabled(
      { TEAM_AUTOPAY_ENABLED: "true", SQUARE_DEPLOY_CONTEXT: "production" },
      "production",
    ),
    false,
  );
});

test("failed installment emails describe failures and next steps without claiming a receipt", async () => {
  const f = await fixture();
  try {
    await f.setup();
    f.setFailure("both");
    await f.run();
    await f.run(backupDueAt(new Date()));
    await f.sql`update commerce_orders set email='guardian@controlled.test'`;
    const messages: { subject: string; text: string }[] = [];
    const { deliverPaymentNotifications } = await import("../commerce/square-notifications.server");
    await deliverPaymentNotifications(
      f.sql,
      { environment: "production", origin: "https://synthetic.invalid" },
      { key: "synthetic", from: "office@controlled.test" },
      undefined,
      async (_url, init) => {
        messages.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ id: "synthetic-email-" + messages.length }));
      },
    );
    assert.ok(messages.some((m) => m.text.includes("primary card was declined")));
    assert.ok(messages.some((m) => m.text.includes("Both the primary and backup")));
    assert.ok(!messages.some((m) => m.subject.includes("payment receipt")));
  } finally {
    await f.db.close();
  }
});

test("revoking or replacing a card after primary decline prevents the scheduled backup", async () => {
  for (const action of ["revoke", "replace"] as const) {
    const f = await fixture();
    try {
      await f.setup();
      f.setFailure("primary");
      await f.run();
      if (action === "revoke")
        await authorizeTeamCollection(f.sql, "guardian", ids, "production", "revoke");
      else {
        await f.save("backup", "replacement");
        await authorizeTeamCollection(f.sql, "guardian", ids, "production", "activate");
      }
      await f.run(backupDueAt(new Date()));
      assert.equal(f.calls.length, 1);
    } finally {
      await f.db.close();
    }
  }
});

test("an overdue installment cannot receive a late fee without both confirmed production declines", async () => {
  for (const environment of ["production", "sandbox"] as const) {
    const f = await fixture(environment);
    try {
      await f.setup();
      f.setFailure(environment === "sandbox" ? "both" : "unknown");
      await f.run();
      await f.run(backupDueAt(new Date()));
      await assert.rejects(
        mutateFeePlan(f.sql, "owner", { action: "lateFee", ...ids, revision: 1 }),
        /Confirmed primary and backup/,
      );
    } finally {
      await f.db.close();
    }
  }
});

test("provider dispute versions cannot roll back newer state, cross environments or repeat notices", async () => {
  const f = await fixture();
  try {
    await f.setup();
    await f.run();
    const paymentId = [...f.payments.keys()][0];
    const { syncSquareDispute } = await import("../commerce/square-webhook.server");
    let dispute: Square.Dispute = {
      id: "synthetic-dispute",
      locationId: "location",
      disputedPayment: { paymentId },
      amountMoney: { amount: 70000n, currency: "USD" },
      state: "EVIDENCE_REQUIRED",
      version: 2,
    };
    const client = { disputes: { get: async () => ({ dispute }) } } as unknown as SquareClient;
    const deps = { sql: f.sql, client, config: f.c };
    await syncSquareDispute(dispute.id!, deps);
    dispute = { ...dispute, state: "WON", version: 4 };
    await syncSquareDispute(dispute.id!, deps);
    dispute = { ...dispute, state: "EVIDENCE_REQUIRED", version: 3 };
    await syncSquareDispute(dispute.id!, deps);
    await syncSquareDispute(dispute.id!, deps);
    const [current] = await f.sql<{
      state: string;
      provider_version: number;
    }>`select state,provider_version from square_disputes`;
    assert.equal(current.state, "WON");
    assert.equal(Number(current.provider_version), 4);
    assert.equal(
      (await f.sql`select id from payment_notifications where kind='dispute'`).length,
      2,
    );
    dispute = { ...dispute, id: "wrong-environment", version: 5 };
    await syncSquareDispute(dispute.id!, { ...deps, config: { ...f.c, environment: "sandbox" } });
    assert.equal((await f.sql`select id from square_disputes`).length, 1);
    dispute = { ...dispute, locationId: "wrong-location" };
    await assert.rejects(syncSquareDispute(dispute.id!, deps), /identity verification/);
  } finally {
    await f.db.close();
  }
});
