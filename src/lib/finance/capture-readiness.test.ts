import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import {
  financialBasisDigest,
  initializeFinancialBasisForOwner,
  previewFinancialBasisInitialization,
  previewFinancialBasisRefresh,
  previewFinancialBasisCutoverReadinessForOwner,
  readFinancialBasisForOwner,
  refreshFinancialBasisForOwner,
  updateFinancialBasisForOwner,
} from "./basis.server";
import { applyFutureActiveSchemaForTest } from "./context.test-fixture";

// Disposable synthetic WASM database only; no configured/environment DB access.
const db = new PGlite();
after(() => db.close());
async function fixture(initialize = true) {
  await db.exec("drop schema public cascade; create schema public");
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + name, "utf8"));
  const transactions: string[][] = [];
  const wrap = (query: PGlite["query"], log?: string[]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const text = parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, "");
      log?.push(text);
      return (await query(text, values)).rows;
    }) as Sql;
    sql.query = (async (text: string, values: unknown[] = []) => {
      log?.push(text);
      return (await query(text, values)).rows;
    }) as Sql["query"];
    sql.transaction = async (fn) => {
      if (log) throw new Error("Nested transactions are forbidden");
      const statements: string[] = [];
      transactions.push(statements);
      return db.transaction((tx) => fn(wrap(tx.query.bind(tx) as PGlite["query"], statements)));
    };
    return sql;
  };
  const sql = wrap(db.query.bind(db));
  for (const [id, role] of [
    ["owner", "admin"],
    ["fake", "admin"],
    ["ops", "admin"],
    ["coach", "coach"],
  ]) {
    await sql`insert into "user"(id,email,name,"emailVerified") values(${id},${id + "@example.invalid"},${id},true)`;
    await sql`insert into profiles(user_id,email,name,role) values(${id},${id + "@example.invalid"},${id},${role})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner'),('ops@example.invalid','ops')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('ops','active','owner')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 12;
  club.teams = club.teams.slice(0, 2);
  for (const team of club.teams) team.roster = team.roster.slice(0, 1);
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,12,false)`;
  await sql`insert into pd_working_file(id,payload) values('club',${JSON.stringify({ coaches: [{ id: "coach", name: "Coach", email: "coach@example.invalid", active: true }], coachPayouts: [{ coachId: "coach", serviceId: "s1", splitPct: 50 }] })})`;
  await sql`update club_services set active=true where id='s1'`;
  if (initialize) {
    const initialization = await previewFinancialBasisInitialization(sql, "owner");
    await initializeFinancialBasisForOwner(sql, "owner", {
      ...initialization,
      reason: "Synthetic initial capture",
    });
  }
  transactions.length = 0;
  return { sql, club, transactions };
}
async function order(
  sql: Sql,
  id: string,
  status = "pending",
  snapshot: Record<string, unknown> = {},
) {
  await sql`insert into commerce_orders(id,request_key,email,product_id,kind,total_cents,status,payment_provider,payment_environment,snapshot)
    values(${id},${id},'synthetic@example.invalid','s1','lesson',6000,${status},'square','production',${JSON.stringify({ kind: "lesson", productId: "s1", setupCents: 0, credits: 0, ...snapshot })}::jsonb)`;
  if (status === "paid") {
    await sql`insert into square_payments(id,order_id,environment,amount_cents,status) values(${"payment:" + id},${id},'production',6000,'COMPLETED')`;
    await sql`update commerce_orders set square_payment_id=${"payment:" + id},paid_at='2026-10-20 12:00Z' where id=${id}`;
  }
}
async function lesson(sql: Sql, id: string, orderId: string | null, coach = "coach") {
  await sql`insert into booking_records(id,order_id,coach_id,product_id,starts_at,ends_at,resources,status)
    values(${id},${orderId},${coach},'s1','2026-10-25 12:00Z','2026-10-25 13:00Z','[]'::jsonb,'confirmed')`;
}
async function refresh(sql: Sql) {
  return refreshFinancialBasisForOwner(sql, "owner", {
    ...(await previewFinancialBasisRefresh(sql, "owner")),
    reason: "Reviewed synthetic recapture",
  });
}
async function immutableState(sql: Sql) {
  return {
    state: await sql`select * from financial_basis_state`,
    versions: await sql`select * from financial_basis_versions order by version`,
    teams: await sql`select * from financial_team_seasons order by id`,
    agreements: await sql`select * from financial_player_agreements order by id`,
    teamAliases: await sql`select * from financial_team_aliases order by legacy_team_id`,
    playerAliases:
      await sql`select * from financial_player_aliases order by legacy_team_id,legacy_player_id`,
  };
}
async function ledgers(sql: Sql) {
  const tables = [
    "commerce_orders",
    "square_payment_attempts",
    "square_payments",
    "booking_records",
    "financial_lesson_bindings",
    "financial_lesson_recognitions",
    "credit_grants",
    "credit_uses",
    "commerce_refunds",
    "contractor_earnings",
    "finance_records",
  ];
  return Promise.all(
    tables.map((table) =>
      sql.query(`select to_jsonb(t) as value from ${table} t order by to_jsonb(t)::text`),
    ),
  );
}

