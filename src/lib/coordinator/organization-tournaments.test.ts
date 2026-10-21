import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import type { ClubRecord } from "../teams/types";
import { calculateFees, deadline, defaultBudget } from "../teams/fee-model";
import { withScheduledHotels } from "../teams/travel-budget";
import { priceComponents, publishedPrice } from "../teams/pricing";
import {
  defaultOrganizationTournamentFilters,
  filterOrganizationTournaments,
  organizationTournamentConflict,
  organizationTournamentExportInput,
  organizationTournamentSourceInput,
  safeOrganizationTournamentSourceUrl,
  type OrganizationTournamentSourceInput,
} from "./organization-tournaments-contracts";
import {
  organizationTournamentReport,
  organizationTournaments,
  saveOrganizationTournamentSource,
} from "./organization-tournaments.server";

type Json = Record<string, unknown>;
const CANARY = "PRIVATE-FINANCIAL-TOURNAMENT-CANARY";
const AMOUNT = 876543;
const source = "https://www.usssa.com/baseball/event_home/?eventID=12345";
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
  for (const user of ["steve", "sara", "parent", "coach", "fake-owner", "unverified", "disabled"]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${user},${user},${user + "@example.invalid"},${user !== "unverified"})`;
    await sql`insert into profiles(user_id,name,email,role) values(${user},${user},${user + "@example.invalid"},${["steve", "fake-owner"].includes(user) ? "admin" : user === "coach" ? "coach" : "parent"})`;
  }
  await sql`update "user" set "disabledAt"=now() where id='disabled'`;
  await sql`insert into owner_grants(email,user_id) values('steve@example.invalid','steve')`;
  for (const user of ["sara", "unverified", "disabled"])
    await sql`insert into organization_operational_access(user_id,status,updated_by) values(${user},'active','steve')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 1;
  const base = {
    id: "base-event",
    name: "Synthetic Baseball",
    org: "Synthetic organizer",
    city: "Broken Arrow",
    state: "OK",
    start: "2027-05-10",
    end: "2027-05-12",
    sport: "baseball",
    type: "tournament",
    ages: ["14U"],
    levels: ["AAA"],
    fee: AMOUNT,
    stayToPlay: true,
    verifiedOn: CANARY,
    sourceUrl: source,
    sourceCheckedOn: "2026-10-01",
    distanceMiles: 12,
    notes: CANARY,
    travel: { amount: AMOUNT },
    futureFinancial: { payee: CANARY, amount: AMOUNT },
  };
  club.catalog = [
    base,
    {
      ...base,
      id: "soft-event",
      name: "Synthetic Softball",
      sport: "softball",
      state: "TX",
      type: "showcase",
      distanceMiles: 200,
      sourceUrl: "https://www.perfectgame.org/Events/Default.aspx?event=54321",
    },
    { ...base, id: "overlap", name: "Synthetic overlap", start: "2027-05-11", end: "2027-05-11" },
    {
      ...base,
      id: "private-source",
      name: "Synthetic protected source",
      sourceUrl: `https://www.usssa.com/baseball/event_home/?eventID=12345&payment=${CANARY}`,
      sourceCheckedOn: "2026-10-01",
    },
    {
      ...base,
      id: "malformed-nested",
      name: "Synthetic old metadata",
      ages: ["14U", { fee: AMOUNT, note: CANARY }, null, 1],
      levels: ["Open", { note: CANARY, price: AMOUNT }],
      distanceMiles: { amount: AMOUNT },
      verifiedOn: { note: CANARY },
      sourceCheckedOn: CANARY,
    },
    { ...base, id: "activity-hidden", org: "Team schedule", name: CANARY },
    { ...base, id: "unknown-sport", sport: "other", name: CANARY },
  ] as unknown as ClubRecord["catalog"];
  club.teams = [
    structuredClone(club.teams[0]),
    structuredClone(club.teams[0]),
    structuredClone(club.teams[0]),
  ];
  club.teams.forEach((team, i) => {
    team.id = i === 0 ? "base" : i === 1 ? "soft" : "closed";
    team.name = `Synthetic ${team.id}`;
    team.sport = i === 1 ? "softball" : "baseball";
    team.age = "14U";
    team.closed = i === 2;
    team.seasonStart = "2027-01-01";
    team.seasonEnd = "2027-12-31";
    team.tournamentIds = i === 1 ? ["soft-event"] : ["base-event", "activity-hidden", "overlap"];
    team.notes = CANARY;
    team.eventBudget = AMOUNT;
    (team as unknown as Json).futureFinancial = { amount: AMOUNT, payee: CANARY };
    (team.tournamentIds as unknown[]).push({ amount: AMOUNT, note: CANARY });
    team.roster = team.roster.slice(0, 1);
    team.roster[0].payments = [
      {
        date: "2026-10-01",
        amount: AMOUNT,
        fee: AMOUNT,
        charged: AMOUNT,
        method: CANARY,
        label: CANARY,
        receipt: CANARY,
      },
    ];
  });
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  const budget = {
    ...defaultBudget(),
    start: "2027-01-01",
    end: "2027-12-31",
    scheduleCostsAutomatic: true,
    hotelNightly: 20000,
    hotelNights: 2,
    tournament: AMOUNT,
  };
  await sql`insert into team_fee_plans(team_id,revision,payload) values('base',7,${JSON.stringify({ status: "active", revision: 7, budget, history: [{ note: CANARY }] })}::jsonb)`;
  await sql`insert into finance_records(id,kind,payload) values('synthetic-finance','expense',${JSON.stringify({ amount: AMOUNT, note: CANARY })}::jsonb)`;
  return { sql, db, budget };
}
const input = (revision = 1): OrganizationTournamentSourceInput => ({
  id: "base-event",
  revision,
  sourceUrl: "https://www.perfectgame.org/Events/Default.aspx?event=65432",
  sourceCheckedOn: "2026-10-02",
  distanceMiles: 60,
});
const readClub = async (sql: Sql) =>
  (
    await sql<{
      payload: ClubRecord;
      rev: number;
    }>`select payload,rev from club_state where id='oklahoma-prospects'`
  )[0];
