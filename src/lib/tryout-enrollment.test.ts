import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { adminTryoutEventsFor, saveTryoutEventFor } from "./tryout-events.server";
import { recordInquiryFor, adminTryoutEnrollmentsFor } from "./tryout-enrollment.server";
import { publicTryoutTeamsFor } from "./tryout-preferences.server";
test("matching enrollment respects season, capacity, retries and cancelled-event notices", async () => {
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
    sql.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  try {
    for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + name, "utf8"));
    const sql = wrap(db.query.bind(db));
    for (const id of [
      "owner",
      "reader",
      "parent",
      "coach",
      "player",
      "fake-admin",
      "disabled",
      "unverified",
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt","disabledAt") values(${id},${id + "@example.invalid"},${id},${id !== "unverified"},now(),now(),${id === "disabled" ? "2026-09-28" : null})`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${id === "owner" || id === "fake-admin" ? "admin" : ["coach", "player"].includes(id) ? id : "parent"},${"fam-" + id})`;
    }
    await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;

    const applicant = {
      kind: "tryout",
      requestId: randomUUID(),
      player: "Synthetic Player",
      email: "family@example.invalid",
      sport: "Baseball",
      age: "9U",
      season: "Spring 2030",
      autoEnroll: true,
    };
    await recordInquiryFor(sql, applicant);
    const event = {
      id: randomUUID(),
      revision: 0,
      sport: "Baseball" as const,
      season: "Spring 2030",
      ageGroups: ["9U"],
      date: "2030-04-05",
      startTime: "14:00",
      endTime: "15:00",
      location: "Test facility",
      capacity: 1,
      status: "published" as const,
    };
    await saveTryoutEventFor(sql, "owner", event);
    const request = {...applicant, requestId:randomUUID(), player:"Event Request Player",autoEnroll:false,requestType:"scheduled",requestedEventId:event.id,requestConsent:true};
    await recordInquiryFor(sql,request);
    const [savedRequest] = await sql<{payload:{requestedEvent:{id:string;location:string}};status:string}>`select payload,status from club_requests where id=${request.requestId}`;
    assert.equal(savedRequest.payload.requestedEvent.id,event.id);
    assert.equal(savedRequest.payload.requestedEvent.location,event.location);
    assert.equal(savedRequest.status,"open");
    assert.equal((await sql`select id from tryout_enrollments where request_id=${request.requestId}`).length,0);
    for (const invalid of [{requestConsent:false},{autoEnroll:true},{requestedEventId:randomUUID()},{sport:"Softball"},{age:"14U"},{season:"Fall 2030"}]) {
      const bad={...request,...invalid,requestId:randomUUID()};
      await assert.rejects(() => recordInquiryFor(sql,bad));
      assert.equal((await sql`select id from club_requests where id=${bad.requestId}`).length,0);
    }
    const individual={...request,requestId:randomUUID(),requestType:"individual",requestedEventId:""};
    await recordInquiryFor(sql,individual);
    assert.equal((await sql`select id from tryout_enrollments where request_id=${individual.requestId}`).length,0);

    assert.equal((await adminTryoutEnrollmentsFor(sql, "owner")).length, 1);
    await recordInquiryFor(sql, applicant);
    await recordInquiryFor(sql, {
      ...applicant,
      requestId: randomUUID(),
      player: " synthetic   player ",
      email: "FAMILY@example.invalid",
    });
    assert.equal((await adminTryoutEnrollmentsFor(sql, "owner")).length, 1);
    const waiting = { ...applicant, requestId: randomUUID(), player: "Waiting Player" };
    await recordInquiryFor(sql, waiting);
    for (const mismatch of [
      { sport: "Softball" },
      { season: "Summer 2030" },
      { age: "10U" },
      { autoEnroll: false },
      { season: "" },
    ])
      await recordInquiryFor(sql, {
        ...applicant,
        ...mismatch,
        requestId: randomUUID(),
        player: randomUUID(),
      });
    assert.equal((await adminTryoutEnrollmentsFor(sql, "owner")).length, 1);
    let current = (await adminTryoutEventsFor(sql, "owner"))[0];
    await saveTryoutEventFor(sql, "owner", { ...current, capacity: 2 });
    assert.equal((await adminTryoutEnrollmentsFor(sql, "owner")).length, 2);
    current = (await adminTryoutEventsFor(sql, "owner"))[0];
    await assert.rejects(
      () => saveTryoutEventFor(sql, "owner", { ...current, capacity: 1 }),
      /existing enrollments/,
    );
    await assert.rejects(
      () => saveTryoutEventFor(sql, "owner", { ...current, sport: "Softball" }),
      /Cancel/,
    );
    await saveTryoutEventFor(sql, "owner", { ...current, status: "cancelled" });
    const rows = await adminTryoutEnrollmentsFor(sql, "owner");
    assert.ok(rows.every((r) => r.status === "cancelled" && r.notification === "pending"));
    const notices = await sql<{
      kind: string;
      status: string;
    }>`select kind,status from tryout_notification_outbox`;
    assert.equal(notices.filter((n) => n.kind === "cancelled" && n.status === "pending").length, 2);
    assert.equal(notices.filter((n) => n.kind === "enrolled" && n.status === "pending").length, 0);
    const raceEvent = {
      ...event,
      id: randomUUID(),
      season: "Summer 2031",
      ageGroups: ["18U"],
      date: "2031-06-01",
    };
    await saveTryoutEventFor(sql, "owner", raceEvent);
    await Promise.all(
      ["Race A", "Race B"].map((player) =>
        recordInquiryFor(sql, {
          ...applicant,
          requestId: randomUUID(),
          player,
          age: "18U",
          season: "Summer 2031",
        }),
      ),
    );
    const [raceCount] = await sql<{
      count: number;
    }>`select count(*)::int as count from tryout_enrollments where event_id=${raceEvent.id} and status='enrolled'`;
    assert.equal(raceCount.count, 1);
    // V2: a published staff member assigned to a real active team can be
    // requested as a preference, without placing a child into an unrelated
    // group event or exposing unpublished staff to unauthenticated users.
    const publicCoach = randomUUID();
    await sql`insert into staff_directory(id,name,title,program,email,published)
      values(${publicCoach},'Audit Published Coach','Head Coach','Softball','published-coach@example.invalid',true)`;
    await sql`insert into club_state(id,demo,payload) values('oklahoma-prospects',false,${JSON.stringify({teams:[
      {id:"team-softball-12",name:"12U Softball",sport:"softball",age:"12U",closed:false,seasonStart:"2030-01-01",seasonEnd:"2030-08-01",coachEmail:"published-coach@example.invalid",staff:[],roster:[{name:"Private child",id:"private-child"}]},
      {id:"team-private",name:"Private Team",sport:"baseball",age:"12U",closed:false,seasonStart:"2030-01-01",seasonEnd:"2030-08-01",coachEmail:"secret@example.invalid",staff:[],roster:[]},
    ]})}::jsonb)`;
    const offered = await publicTryoutTeamsFor(sql);
    assert.deepEqual(offered.map(row=>row.id),["team-softball-12"]);
    assert.deepEqual(offered[0].coaches,[{id:publicCoach,name:"Audit Published Coach"}]);
    assert.doesNotMatch(JSON.stringify(offered),/private-child|Private child|secret@example|published-coach@/);
    const preferred = { ...applicant,requestId:randomUUID(),player:"Request Preferred Team",sport:"Softball",age:"12U",autoEnroll:false,preferredTeamId:"team-softball-12",preferredCoachId:publicCoach };
    await recordInquiryFor(sql,preferred);
    const [persisted]=await sql<{payload:Record<string,unknown>}>`select payload from club_requests where id=${preferred.requestId}`;
    assert.equal(persisted.payload.preferredTeamId,"team-softball-12");
    assert.equal(persisted.payload.preferredCoachId,publicCoach);
    assert.equal((await sql`select id from tryout_enrollments where request_id=${preferred.requestId}`).length,0);
    for (const tampered of [
      {preferredTeamId:"forged",preferredCoachId:""},
      {preferredTeamId:"team-softball-12",preferredCoachId:"forged"},
      {preferredTeamId:"team-softball-12",preferredCoachId:publicCoach,age:"16U"},
      {preferredTeamId:"team-softball-12",preferredCoachId:publicCoach,autoEnroll:true},
    ]) await assert.rejects(recordInquiryFor(sql,{...preferred,...tampered,requestId:randomUUID()}),/team|coach|enrollment/i);
    await sql`update staff_directory set published=false where id=${publicCoach}`;
    assert.deepEqual(await publicTryoutTeamsFor(sql),[]);
    await assert.rejects(recordInquiryFor(sql,{...preferred,requestId:randomUUID()}),/team/i);
    for (const id of [
      "reader",
      "parent",
      "coach",
      "player",
      "fake-admin",
      "disabled",
      "unverified",
    ])
      await assert.rejects(() => adminTryoutEnrollmentsFor(sql, id));
  } finally {
    await db.close();
  }
});