test("captured refresh appends audited version, preserves initialization and identities, writes no ledger or pin", async () => {
  const f = await fixture();
  await order(f.sql, "paid", "paid");
  await lesson(f.sql, "lesson", "paid");
  const original = await immutableState(f.sql);
  const ledger = await ledgers(f.sql);
  const preview = await previewFinancialBasisRefresh(f.sql, "owner");
  assert.equal(preview.refreshAllowed, true);
  assert.equal(preview.proposedVersion, 2);
  assert.equal(preview.readyForActivation, false);
  assert.equal(preview.bindingPlan[0].basisVersion, 2);
  assert.equal(preview.bindingPlan[0].approvedTerms.splitPct, 50);
  const originalBasis = await readFinancialBasisForOwner(f.sql, "owner");
  assert.ok(originalBasis);
  const reconstructed = structuredClone(originalBasis.inputs) as unknown as Record<string, unknown>;
  for (const change of preview.sourceChanges) {
    const keys = change.path
      .slice(1)
      .split("/")
      .map((key) => key.replace(/~1/g, "/").replace(/~0/g, "~"));
    const last = keys.pop()!;
    let target = reconstructed;
    for (const key of keys) target = target[key] as Record<string, unknown>;
    if (change.afterPresent) target[last] = structuredClone(change.after);
    else delete target[last];
  }
  assert.equal(financialBasisDigest(reconstructed), preview.sourceDigest);
  assert.ok(preview.sourceChanges.some((change) => change.path === "/compensation/bookings"));
  assert.ok(preview.blockers.some((b) => b.code === "applied_reviewed_bindings_required"));
  assert.deepEqual(await immutableState(f.sql), original);
  assert.deepEqual(await ledgers(f.sql), ledger);
  const receipt = await refreshFinancialBasisForOwner(f.sql, "owner", {
    ...preview,
    reason: "Reviewed fixture lesson",
  });
  assert.equal(receipt.version, 2);
  assert.equal(receipt.activationState, "captured");
  assert.equal(receipt.activeVersion, null);
  assert.equal(receipt.sourceDigest, original.state[0].source_digest);
  assert.notEqual(receipt.refreshedSourceDigest, receipt.sourceDigest);
  const after = await immutableState(f.sql);
  assert.deepEqual(after.versions[0], original.versions[0]);
  for (const key of ["teams", "agreements", "teamAliases", "playerAliases"] as const)
    assert.deepEqual(after[key], original[key]);
  assert.deepEqual({ ...after.state[0], current_version: 1 }, original.state[0]);
  assert.deepEqual(await ledgers(f.sql), ledger);
  const [audit] = await f.sql<{
    actor_id: string;
    after_state: { refreshedSourceDigest: string; reviewDigest: string };
  }>`select * from finance_audit where id=${receipt.auditId}`;
  assert.equal(audit.actor_id, "owner");
  assert.equal(audit.after_state.refreshedSourceDigest, receipt.refreshedSourceDigest);
  assert.equal(audit.after_state.reviewDigest, preview.reviewDigest);
  const dry = await previewFinancialBasisCutoverReadinessForOwner(f.sql, "owner");
  assert.equal(dry.bindingPlan[0].basisVersion, 2);
  assert.equal(
    dry.blockers.some((b) => b.code === "source_changed_since_capture"),
    false,
  );
  assert.equal(dry.readyForActivation, false);
  assert.deepEqual(await ledgers(f.sql), ledger);
  assert.ok(
    f.transactions.every((statements) =>
      /financial_execution_gate.*for update/s.test(statements[0]),
    ),
  );
  assert.ok(
    f.transactions.some((statements) =>
      statements.some((text) => /lock table commerce_orders,square_payment_attempts/.test(text)),
    ),
  );
  await assert.rejects(
    f.sql`update financial_basis_versions set reason='overwrite' where version=1`,
    /append-only/,
  );
  await assert.rejects(
    f.sql`update finance_audit set reason='overwrite' where id=${receipt.auditId}`,
    /immutable|append|audit/i,
  );
});