function privateFieldsAbsent(value: unknown) {
  assert.doesNotMatch(
    JSON.stringify(value),
    new RegExp(
      `${CANARY}|${AMOUNT}|entryFee|stayToPlay|verifiedOn|futureFinancial|payee|payments|notes|travel|settings|roster|budget|feeLock`,
    ),
  );
}
async function financialSnapshot(sql: Sql) {
  const tables = await sql<{
    tablename: string;
  }>`select tablename from pg_tables where schemaname='public' order by tablename`;
  const result: Record<string, unknown> = {};
  for (const { tablename } of tables.filter(({ tablename }) =>
    /^(commerce_|finance_|team_fee_|team_budget_|billing_|club_subscription|customer_payment_|fundraising_|booking_records|team_activities)/.test(
      tablename,
    ),
  )) {
    assert.match(tablename, /^[a-z_]+$/);
    result[tablename] = await sql.query(
      `select to_jsonb(t) as row from "${tablename}" t order by to_jsonb(t)::text`,
    );
  }
  return result;
}
function withoutSourceChanges(club: ClubRecord) {
  const copy = structuredClone(club) as unknown as Json & { catalog: Json[] };
  delete copy._rev;
  delete copy._savedAt;
  for (const event of copy.catalog)
    if (event.id === "base-event")
      for (const field of ["sourceUrl", "sourceCheckedOn", "distanceMiles"]) delete event[field];
  return copy;
}

