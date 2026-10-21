import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import type { ClubRecord } from "../teams/types";
import { statKeys } from "../teams/activity-contracts";
import { publicTeamView } from "../teams/public-view";
import { publicTeamGames } from "../teams/activity.server";
import { ROSTER_CONSENT_TEXT, ROSTER_CONSENT_VERSION } from "../roster-consent";
import { calculateFees, defaultBudget } from "../teams/fee-model";
import { withScheduledHotels } from "../teams/travel-budget";
import {
  organizationGameResultInput,
  type OrganizationGameResultInput,
} from "./organization-contracts";
import {
  organizationGameResults,
  saveOrganizationGameResult,
} from "./organization-game-results.server";

type Json = Record<string, unknown>;
const CANARY = "PRIVATE-FINANCIAL-GAME-CANARY";
const AMOUNT = 91827345;
const zero = { ab: 0, h: 0, r: 0, hr: 0, rbi: 0, sb: 0, bb: 0, so: 0 };
const originalStats = { ab: 4, h: 2, r: 1, hr: 1, rbi: 2, sb: 0, bb: 1, so: 1 };
async function fixture() {
  const db = new PGlite();
  for (const file of (await readdir("migrations")).filter((name) => name.endsWith(".sql")).sort())
    await db.exec(await readFile(`migrations/${file}`, "utf8"));
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((query, part, i) => query + (i ? `$${i}` : "") + part, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (statement: string, values: unknown[] = []) =>
      (await query(statement, values)).rows) as Sql["query"];
    sql.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  const sql = wrap(db.query.bind(db));
  for (const userId of ["steve", "sara", "parent", "coach", "fake-owner", "no-grant"]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${userId},${userId},${userId + "@example.invalid"},true)`;
    await sql`insert into profiles(user_id,name,email,role) values(${userId},${userId},${userId + "@example.invalid"},${userId === "steve" || userId === "fake-owner" ? "admin" : userId === "coach" ? "coach" : "parent"})`;
  }
  await sql`insert into owner_grants(email,user_id) values('steve@example.invalid','steve')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('sara','active','steve')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 1;
  club.teams = [structuredClone(club.teams[0]), structuredClone(club.teams[0])];
  club.teams.forEach((team, index) => {
    team.id = index ? "soft" : "base";
    team.name = `Synthetic ${team.id}`;
    team.sport = index ? "softball" : "baseball";
    team.closed = false;
    team.record = { w: 8, l: 3, t: 1 };
    team.coachEmail = "coach@example.invalid";
    (team.record as unknown as Json).privateFuture = CANARY;
    team.roster = team.roster.slice(0, 2);
    team.roster.forEach((player, i) => {
      player.id = `${team.id}-p${i + 1}`;
      player.name = `Synthetic Player ${index}-${i}`;
      player.teamId = team.id;
      player.withdrawn = false;
      player.stats = { ab: 40, h: 12, r: 8, hr: 3, rbi: 12, sb: 2, bb: 8, so: 6, avg: 0.3 };
      (player.stats as unknown as Json).privateFuture = CANARY;
      (player as unknown as Json).financialFuture = { amount: AMOUNT, note: CANARY };
      player.rosterConsent = {
        version: ROSTER_CONSENT_VERSION,
        text: ROSTER_CONSENT_TEXT,
        signedBy: "Synthetic Guardian",
        signerEmail: "guardian@example.invalid",
        signedAt: "2026-01-01T12:00:00Z",
        ...(i ? { revokedAt: "2026-02-01T12:00:00Z" } : {}),
      };
      player.payments = [
        { id: randomUUID(), amount: AMOUNT, label: CANARY },
      ] as unknown as typeof player.payments;
    });
    (team as unknown as Json).privateFuture = CANARY;
  });
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  const gameId = randomUUID();
  const game = {
    id: gameId,
    teamId: "base",
    revision: 1,
    kind: "game",
    title: "Synthetic opponent",
    date: "2027-05-12",
    startTime: "16:00",
    endTime: "18:00",
    location: "Synthetic field",
    status: "final",
    ourRuns: 6,
    oppRuns: 2,
    season: "Spring 2027",
    travel: "travel",
    overnightNights: 2,
    entryFee: AMOUNT,
    invoice: CANARY,
    stats: [
      {
        playerId: "base-p1",
        values: { ...originalStats, privateFuture: CANARY },
        privateFuture: { amount: AMOUNT },
      },
    ],
  };
  await sql`insert into team_activities(id,team_id,payload,updated_by) values(${gameId},'base',${JSON.stringify(game)}::jsonb,'steve')`;
  const budget = {
    ...defaultBudget(),
    start: "2027-01-01",
    end: "2027-12-31",
    scheduleCostsAutomatic: true,
    hotelNightly: 20000,
    hotelNights: 2,
    tournament: AMOUNT,
  };
  await sql`insert into team_fee_plans(team_id,revision,payload) values('base',7,${JSON.stringify({ status: "active", revision: 7, budget, history: [{ memo: CANARY }], privateFuture: AMOUNT })}::jsonb)`;
  await sql`insert into finance_records(id,kind,payload) values('synthetic-finance','expense',${JSON.stringify({ amount: AMOUNT, note: CANARY })}::jsonb)`;
  return { db, sql, gameId, budget };
}
const clubFor = async (sql: Sql) =>
  (
    await sql<{
      payload: ClubRecord;
      rev: number;
    }>`select payload,rev from club_state where id='oklahoma-prospects'`
  )[0];