test("source digest catches independent source changes and readiness token catches non-source payment drift", async () => {
  const f = await fixture();
  const staleSource = await previewFinancialBasisRefresh(f.sql, "owner");
  await f.sql`update pd_working_file set payload=jsonb_set(payload::jsonb,'{coachPayouts,0,splitPct}','44'::jsonb)::text where id='club'`;
  await assert.rejects(
    refreshFinancialBasisForOwner(f.sql, "owner", { ...staleSource, reason: "Stale source" }),
    /source inputs changed/,
  );
  assert.equal((await f.sql`select rev from club_state`)[0].rev, staleSource.sourceClubRevision);
  await order(f.sql, "quote");
  const staleReadiness = await previewFinancialBasisRefresh(f.sql, "owner");
  assert.deepEqual(staleReadiness.untouchedQuoteIds, ["quote"]);
  await f.sql`insert into square_payment_attempts(id,order_id,token_hash,status) values('attempt','quote','never-selected','unknown')`;
  await assert.rejects(
    refreshFinancialBasisForOwner(f.sql, "owner", {
      ...staleReadiness,
      reason: "Stale provider status",
    }),
    /readiness changed/,
  );
  const blocked = await previewFinancialBasisRefresh(f.sql, "owner");
  assert.equal(blocked.sourceDigest, staleReadiness.sourceDigest);
  assert.notEqual(blocked.readinessDigest, staleReadiness.readinessDigest);
  assert.equal(blocked.refreshAllowed, false);
  assert.ok(
    blocked.blockers.some((b) => b.code === "in_flight_charge" && b.attemptId === "attempt"),
  );
  assert.deepEqual(blocked.untouchedQuoteIds, []);
  await assert.rejects(
    refreshFinancialBasisForOwner(f.sql, "owner", { ...blocked, reason: "Blocked provider" }),
    /refresh is blocked/,
  );
  assert.equal(
    (await f.sql`select current_version from financial_basis_state`)[0].current_version,
    1,
  );
});

test("exact basis CAS, forged review, and active marker fail closed", async () => {
  const f = await fixture();
  const preview = await previewFinancialBasisRefresh(f.sql, "owner");
  await assert.rejects(
    refreshFinancialBasisForOwner(f.sql, "owner", {
      ...preview,
      reviewDigest: "0".repeat(64),
      reason: "Forged",
    }),
    /readiness changed/,
  );
  await updateFinancialBasisForOwner(
    f.sql,
    "owner",
    { expectedVersion: 1, reason: "Concurrent owner change" },
    (draft) => {
      draft.inputs.club.teams[0].name = "Reviewed";
    },
  );
  await assert.rejects(
    refreshFinancialBasisForOwner(f.sql, "owner", { ...preview, reason: "Stale basis" }),
    /basis changed/,
  );
  await applyFutureActiveSchemaForTest(f.sql);
  await assert.rejects(previewFinancialBasisRefresh(f.sql, "owner"), /captured, inactive/);
  await assert.rejects(
    previewFinancialBasisCutoverReadinessForOwner(f.sql, "owner"),
    /captured, inactive/,
  );
  await assert.rejects(
    refreshFinancialBasisForOwner(f.sql, "owner", {
      ...preview,
      expectedVersion: 2,
      reason: "Active denied",
    }),
    /captured, inactive/,
  );
});

