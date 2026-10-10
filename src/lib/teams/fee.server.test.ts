import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "./seed";
import { feeWorkspace, mutateFeePlan, setFeeBusiness, teamUniform } from "./fee.server";
import { defaultBudget, calculateFees } from "./fee-model";

for (const role of ["full", "po"] as const)
  test(`team financial permissions, approvals, immutable ${role} fees, uniform release and concurrent edits`, async () => {
    const db = new PGlite();
    const wrap = (query: PGlite["query"]): Sql => {
      const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
        (
          await query(
            parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
            values,
          )
        ).rows) as Sql;
      sql.query = (async (text: string, values: unknown[] = []) =>
        (await query(text, values)).rows) as Sql["query"];
      sql.transaction = (fn) =>
        db.transaction((tx) => fn(wrap(tx.query.bind(tx) as PGlite["query"])));
      return sql;
    };
    try {
      for (const n of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
        await db.exec(await readFile("migrations/" + n, "utf8"));
      const sql = wrap(db.query.bind(db));

      for (const [id, role] of [
        ["owner", "admin"],
        ["coach", "coach"],
        ["parent", "parent"],
        ["stranger", "parent"],
        ["player", "player"],
      ]) {
        await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.invalid"},${id},true,now(),now())`;
        await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${role},${"fam-" + id})`;
      }
      await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
      const club = sampleClub();
      club._demo = false;
      club.teams = club.teams.slice(0, 1);
      const team = club.teams[0];
      team.coachEmail = "coach@example.invalid";
      team.staff = [];
      team.closed = false;
      team.roster = team.roster.slice(0, 2);
      const player = team.roster[0];
      player.parents = [
        { name: "Parent", rel: "parent", phone: "", email: "parent@example.invalid" },
      ];
      player.email = "player@example.invalid";
      player.feeLock = null;
      player.planLock = null;
      player.payments = [];
      player.credits = [];
      player.agreement = { version: "", signedBy: "", signedAt: "" };
      player.roleType = role;
      player.withdrawn = false;
      const other = team.roster[1];
      other.familyId = "other-home";
      other.parents = [];
      await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,0,false)`;
      await sql`update team_budget_master set payload=jsonb_set(payload,'{overheadReviewed}','true'::jsonb) where id='master'`;
      const budget = {
        ...defaultBudget(),
        poEnabled: true,
        readiness: {
          schedule: true,
          gas: true,
          hotels: true,
          other: true,
          processing: true,
          noUniform: false,
        },
        processingZeroReason: "No processing charge in this fixture",
        start: "2027-04-01",
        end: "2027-06-15",
        months: 2.5,
        fullOrg: 45678,
        poOrg: 20000,
        paymentSchedule: {
          mode: "percent" as const,
          rows: [
            { full: 4000, po: 2500, due: "" },
            { full: 2000, po: 2500, due: "2027-01-01" },
            { full: 2000, po: 2500, due: "2027-02-01" },
            { full: 2000, po: 2500, due: "" },
          ],
        },
        secondDue: "2027-02-01",
        deadlineOverride: "2027-03-01",
        uniformCutoff: "2027-02-15",
        policy: "Written policy reviewed.",
        reinstatement: "Pay the outstanding balance.",
        costs: [{ id: "private", name: "Private owner cost", cents: 98765 }],
      };
      const save = {
        action: "save" as const,
        teamId: team.id,
        revision: 0,
        budget,
        uniforms: [
          {
            id: "navy",
            name: "Navy package",
            items: "Jersey, hat",
            price: 20000,
            cost: 0,
            active: true,
            photos: [
              {
                id: "front",
                caption: "Navy jersey front",
                src: "data:image/png;base64,iVBORw0KGgo=",
              },
            ],
          },
          {
            id: "maroon",
            name: "Maroon package",
            items: "Jersey",
            price: 10000,
            cost: 0,
            active: true,
            photos: [],
          },
        ],
        expenses: [],
      };
      for (const id of ["coach", "parent", "player", "stranger"])
        await assert.rejects(() => mutateFeePlan(sql, id, save), /Admin/);
      await mutateFeePlan(sql, "owner", save);
      await assert.rejects(() => mutateFeePlan(sql, "owner", save), /changed/);
      for (const id of ["parent", "player", "stranger"])
        await assert.rejects(
          () =>
            mutateFeePlan(sql, id, {
              action: "propose",
              teamId: team.id,
              revision: 1,
              tournament: 10000,
              uniformId: "",
            }),
          /coach/,
        );
      await mutateFeePlan(sql, "coach", {
        action: "propose",
        teamId: team.id,
        revision: 1,
        tournament: 10000,
        uniformId: "navy",
      });
      for (const id of ["owner", "coach", "parent", "player"]) {
        const selected = await teamUniform(sql, id, team.id);
        assert.equal(selected?.name, "Navy package");
        assert.equal(selected?.photos[0].caption, "Navy jersey front");
        assert.deepEqual(Object.keys(selected!).sort(), ["items", "name", "photos"]);
      }
      await assert.rejects(() => teamUniform(sql, "stranger", team.id), /Assigned team/);
      await assert.rejects(() => teamUniform(sql, "coach", "not-their-team"), /Assigned team/);
      let coach = await feeWorkspace(sql, "coach");
      assert.equal(coach.teams[0].status, "pending");
      assert.equal(coach.teams[0].choices?.uniforms[0].photos[0].caption, "Navy jersey front");
      assert.equal(coach.teams[0].private, null);
      assert.equal(coach.business, null);
      assert.ok(!JSON.stringify(coach).includes("Private owner cost"));
      assert.ok(!JSON.stringify(coach).includes("45678"));
      const stranger = await feeWorkspace(sql, "stranger");
      assert.equal(stranger.teams.length, 0);
      await assert.rejects(
        () =>
          mutateFeePlan(sql, "coach", {
            action: "publish",
            teamId: team.id,
            revision: 2,
            confirmed: true,
          }),
        /Admin/,
      );
      await mutateFeePlan(sql, "owner", {
        action: "publish",
        teamId: team.id,
        revision: 2,
        confirmed: true,
      });
      const parent = await feeWorkspace(sql, "parent");
      assert.equal(parent.teams[0].players.length, 1);
      assert.equal(parent.teams[0].choices, null);
      assert.equal(parent.teams[0].private, null);
      const accept = {
        action: "accept" as const,
        teamId: team.id,
        revision: 3,
        playerId: player.id,
        consent: true as const,
        name: "Parent Person",
      };
      await assert.rejects(() => mutateFeePlan(sql, "stranger", accept), /guardian/);
      await mutateFeePlan(sql, "parent", accept);
      let [stored] = await sql<{
        payload: typeof club;
      }>`select payload from club_state where id='oklahoma-prospects'`;
      const signed = stored.payload.teams[0].roster[0];
      assert.ok(signed.feeLock);
      const [allocationPlan] = await sql<{
        payload: import("./fee-contracts").FeePlan;
      }>`select payload from team_fee_plans where team_id=${team.id}`;
      assert.equal(
        allocationPlan.payload.players[player.id].membershipAllocation,
        role === "po" ? 37500 : 50000,
      );
      assert.equal(
        Math.round(signed.feeLock!.amount * 100),
        allocationPlan.payload.published![role],
      );
      assert.equal(signed.planLock!.rows.length, 4);
      assert.equal(
        signed.planLock!.rows.reduce((s, r) => s + Math.round(r.amount * 100), 0),
        Math.round(signed.feeLock!.amount * 100),
      );
      assert.equal(signed.depositPaid, false);
      await assert.rejects(
        () =>
          mutateFeePlan(sql, "owner", {
            action: "releaseUniform",
            teamId: team.id,
            revision: 4,
            playerId: player.id,
          }),
        /deposit/,
      );
      await assert.rejects(
        () =>
          mutateFeePlan(sql, "owner", {
            action: "roster",
            teamId: team.id,
            revision: 4,
            playerId: player.id,
            status: "Removed",
            note: "Late by one day",
          }),
        /threshold/,
      );
      const owner = await feeWorkspace(sql, "owner");
      const plan = owner.teams[0].private!.plan;
      await mutateFeePlan(sql, "owner", {
        action: "save",
        teamId: team.id,
        revision: 4,
        budget: { ...plan.budget, fullOrg: 90000, coachTournament: false, uniformId: "maroon" },
        uniforms: save.uniforms.map((u) => ({ ...u, photos: [] })),
        expenses: [],
      });
      assert.deepEqual((await teamUniform(sql, "player", team.id))?.photos, []);
      assert.equal((await teamUniform(sql, "parent", team.id))?.name, "Maroon package");
      await assert.rejects(
        () =>
          mutateFeePlan(sql, "coach", {
            action: "propose",
            teamId: team.id,
            revision: 5,
            tournament: 20000,
            uniformId: "",
          }),
        /controlled/,
      );
      await mutateFeePlan(sql, "owner", {
        action: "publish",
        teamId: team.id,
        revision: 5,
        confirmed: true,
      });
      [stored] = await sql<{
        payload: typeof club;
      }>`select payload from club_state where id='oklahoma-prospects'`;
      assert.equal(stored.payload.teams[0].roster[0].feeLock!.amount, signed.feeLock!.amount);
      await assert.rejects(
        () => mutateFeePlan(sql, "parent", { ...accept, revision: 6 }),
        /already exists/,
      );
      const pay = stored.payload.teams[0].roster[0];
      pay.payments = [
        {
          amount: pay.planLock!.dep,
          date: "2026-10-10",
          fee: 0,
          charged: pay.planLock!.dep,
          method: "cash",
          label: "Deposit",
          receipt: "test",
        },
      ];
      await sql`update club_state set payload=${JSON.stringify(stored.payload)}::jsonb where id='oklahoma-prospects'`;
      await mutateFeePlan(sql, "owner", {
        action: "releaseUniform",
        teamId: team.id,
        revision: 6,
        playerId: player.id,
      });
      assert.ok((await feeWorkspace(sql, "parent")).teams[0].players[0].uniformReleasedAt);
      await assert.rejects(
        () =>
          mutateFeePlan(sql, "owner", {
            action: "close",
            teamId: team.id,
            revision: 7,
            confirmed: true,
          }),
        /Close only/,
      );
      await assert.rejects(
        () =>
          setFeeBusiness(sql, "coach", {
            revision: 0,
            value: { overhead: 1, reserve: 0, nolanBps: 5000, period: "2027", teamIds: [] },
          }),
        /Admin/,
      );
      // Reconcile a completed season using isolated test records, never production data.
      let [savedPlan] = await sql<{
        payload: import("./fee-contracts").FeePlan;
      }>`select payload from team_fee_plans where team_id=${team.id}`;
      let [savedClub] = await sql<{
        payload: typeof club;
      }>`select payload from club_state where id='oklahoma-prospects'`;
      const late = savedClub.payload.teams[0].roster[0];
      late.planLock!.rows.forEach((r) => (r.date = "2025-01-01"));
      late.payments = [];
      savedPlan.payload.players[player.id].latePolicy = {
        fee: 2500,
        grace: 7,
        hold: 21,
        removal: 35,
      };
      await sql`update club_state set payload=${JSON.stringify(savedClub.payload)}::jsonb where id='oklahoma-prospects'`;
      await sql`update team_fee_plans set payload=${JSON.stringify(savedPlan.payload)}::jsonb where team_id=${team.id}`;
      await mutateFeePlan(sql, "owner", {
        action: "lateFee",
        teamId: team.id,
        revision: 7,
        playerId: player.id,
      });
      await assert.rejects(
        () =>
          mutateFeePlan(sql, "owner", {
            action: "lateFee",
            teamId: team.id,
            revision: 8,
            playerId: player.id,
          }),
        /already/,
      );
      await mutateFeePlan(sql, "owner", {
        action: "roster",
        teamId: team.id,
        revision: 8,
        playerId: player.id,
        status: "Roster Hold",
        note: "Past agreed threshold",
      });
      await assert.rejects(
        () =>
          mutateFeePlan(sql, "owner", {
            action: "roster",
            teamId: team.id,
            revision: 9,
            playerId: player.id,
            status: "Confirmed",
            note: "Reinstate",
          }),
        /outstanding/,
      );
      [savedClub] = await sql<{
        payload: typeof club;
      }>`select payload from club_state where id='oklahoma-prospects'`;
      const ready = savedClub.payload.teams[0].roster[0];
      ready.payments = [
        {
          amount: ready.feeLock!.amount,
          date: "2025-01-01",
          fee: 0,
          charged: ready.feeLock!.amount,
          method: "cash",
          label: "Paid in full",
          receipt: "test-full",
        },
      ];
      savedClub.payload.teams[0].roster = savedClub.payload.teams[0].roster.slice(0, 1);
      await sql`update club_state set payload=${JSON.stringify(savedClub.payload)}::jsonb where id='oklahoma-prospects'`;
      await mutateFeePlan(sql, "owner", {
        action: "roster",
        teamId: team.id,
        revision: 9,
        playerId: player.id,
        status: "Confirmed",
        note: "Balance settled",
      });
      [savedPlan] = await sql<{
        payload: import("./fee-contracts").FeePlan;
      }>`select payload from team_fee_plans where team_id=${team.id}`;
      savedPlan.payload.budget.start = "2025-01-01";
      savedPlan.payload.budget.end = "2025-03-01";
      savedPlan.payload.budget.overhead = 10000;
      savedPlan.payload.budget.reserve = 5000;
      savedPlan.payload.players[player.id].serviceStart = "2025-01-01";
      savedPlan.payload.players[player.id].serviceEnd = "2025-03-01";
      savedPlan.payload.expenses = [
        {
          id: "expense",
          name: "Actual cost",
          cents: 15000,
          date: "2025-02-01",
          paid: false,
          contingency: false,
        },
      ];
      await sql`update team_fee_plans set payload=${JSON.stringify(savedPlan.payload)}::jsonb where team_id=${team.id}`;
      await assert.rejects(
        () =>
          mutateFeePlan(sql, "owner", {
            action: "close",
            teamId: team.id,
            revision: 10,
            confirmed: true,
          }),
        /Close only/,
      );
      savedPlan.payload.expenses[0].paid = true;
      await sql`update team_fee_plans set payload=${JSON.stringify(savedPlan.payload)}::jsonb where team_id=${team.id}`;
      assert.equal(
        (await feeWorkspace(sql, "owner")).teams[0].private!.actual.actualDistributable,
        0,
      );
      await mutateFeePlan(sql, "owner", {
        action: "close",
        teamId: team.id,
        revision: 10,
        confirmed: true,
      });
      const actual = (await feeWorkspace(sql, "owner")).teams[0].private!.actual;
      assert.equal(actual.deferred, 0);
      assert.equal(
        actual.actualDistributable,
        Math.max(0, actual.totalCollected - 15000 - 10000 - 5000),
      );
      assert.equal(actual.nolan + actual.steve, actual.actualDistributable);
      await assert.rejects(() => mutateFeePlan(sql, "owner", { ...save, revision: 11 }), /closed/);
    } finally {
      await db.close();
    }
  });