const gameFor = async (sql: Sql, id: string) =>
  (
    await sql<{
      payload: Json;
      revision: number;
    }>`select payload,revision from team_activities where id=${id}`
  )[0];
const correction = (id: string, revision = 1): OrganizationGameResultInput => ({
  id,
  teamId: "base",
  revision,
  status: "final",
  ourRuns: 1,
  oppRuns: 2,
  stats: [{ playerId: "base-p1", values: { ...zero, ab: 3, h: 1, rbi: 1, so: 2 } }],
});
async function financialSnapshot(sql: Sql) {
  const tables = await sql<{
    tablename: string;
  }>`select tablename from pg_tables where schemaname='public' order by tablename`;
  const selected = tables.filter(({ tablename }) =>
    /^(commerce_|finance_|team_fee_|team_budget_|billing_|club_subscription|customer_payment_|fundraising_|booking_records)/.test(
      tablename,
    ),
  );
  const result: Record<string, unknown> = {};
  for (const { tablename } of selected) {
    assert.match(tablename, /^[a-z_]+$/);
    result[tablename] = await sql.query(
      `select to_jsonb(t) as row from "${tablename}" t order by to_jsonb(t)::text`,
    );
  }
  return result;
}
function withoutTotals(club: ClubRecord) {
  const copy = structuredClone(club) as unknown as Json & {
    teams: (Json & { record: Json; roster: (Json & { stats: Json })[] })[];
  };
  delete copy._rev;
  delete copy._savedAt;
  for (const team of copy.teams) {
    for (const key of ["w", "l", "t"]) delete team.record[key];
    for (const player of team.roster)
      for (const key of [...statKeys, "avg"]) delete player.stats[key];
  }
  return copy;
}
function withoutResult(game: Json) {
  const copy = structuredClone(game);
  for (const key of ["status", "ourRuns", "oppRuns", "stats", "revision"]) delete copy[key];
  return copy;
}
function assertPrivate(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(
    serialized,
    new RegExp(
      `${CANARY}|${AMOUNT}|entryFee|invoice|financialFuture|privateFuture|payments|rosterConsent`,
    ),
  );
}

test("game-result contract accepts only result fields and validated unique batting lines", () => {
  const input = correction(randomUUID());
  assert.ok(organizationGameResultInput.safeParse(input).success);
  for (const field of [
    "entryFee",
    "date",
    "location",
    "travel",
    "overnightNights",
    "season",
    "teamIdOverride",
    "tournamentIds",
    "kind",
    "published",
  ])
    assert.equal(
      organizationGameResultInput.safeParse({ ...input, [field]: "injected" }).success,
      false,
      field,
    );
  assert.equal(
    organizationGameResultInput.safeParse({ ...input, status: "cancelled" }).success,
    false,
  );
  assert.equal(
    organizationGameResultInput.safeParse({ ...input, stats: [input.stats[0], input.stats[0]] })
      .success,
    false,
  );
  assert.equal(
    organizationGameResultInput.safeParse({
      ...input,
      stats: [{ ...input.stats[0], invoice: CANARY }],
    }).success,
    false,
  );
  assert.equal(
    organizationGameResultInput.safeParse({
      ...input,
      stats: [{ ...input.stats[0], values: { ...zero, ab: 1, h: 2 } }],
    }).success,
    false,
  );
  assert.equal(
    organizationGameResultInput.safeParse({
      ...input,
      stats: [{ ...input.stats[0], values: { ...zero, cost: AMOUNT } }],
    }).success,
    false,
  );
});