test("current genuine owner is required on preview, dry run, and refresh without implicit account grants", async () => {
  const f = await fixture();
  const preview = await previewFinancialBasisRefresh(f.sql, "owner");
  const denied = async (user: string) => {
    await assert.rejects(previewFinancialBasisRefresh(f.sql, user), /owner access required/);
    await assert.rejects(
      previewFinancialBasisCutoverReadinessForOwner(f.sql, user),
      /owner access required/,
    );
    await assert.rejects(
      refreshFinancialBasisForOwner(f.sql, user, { ...preview, reason: "Denied" }),
      /owner access required/,
    );
  };
  for (const user of ["fake", "ops", "coach", "missing"]) await denied(user);
  await f.sql`update "user" set "emailVerified"=false where id='owner'`;
  await denied("owner");
  await f.sql`update "user" set "emailVerified"=true,"disabledAt"=now() where id='owner'`;
  await denied("owner");
  await f.sql`update "user" set "disabledAt"=null where id='owner'`;
  await f.sql`update owner_grants set revoked_at=now() where user_id='owner'`;
  await denied("owner");
  assert.equal((await f.sql`select * from owner_grants where user_id='fake'`).length, 0);
  assert.equal((await f.sql`select * from household_members`).length, 0);
  assert.equal((await f.sql`select * from finance_audit`).length, 0);
});

test("new, removed, changed, and moved team/player identities never silently reenroll", async () => {
  const f = await fixture();
  const original = await immutableState(f.sql);
  for (const mutate of [
    (club: typeof f.club) => {
      club.teams[0].id = "changed-team";
      club.teams[0].roster[0].teamId = "changed-team";
    },
    (club: typeof f.club) => {
      club.teams[0].roster[0].id = "changed-player";
    },
    (club: typeof f.club) => {
      club.teams[0].roster.push({ ...club.teams[0].roster[0], id: "new-player" });
    },
    (club: typeof f.club) => {
      club.teams[0].roster = [];
    },
    (club: typeof f.club) => {
      const player = club.teams[0].roster.pop()!;
      player.teamId = club.teams[1].id;
      club.teams[1].roster.push(player);
    },
    (club: typeof f.club) => {
      club.teams.pop();
    },
  ]) {
    const club = structuredClone(f.club);
    mutate(club);
    await f.sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
    await assert.rejects(previewFinancialBasisRefresh(f.sql, "owner"), /identity map changed/);
    assert.deepEqual(await immutableState(f.sql), original);
  }
});

test("audit insertion failure atomically rolls back new version and CAS", async () => {
  const f = await fixture();
  const preview = await previewFinancialBasisRefresh(f.sql, "owner");
  const before = await immutableState(f.sql);
  await f.sql.query(
    `create function fail_refresh_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic audit failure'; end $$`,
  );
  await f.sql.query(
    `create trigger fail_refresh_audit before insert on finance_audit for each row execute function fail_refresh_audit()`,
  );
  await assert.rejects(
    refreshFinancialBasisForOwner(f.sql, "owner", { ...preview, reason: "Must roll back" }),
    /synthetic audit failure/,
  );
  assert.deepEqual(await immutableState(f.sql), before);
  assert.equal((await f.sql`select * from finance_audit`).length, 0);
});

