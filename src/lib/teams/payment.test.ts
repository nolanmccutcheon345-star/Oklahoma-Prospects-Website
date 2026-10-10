import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "./seed";
import { prepareTeamCheckout, validateTeamPayment } from "./payment.server";
import { fulfillSquarePayment, type SquareOrder } from "../commerce/square-payments.server";
test("Square team fees enforce guardian ownership and accepted price, deduplicate, and restore balances after refunds", async () => {
  const db = new PGlite();
  const wrap = (q: PGlite["query"]): Sql => {
    const s = (async (p: TemplateStringsArray, ...v: unknown[]) =>
      (
        await q(
          p.reduce((x, y, i) => x + (i ? "$" + i : "") + y, ""),
          v,
        )
      ).rows) as Sql;
    s.query = (async (t: string, v: unknown[] = []) => (await q(t, v)).rows) as Sql["query"];
    s.transaction = (f) => db.transaction((tx) => f(wrap(tx.query.bind(tx) as PGlite["query"])));
    return s;
  };
  try {
    for (const f of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + f, "utf8"));
    const sql = wrap(db.query.bind(db));
    for (const [id, role] of [
      ["parent", "parent"],
      ["coach", "coach"],
      ["player", "player"],
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.invalid"},${id},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${role},${"fam-" + id})`;
    }
    const club = sampleClub();
    club._demo = false;
    club.teams = club.teams.slice(0, 1);
    const team = club.teams[0];
    team.closed = false;
    team.coachEmail = "coach@example.invalid";
    team.roster = team.roster.slice(0, 1);
    const p = team.roster[0];
    p.withdrawn = false;
    p.parents = [{ name: "Parent", rel: "parent", phone: "", email: "parent@example.invalid" }];
    p.payments = [];
    p.credits = [];
    p.feeLock = { amount: 1000, lockedAt: "2026-01-01", policyVersion: "v1", components: {} };
    p.planLock = {
      dep: 400,
      deadline: "2027-01-01",
      planType: "split",
      rows: [
        { date: "2026-01-01", amount: 400 },
        { date: "2027-01-01", amount: 600 },
      ],
    };
    p.agreement = { signedAt: "2026-01-01", signedBy: "Parent", version: "v1" };
    await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,0,false)`;
    const a = {
      teamId: team.id,
      playerId: p.id,
      amount: 40000,
      requestId: randomUUID(),
      consent: true as const,
    };
    await assert.rejects(
      () => prepareTeamCheckout(sql, "coach", a, "production"),
      /parent or guardian/,
    );
    await assert.rejects(
      () => prepareTeamCheckout(sql, "player", a, "production"),
      /Player accounts/,
    );
    await assert.rejects(
      () => prepareTeamCheckout(sql, "parent", { ...a, amount: 100001 }, "production"),
      /exceeds/,
    );
    const ready = await prepareTeamCheckout(sql, "parent", a, "production");
    assert.equal(
      (await prepareTeamCheckout(sql, "parent", a, "production")).orderId,
      ready.orderId,
    );
    await assert.rejects(
      () => prepareTeamCheckout(sql, "parent", { ...a, requestId: randomUUID() }, "production"),
      /already awaiting/,
    );
    await sql`update commerce_orders set square_customer_id='customer' where id=${ready.orderId}`;
    const [o] = await sql<SquareOrder>`select * from commerce_orders where id=${ready.orderId}`;
    await sql.transaction((tx) => validateTeamPayment(tx, o));
    const payment = {
      id: "team-pay",
      referenceId: ready.orderId,
      status: "COMPLETED",
      sourceType: "CARD",
      locationId: "location",
      customerId: "customer",
      amountMoney: { amount: 40000n, currency: "USD" as const },
      totalMoney: { amount: 40000n, currency: "USD" as const },
      createdAt: new Date().toISOString(),
    };
    const fulfill = (refunded = 0) =>
      sql.transaction((tx) =>
        fulfillSquarePayment(
          tx,
          { ...payment, refundedMoney: { amount: BigInt(refunded), currency: "USD" } },
          { environment: "production", locationId: "location" },
        ),
      );
    await fulfill();
    await fulfill();
    const player = async () =>
      (await sql<any>`select payload from club_state where id='oklahoma-prospects'`)[0].payload
        .teams[0].roster[0];
    assert.equal((await player()).payments.length, 1);
    assert.equal((await player()).payments[0].amount, 400);
    assert.equal((await player()).depositPaid, true);
    await fulfill(10000);
    assert.equal((await player()).payments[0].amount, 300);
    assert.equal((await player()).depositPaid, false);
    await fulfill(0);
    assert.equal((await player()).payments[0].amount, 300);
    await prepareTeamCheckout(
      sql,
      "parent",
      { ...a, amount: 70000, requestId: randomUUID() },
      "production",
    );
    assert.ok((await sql`select id from finance_audit where record_id='team-pay'`).length >= 2);
  } finally {
    await db.close();
  }
});