test("game workspace is projected across sports and requires current organization authority", async () => {
  const { db, sql, gameId } = await fixture();
  try {
    const workspace = await organizationGameResults(sql, "steve");
    assert.equal(workspace.teams.length, 2);
    assert.equal(workspace.teams[1].sport, "softball");
    assert.equal(workspace.teams[0].players[0].stats.h, 12);
    assert.equal(workspace.teams[0].games[0].stats[0].values.h, 2);
    assertPrivate(workspace);
    assertPrivate(await organizationGameResults(sql, "steve"));
    const before = await clubFor(sql);
    for (const who of ["parent", "coach", "no-grant", "fake-owner"]) {
      await assert.rejects(() => organizationGameResults(sql, who), /not authorized/);
      await assert.rejects(
        () => saveOrganizationGameResult(sql, who, correction(gameId)),
        /not authorized/,
      );
    }
    for (const status of ["active", "suspended", "removed"]) {
      await sql`update organization_operational_access set status=${status} where user_id='sara'`;
      await assert.rejects(() => organizationGameResults(sql, "sara"), /not authorized/);
      await assert.rejects(
        () => saveOrganizationGameResult(sql, "sara", correction(gameId)),
        /not authorized/,
      );
    }
    await sql`update organization_operational_access set status='active' where user_id='sara'`;
    await sql`update "user" set "emailVerified"=false where id='sara'`;
    await assert.rejects(
      () => saveOrganizationGameResult(sql, "sara", correction(gameId)),
      /not authorized/,
    );
    await sql`update "user" set "emailVerified"=true,"disabledAt"=now() where id='sara'`;
    await assert.rejects(() => organizationGameResults(sql, "sara"), /not authorized/);
    assert.deepEqual(await clubFor(sql), before);
    assert.equal((await gameFor(sql, gameId)).revision, 1);
  } finally {
    await db.close();
  }
});

test("final correction reverses the previous result while preserving all other fields, financial relations, and fee outputs", async () => {
  const { db, sql, gameId, budget } = await fixture();
  try {
    const before = await clubFor(sql),
      beforeGame = await gameFor(sql, gameId);
    const finances = await financialSnapshot(sql);
    const computedBudget = await withScheduledHotels(sql, "base", budget);
    const fees = calculateFees(computedBudget);
    const saved = await saveOrganizationGameResult(sql, "steve", correction(gameId));
    assert.deepEqual(saved, { id: gameId, revision: 2, changed: true });
    const after = await clubFor(sql),
      afterGame = await gameFor(sql, gameId);
    const team = after.payload.teams[0],
      player = team.roster[0];
    assert.deepEqual(
      { w: team.record.w, l: team.record.l, t: team.record.t },
      { w: 7, l: 4, t: 1 },
    );
    for (const key of statKeys)
      assert.equal(
        player.stats[key],
        before.payload.teams[0].roster[0].stats[key] -
          originalStats[key] +
          correction(gameId).stats[0].values[key],
      );
    assert.equal(player.stats.avg, 11 / 39);
    assert.deepEqual(withoutTotals(after.payload), withoutTotals(before.payload));
    assert.deepEqual(withoutResult(afterGame.payload), withoutResult(beforeGame.payload));
    const nested = (afterGame.payload.stats as Json[])[0];
    assert.deepEqual(nested.privateFuture, { amount: AMOUNT });
    assert.equal((nested.values as Json).privateFuture, CANARY);
    assert.deepEqual(await financialSnapshot(sql), finances);
    assert.deepEqual(await withScheduledHotels(sql, "base", budget), computedBudget);
    assert.deepEqual(calculateFees(await withScheduledHotels(sql, "base", budget)), fees);
    assert.equal(after.rev, before.rev + 1);
    assertPrivate(saved);
    assertPrivate(await organizationGameResults(sql, "steve"));
    const publicView = publicTeamView(team);
    assert.deepEqual(
      publicView.players.map((p) => p.id),
      ["base-p1"],
    );
    assert.deepEqual(
      team.roster.map((p) => p.rosterConsent),
      before.payload.teams[0].roster.map((p) => p.rosterConsent),
    );
    const publicGames = await publicTeamGames(sql);
    assert.equal(publicGames[0].ourRuns, 1);
    assert.doesNotMatch(JSON.stringify(publicGames), /base-p1|base-p2|Synthetic Player|PRIVATE/);
  } finally {
    await db.close();
  }
});