test("operational source and export contracts reject financial fields, invalid dates, and private URLs", () => {
  assert.ok(organizationTournamentSourceInput.safeParse(input()).success);
  for (const field of [
    "fee",
    "entryFee",
    "travel",
    "stayToPlay",
    "name",
    "start",
    "sport",
    "tournamentIds",
    "teamId",
    "catalog",
    "notes",
    "verifiedOn",
  ])
    assert.equal(
      organizationTournamentSourceInput.safeParse({ ...input(), [field]: AMOUNT }).success,
      false,
      field,
    );
  for (const url of [
    "javascript:alert(1)",
    "https://evil.invalid/event",
    "https://www.usssa.com/invoice/123",
    "https://www.usssa.com/baseball_events?token=secret",
    "https://www.usssa.com/baseball/event_home/?eventID=12345&payment=secret",
    "https://www.usssa.com/baseball/event_home/?eventID=12345&eventID=99",
    "https://www.usssa.com/baseball_events#private",
    "https://user:password@www.usssa.com/baseball_events",
    "https://www.usssa.com.evil.invalid/baseball_events",
  ]) {
    assert.equal(safeOrganizationTournamentSourceUrl(url), "", url);
    assert.equal(
      organizationTournamentSourceInput.safeParse({ ...input(), sourceUrl: url }).success,
      false,
    );
  }
  assert.equal(
    organizationTournamentSourceInput.safeParse({ ...input(), sourceUrl: "" }).success,
    false,
  );
  assert.equal(
    organizationTournamentSourceInput.safeParse({ ...input(), sourceCheckedOn: "2026-02-30" })
      .success,
    false,
  );
  assert.equal(
    organizationTournamentSourceInput.safeParse({ ...input(), sourceCheckedOn: "9999-01-01" })
      .success,
    false,
  );
  for (const distanceMiles of [-1, Infinity, NaN, 5001])
    assert.equal(
      organizationTournamentSourceInput.safeParse({ ...input(), distanceMiles }).success,
      false,
    );
  for (const field of ["fee", "maxFee", "budget"])
    assert.equal(
      organizationTournamentExportInput.safeParse({
        teamId: "base",
        filters: { ...defaultOrganizationTournamentFilters(), [field]: 1 },
      }).success,
      false,
    );
});