test("readiness detects paid-unfulfilled, review, partial payment, unknown terms and missing original order without writes", async () => {
  const f = await fixture();
  await order(f.sql, "unfulfilled", "paid");
  await order(f.sql, "review", "payment_review");
  await order(f.sql, "partial", "pending_fee");
  await order(f.sql, "unknown-terms", "paid");
  await lesson(f.sql, "unknown-lesson", "unknown-terms", "unapproved-coach");
  await lesson(f.sql, "orphan", null);
  const before = await ledgers(f.sql);
  const preview = await previewFinancialBasisRefresh(f.sql, "owner");
  for (const code of [
    "paid_unfulfilled_lesson",
    "payment_review",
    "incomplete_payment_setup",
    "lesson_terms_unavailable",
    "lesson_order_missing",
    "applied_reviewed_bindings_required",
    "explicit_activation_required",
  ])
    assert.ok(
      preview.blockers.some((b) => b.code === code),
      code,
    );
  assert.equal(preview.refreshAllowed, false);
  assert.deepEqual(preview.bindingPlan, []);
  assert.deepEqual(await ledgers(f.sql), before);
});

test("already applied order pin, binding, or recognition blocks refresh and remains immutable", async () => {
  const f = await fixture();
  await order(f.sql, "pinned", "pending", {
    financialLessonAdmission: {
      basisVersion: 1,
      coachId: "coach",
      productId: "s1",
      startsAt: "2026-10-25T12:00:00Z",
      endsAt: "2026-10-25T13:00:00Z",
    },
  });
  await order(f.sql, "bound", "paid");
  await lesson(f.sql, "binding", "bound");
  await f.sql`insert into financial_lesson_bindings(booking_id,basis_id,basis_version,order_id,original_booking,approved_terms) values('binding','oklahoma-prospects',1,'bound','{"id":"binding"}'::jsonb,'{}'::jsonb)`;
  await f.sql`insert into financial_lesson_recognitions(booking_id,basis_id,basis_version,recognized_by,actor_kind,reason) values('binding','oklahoma-prospects',1,'owner','owner','Prior recognition')`;
  const before = await ledgers(f.sql);
  const preview = await previewFinancialBasisRefresh(f.sql, "owner");
  for (const code of [
    "existing_order_pin",
    "existing_lesson_binding",
    "existing_lesson_recognition",
  ])
    assert.ok(
      preview.refreshBlockers.some((b) => b.code === code),
      code,
    );
  await assert.rejects(
    refreshFinancialBasisForOwner(f.sql, "owner", {
      ...preview,
      reason: "Do not invalidate attribution",
    }),
    /refresh is blocked/,
  );
  assert.deepEqual(await ledgers(f.sql), before);
});

test("scoped admissions cannot be erased and post-refresh drift gets an explicit dry-run blocker", async () => {
  const f = await fixture();
  await refresh(f.sql);
  await f.sql`update club_services set price=price+1 where id='s1'`;
  const dry = await previewFinancialBasisCutoverReadinessForOwner(f.sql, "owner");
  assert.ok(dry.blockers.some((b) => b.code === "source_changed_since_capture"));
  const basis = await readFinancialBasisForOwner(f.sql, "owner");
  assert.ok(basis);
  await updateFinancialBasisForOwner(
    f.sql,
    "owner",
    { expectedVersion: basis.version, reason: "Explicit scoped access" },
    (draft) => {
      draft.inputs.billing.payrollAccess = [
        { id: "admitted", userId: "coach", payeeId: "p", fromMonth: "2027-01" },
      ];
    },
  );
  const preview = await previewFinancialBasisRefresh(f.sql, "owner");
  assert.ok(preview.refreshBlockers.some((b) => b.code === "scoped_financial_admission"));
  assert.equal(preview.refreshAllowed, false);
  assert.equal(financialBasisDigest(basis.inputs), basis.sourceDigest);
});

test("refresh never initializes an absent basis", async () => {
  const f = await fixture(false);
  await assert.rejects(previewFinancialBasisRefresh(f.sql, "owner"), /not initialized/);
  await assert.rejects(
    previewFinancialBasisCutoverReadinessForOwner(f.sql, "owner"),
    /not initialized/,
  );
  await assert.rejects(
    refreshFinancialBasisForOwner(f.sql, "owner", {
      expectedVersion: 1,
      sourceClubRevision: 12,
      sourceDigest: "0".repeat(64),
      readinessDigest: "0".repeat(64),
      reviewDigest: "0".repeat(64),
      reason: "Cannot initialize",
    }),
    /basis changed/,
  );
  assert.equal((await f.sql`select * from financial_basis_state`).length, 0);
});