test("scheduled/live results stay out of cumulative totals; repeated and stale writes cannot double-count", async () => {
  const { db, sql, gameId } = await fixture();
  try {
    const original = await clubFor(sql);
    const live = { ...correction(gameId), status: "live" as const };
    await saveOrganizationGameResult(sql, "steve", live);
    const reversed = await clubFor(sql);
    assert.equal(reversed.payload.teams[0].record.w, 7);
    assert.equal(reversed.payload.teams[0].roster[0].stats.ab, 36);
    assert.equal(reversed.payload.teams[0].roster[0].stats.h, 10);
    await assert.rejects(() => saveOrganizationGameResult(sql, "steve", live), /changed/);
    assert.deepEqual(await clubFor(sql), reversed);
    const unchanged = await saveOrganizationGameResult(sql, "steve", { ...live, revision: 2 });
    assert.equal(unchanged.changed, false);
    assert.equal(unchanged.revision, 2);
    assert.deepEqual(await clubFor(sql), reversed);
    await saveOrganizationGameResult(sql, "steve", {
      ...live,
      revision: 2,
      status: "scheduled",
      stats: [],
    });
    const scheduled = await clubFor(sql);
    assert.deepEqual(
      scheduled.payload.teams[0].roster[0].stats,
      reversed.payload.teams[0].roster[0].stats,
    );
    const cleared = (await gameFor(sql, gameId)).payload.stats as Json[];
    for (const key of statKeys) assert.equal((cleared[0].values as Json)[key], 0);
    assert.equal((cleared[0].values as Json).privateFuture, CANARY);
    const tied = {
      ...correction(gameId, 3),
      status: "final" as const,
      ourRuns: 4,
      oppRuns: 4,
      stats: [{ playerId: "base-p1", values: originalStats }],
    };
    await saveOrganizationGameResult(sql, "steve", tied);
    const restored = await clubFor(sql);
    assert.deepEqual(
      restored.payload.teams[0].roster[0].stats,
      original.payload.teams[0].roster[0].stats,
    );
    assert.deepEqual(
      { ...restored.payload.teams[0].record },
      { ...original.payload.teams[0].record, w: 7, t: 2 },
    );
    await assert.rejects(() => saveOrganizationGameResult(sql, "steve", tied), /changed/);
    assert.deepEqual(await clubFor(sql), restored);
  } finally {
    await db.close();
  }
});

test("result endpoint rejects new records, cross-team statistics, altered scopes, cancelled games, and financially coupled fields", async () => {
  const { db, sql, gameId } = await fixture();
  try {
    const before = await clubFor(sql),
      beforeGame = await gameFor(sql, gameId);
    for (const input of [
      { ...correction(gameId), id: randomUUID() },
      { ...correction(gameId), teamId: "soft" },
      { ...correction(gameId), stats: [{ playerId: "soft-p1", values: originalStats }] },
      { ...correction(gameId), entryFee: 0 },
      { ...correction(gameId), date: "2028-01-01" },
      { ...correction(gameId), status: "cancelled" },
    ])
      await assert.rejects(() =>
        saveOrganizationGameResult(sql, "steve", input as OrganizationGameResultInput),
      );
    assert.deepEqual(await clubFor(sql), before);
    assert.deepEqual(await gameFor(sql, gameId), beforeGame);
    for (const [kind, status] of [
      ["game", "cancelled"],
      ["practice", "scheduled"],
      ["tournament", "scheduled"],
    ]) {
      await sql`update team_activities set payload=jsonb_set(jsonb_set(payload,'{kind}',${JSON.stringify(kind)}::jsonb),'{status}',${JSON.stringify(status)}::jsonb) where id=${gameId}`;
      await assert.rejects(
        () => saveOrganizationGameResult(sql, "steve", correction(gameId)),
        /Only scheduled/,
      );
    }
    assert.equal((await gameFor(sql, gameId)).revision, 1);
    assert.deepEqual(await clubFor(sql), before);
    await sql`update club_state set demo=true where id='oklahoma-prospects'`;
    await assert.rejects(() => organizationGameResults(sql, "steve"), /not authorized/);
    await assert.rejects(
      () => saveOrganizationGameResult(sql, "steve", correction(gameId)),
      /not authorized/,
    );
  } finally {
    await db.close();
  }
});

test("a failed club write rolls back activity and totals together", async () => {
  const { db, sql, gameId } = await fixture();
  try {
    const before = await clubFor(sql),
      beforeGame = await gameFor(sql, gameId);
    await db.exec(
      `create function synthetic_reject_game_club_write() returns trigger language plpgsql as $$ begin raise exception 'Synthetic atomic write failure'; end $$; create trigger synthetic_reject_game_club_write before update on club_state for each row execute function synthetic_reject_game_club_write();`,
    );
    await assert.rejects(
      () => saveOrganizationGameResult(sql, "steve", correction(gameId)),
      /Synthetic atomic write failure/,
    );
    assert.deepEqual(await clubFor(sql), before);
    assert.deepEqual(await gameFor(sql, gameId), beforeGame);
  } finally {
    await db.close();
  }
});

test("result transports stay on operational auth and never reuse the fee-changing scorer", async () => {
  const api = await readFile("src/lib/coordinator/organization-game-results-api.ts", "utf8");
  const server = await readFile("src/lib/coordinator/organization-game-results.server.ts", "utf8");
  assert.equal((api.match(/middleware\(\[operationalAuthMiddleware\]\)/g) || []).length, 2);
  assert.doesNotMatch(
    server,
    /saveTeamActivity|withScheduledHotels|update team_fee|insert into team_fee|update finance_|update commerce_/,
  );
  assert.equal(
    (server.match(/await requireOrganizationOperations\(tx, userId\)/g) || []).length,
    2,
  );
  assert.equal((server.match(/return secured\(sql, userId/g) || []).length, 2);
});