test("reconstructed catalog, both sports, filters and safe export never disclose financial canaries", async () => {
  const { db, sql } = await fixture();
  try {
    const before = await readClub(sql),
      finances = await financialSnapshot(sql);
    const workspace = await organizationTournaments(sql, "steve");
    privateFieldsAbsent(workspace);
    assert.deepEqual(
      workspace.teams.map((team) => team.id),
      ["base", "soft"],
    );
    assert.equal(workspace.catalog.length, 5);
    const base = workspace.teams[0],
      soft = workspace.teams[1];
    assert.deepEqual(base.tournamentIds, ["base-event", "overlap"]);
    const hidden = workspace.catalog.find((event) => event.id === "private-source")!;
    assert.equal(hidden.sourceUrl, "");
    assert.equal(hidden.sourceCheckedOn, "");
    assert.equal(hidden.sourceEditable, false);
    const malformed = workspace.catalog.find((event) => event.id === "malformed-nested")!;
    assert.deepEqual(malformed.ages, ["14U"]);
    assert.deepEqual(malformed.levels, ["Open"]);
    assert.equal(malformed.distanceMiles, null);
    assert.equal(malformed.sourceCheckedOn, "");
    assert.equal(malformed.sourceEditable, false);
    assert.ok(
      filterOrganizationTournaments(
        workspace.catalog,
        defaultOrganizationTournamentFilters(base),
        base,
      ).every((event) => event.sport === "baseball"),
    );
    assert.deepEqual(
      filterOrganizationTournaments(
        workspace.catalog,
        defaultOrganizationTournamentFilters(soft),
        soft,
      ).map((event) => event.id),
      ["soft-event"],
    );
    const all = { ...defaultOrganizationTournamentFilters(), range: "all" as const };
    assert.equal(
      filterOrganizationTournaments(workspace.catalog, {
        ...all,
        query: "  softball  ",
        state: "TX",
        type: "showcase",
      }).length,
      1,
    );
    assert.equal(
      filterOrganizationTournaments(workspace.catalog, { ...all, maxDistance: "50" }).length,
      3,
    );
    assert.equal(
      filterOrganizationTournaments(workspace.catalog, { ...all, division: "Open" }).length,
      1,
    );
    assert.deepEqual(
      filterOrganizationTournaments(workspace.catalog, { ...all, plannedOnly: true }, soft).map(
        (event) => event.id,
      ),
      ["soft-event"],
    );
    assert.equal(
      filterOrganizationTournaments(workspace.catalog, { ...all, plannedOnly: true }).length,
      0,
    );
    assert.equal(
      filterOrganizationTournaments(workspace.catalog, {
        ...all,
        range: "custom",
        from: "2027-05-11",
        to: "2027-05-11",
      }).length,
      5,
    );
    assert.equal(
      filterOrganizationTournaments(workspace.catalog, {
        ...all,
        range: "custom",
        from: "2027-05-12",
        to: "2027-05-11",
      }).length,
      0,
    );
    assert.equal(
      organizationTournamentConflict(workspace.catalog[0], base, workspace.catalog)?.id,
      "overlap",
    );
    const report = await organizationTournamentReport(sql, "steve", {
      teamId: "soft",
      filters: { ...all, plannedOnly: true },
    });
    privateFieldsAbsent(report);
    assert.match(report.body, /Synthetic Softball/);
    assert.doesNotMatch(report.body, /Synthetic Baseball/);
    assert.equal(report.body.split("\r\n").length, 3);
    assert.deepEqual(await organizationTournaments(sql, "steve"), workspace);
    assert.deepEqual(await readClub(sql), before);
    assert.deepEqual(await financialSnapshot(sql), finances);
    const modified = structuredClone(before.payload);
    modified.catalog[0].name = '=HYPERLINK("https://example.invalid")';
    await sql`update club_state set payload=${JSON.stringify(modified)}::jsonb where id='oklahoma-prospects'`;
    const csv = await organizationTournamentReport(sql, "steve", { teamId: "", filters: all });
    assert.match(csv.body, /"'=HYPERLINK\(""https:\/\/example.invalid""\)"/);
    await assert.rejects(
      () => organizationTournamentReport(sql, "steve", { teamId: "closed", filters: all }),
      /not authorized/,
    );
  } finally {
    await db.close();
  }
});