test("successive audited refreshes are allowed but a saved financial amendment is never overwritten", async () => {
  const f = await fixture();
  await refresh(f.sql);
  const second = await refresh(f.sql);
  assert.equal(second.version, 3);
  await updateFinancialBasisForOwner(
    f.sql,
    "owner",
    { expectedVersion: 3, reason: "Deliberate owner financial-only change" },
    (draft) => {
      draft.inputs.club.teams[0].name = "Saved financial amendment";
    },
  );
  const preview = await previewFinancialBasisRefresh(f.sql, "owner");
  assert.ok(preview.refreshBlockers.some((b) => b.code === "saved_financial_amendment"));
  const before = await immutableState(f.sql);
  await assert.rejects(
    refreshFinancialBasisForOwner(f.sql, "owner", {
      ...preview,
      reason: "Do not erase owner amendment",
    }),
    /refresh is blocked/,
  );
  assert.deepEqual(await immutableState(f.sql), before);
});

test("historical team-fee pairs and optional stable IDs must resolve without creating aliases", async () => {
  const f = await fixture();
  const basis = await readFinancialBasisForOwner(f.sql, "owner");
  assert.ok(basis);
  const team = f.club.teams[0],
    player = team.roster[0];
  for (const [id, fee] of [
    ["valid", { teamId: team.id, playerId: player.id }],
    ["old-transfer", { teamId: "former-team", playerId: player.id }],
    [
      "wrong-stable",
      {
        teamId: team.id,
        playerId: player.id,
        financialAgreementId: "wrong",
        financialTeamSeasonId: basis.teams[0].id,
      },
    ],
  ] as const) {
    await order(f.sql, id, id === "old-transfer" ? "paid" : "pending", {
      kind: "team-fee",
      teamFee: fee,
    });
    await f.sql`update commerce_orders set kind='team-fee' where id=${id}`;
  }
  const before = await immutableState(f.sql);
  const ledger = await ledgers(f.sql);
  const preview = await previewFinancialBasisRefresh(f.sql, "owner");
  const unresolved = preview.blockers
    .filter((b) => b.code === "unresolved_team_fee_identity")
    .map((b) => b.orderId);
  assert.deepEqual(unresolved, ["old-transfer", "wrong-stable"]);
  assert.equal(preview.refreshAllowed, false);
  assert.deepEqual(await immutableState(f.sql), before);
  assert.deepEqual(await ledgers(f.sql), ledger);
});

test("dry-run never proposes a replacement version for an already pinned or recognized unbound lesson", async () => {
  const f = await fixture();
  await order(f.sql, "pinned-lesson", "paid", {
    financialLessonAdmission: {
      basisVersion: 1,
      coachId: "coach",
      productId: "s1",
      startsAt: "2026-10-25T12:00:00Z",
      endsAt: "2026-10-25T13:00:00Z",
    },
  });
  await lesson(f.sql, "pinned-booking", "pinned-lesson");
  await order(f.sql, "recognized-lesson", "paid");
  await lesson(f.sql, "recognized-booking", "recognized-lesson");
  await f.sql`insert into financial_lesson_recognitions(booking_id,basis_id,basis_version,recognized_by,actor_kind,reason) values('recognized-booking','oklahoma-prospects',1,'owner','owner','Preserve original recognition')`;
  const before = await ledgers(f.sql);
  const dry = await previewFinancialBasisCutoverReadinessForOwner(f.sql, "owner");
  assert.deepEqual(dry.bindingPlan, []);
  assert.deepEqual(
    dry.blockers
      .filter((b) => b.code === "preserve_original_lesson_attribution")
      .map((b) => b.bookingId),
    ["pinned-booking", "recognized-booking"],
  );
  assert.deepEqual(await ledgers(f.sql), before);
});