test("source edits preserve every other club value, financial table, quoted fee and deadline", async () => {
  const { db, sql, budget } = await fixture();
  try {
    const before = await readClub(sql),
      finances = await financialSnapshot(sql);
    const outputs = async () => {
      const club = (await readClub(sql)).payload,
        team = club.teams[0];
      const effective = await withScheduledHotels(sql, team.id, budget);
      return {
        effective,
        fees: calculateFees(effective),
        deadline: deadline(
          effective,
          club.catalog.filter((event) => team.tournamentIds.includes(event.id)),
        ),
        full: priceComponents(team, club.settings, 100, "full"),
        po: priceComponents(team, club.settings, 100, "po"),
        published: publishedPrice(club, team, team.roster[0]),
      };
    };
    const pricedBefore = await outputs();
    const result = await saveOrganizationTournamentSource(sql, "steve", input());
    assert.deepEqual(result, { revision: 2, changed: true });
    privateFieldsAbsent(result);
    const after = await readClub(sql);
    assert.deepEqual(withoutSourceChanges(after.payload), withoutSourceChanges(before.payload));
    assert.deepEqual(await financialSnapshot(sql), finances);
    assert.deepEqual(await outputs(), pricedBefore);
    assert.equal(after.payload.catalog[0].sourceUrl, input().sourceUrl);
    assert.equal(after.payload.catalog[0].distanceMiles, 60);
    assert.deepEqual(await saveOrganizationTournamentSource(sql, "steve", input(2)), {
      revision: 2,
      changed: false,
    });
    await assert.rejects(() => saveOrganizationTournamentSource(sql, "steve", input(1)), /changed/);
    await assert.rejects(
      () => saveOrganizationTournamentSource(sql, "steve", { ...input(2), id: "private-source" }),
      /owner review/,
    );
    await assert.rejects(
      () => saveOrganizationTournamentSource(sql, "steve", { ...input(2), id: "malformed-nested" }),
      /owner review/,
    );
    await assert.rejects(
      () => saveOrganizationTournamentSource(sql, "steve", { ...input(2), id: "activity-hidden" }),
      /not authorized/,
    );
    await assert.rejects(() =>
      saveOrganizationTournamentSource(sql, "steve", {
        ...input(2),
        fee: 1,
      } as OrganizationTournamentSourceInput),
    );
    assert.deepEqual(await readClub(sql), after);
    assert.deepEqual(
      await saveOrganizationTournamentSource(sql, "steve", {
        ...input(2),
        sourceUrl: "",
        sourceCheckedOn: "",
        distanceMiles: null,
      }),
      { revision: 3, changed: true },
    );
    assert.deepEqual(await outputs(), pricedBefore);
    assert.deepEqual(await financialSnapshot(sql), finances);
    const audit = await sql<{ details: unknown }>`select details from coordinator_audit`;
    privateFieldsAbsent(audit);
    const beforeFailure = await readClub(sql);
    await db.exec(
      `create function synthetic_reject_tournament_write() returns trigger language plpgsql as $$ begin raise exception 'Synthetic atomic write failure'; end $$; create trigger synthetic_reject_tournament_write before update on club_state for each row execute function synthetic_reject_tournament_write();`,
    );
    await assert.rejects(
      () => saveOrganizationTournamentSource(sql, "steve", input(3)),
      /Synthetic atomic write failure/,
    );
    assert.deepEqual(await readClub(sql), beforeFailure);
    assert.deepEqual(await financialSnapshot(sql), finances);
  } finally {
    await db.close();
  }
});

test("every read, download and save rechecks active organization authority and denied calls make no changes", async () => {
  const { db, sql } = await fixture();
  try {
    const before = await readClub(sql),
      finances = await financialSnapshot(sql);
    const attempts = (user: string) => [
      () => organizationTournaments(sql, user),
      () =>
        organizationTournamentReport(sql, user, {
          teamId: "base",
          filters: defaultOrganizationTournamentFilters(),
        }),
      () => saveOrganizationTournamentSource(sql, user, input()),
    ];
    for (const user of ["parent", "coach", "fake-owner", "unverified", "disabled", "missing"])
      for (const attempt of attempts(user)) await assert.rejects(attempt, /not authorized/);
    for (const status of ["active", "suspended", "removed"]) {
      await sql`update organization_operational_access set status=${status} where user_id='sara'`;
      for (const attempt of attempts("sara")) await assert.rejects(attempt, /not authorized/);
    }
    assert.deepEqual(await readClub(sql), before);
    assert.deepEqual(await financialSnapshot(sql), finances);
  } finally {
    await db.close();
  }
});

test("tournament adapters always use operational middleware and transactional authority without legacy saves", async () => {
  const api = await readFile("src/lib/coordinator/organization-tournaments-api.ts", "utf8");
  const server = await readFile("src/lib/coordinator/organization-tournaments.server.ts", "utf8");
  const component = await readFile(
    "src/components/coordinator/organization-tournaments.tsx",
    "utf8",
  );
  assert.equal((api.match(/middleware\(\[operationalAuthMiddleware\]\)/g) || []).length, 3);
  assert.equal(
    (server.match(/await requireOrganizationOperations\(tx, userId\)/g) || []).length,
    3,
  );
  assert.equal((server.match(/return secured\(sql, userId/g) || []).length, 3);
  assert.doesNotMatch(
    server,
    /saveTeamActivity|saveTeamsClub|requireAdmin|update team_fee|insert into team_fee|update finance_|update commerce_|fetch\(/,
  );
  assert.doesNotMatch(
    component,
    /\bClubRecord\b(?!.|$).*:|saveTeamsClub|\.fee\b|\.travel\b|\.notes\b|\.verifiedOn\b/,
  );
});
