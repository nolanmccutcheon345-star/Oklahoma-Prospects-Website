import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { requireRosterChoice, rosterChoicesFor, publicRoster, linkedPlayer, withActiveRosterChoice } from "./roster-links";
import { recordConsent } from "./publication";
import { playerDestination } from "./shared";
test("actual roster links isolate households, consent and team/player pairs", async () => {
  const db = new PGlite();
  const wrap = (query: PGlite["query"], inTransaction = false): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...v: unknown[]) =>
      (
        await query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          v,
        )
      ).rows) as Sql;
    sql.query = (async (q: string, v: unknown[] = []) => (await query(q, v)).rows) as Sql["query"];
    sql.transaction = (work) => {
      if (inTransaction) throw Error('Nested transactions are not supported.');
      return db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"], true)));
    };
    return sql;
  };
  try {
    for (const f of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + f, "utf8"));
    const sql = wrap(db.query.bind(db));
    for (const id of ["parent", "other", "coach", "player", "fake-admin", "owner", "disabled"]) {
      await sql`INSERT INTO "user"(id,email,name,"emailVerified","createdAt","updatedAt","disabledAt") VALUES(${id},${id + "@example.invalid"},${id},true,now(),now(),${id === "disabled" ? "2026-10-06" : null})`;
      await sql`INSERT INTO profiles(user_id,email,name,role,family_id) VALUES(${id},${id + "@example.invalid"},${id},${id === "owner" || id === "fake-admin" ? "admin" : ["coach", "player"].includes(id) ? id : "parent"},${"fam-" + id})`;
    }
    await sql`INSERT INTO owner_grants(email,user_id) VALUES('owner@example.invalid','owner')`;
    const roster = (id: string, email: string) => ({
      id,
      familyId: "legacy-" + id,
      parents: [{ email }],
      name: "Private roster name",
      medical: "Do not publish",
      email: "private@example.invalid",
    });
    const club = {
      teams: [
        {
          id: "baseball-team",
          name: "13U Baseball",
          sport: "baseball",
          seasonLabel: "2027",
          roster: [
            roster("a", "parent@example.invalid"),
            roster("hidden", "other@example.invalid"),
          ],
        },
        {
          id: "softball-team",
          name: "13U Softball",
          sport: "softball",
          seasonLabel: "2027",
          roster: [roster("b", "other@example.invalid")],
        },
      ],
    };
    await sql`INSERT INTO club_state(id,payload,demo) VALUES('oklahoma-prospects',${JSON.stringify(club)}::jsonb,false)`;
    assert.deepEqual(
      (await rosterChoicesFor(sql, "parent")).map((p) => p.rosterPlayerId),
      ["a"],
    );
    assert.equal((await rosterChoicesFor(sql, "owner")).length, 3);
    await assert.rejects(requireRosterChoice(sql, "parent", "softball-team", "b"));
    await assert.rejects(requireRosterChoice(sql, "parent", "softball-team", "a"));
    for (const id of ["player", "disabled", "missing"])
      await assert.rejects(rosterChoicesFor(sql, id));
    await assert.rejects(requireRosterChoice(sql, "fake-admin", "baseball-team", "a"));
    assert.equal(
      (await rosterChoicesFor(sql, "coach")).length,
      0,
      "coaching role alone does not grant fundraiser access",
    );
    await sql`INSERT INTO fundraising_players(id,owner_id,parent_email,name,team,goal,story,approved,active,created,team_id,roster_player_id) VALUES('fund','parent','private@example.invalid','Public initial','13U',10000,'Public story',1,1,'2026-10-06','baseball-team','a')`;
    assert.equal(await linkedPlayer(sql, "fund"), null);
    assert.deepEqual((await publicRoster(sql)).teams?.map(t => t.id), ["baseball-team", "softball-team"]);
    await recordConsent(sql, "fund", "parent", "accept");
    const p = await linkedPlayer(sql, "fund");
    assert.ok(p);
    assert.equal(p.team, "13U Baseball");
    assert.equal(playerDestination(p as any), "/fundraising/p/fund");
    assert.equal("team_id" in p, false);
    assert.equal("roster_player_id" in p, false);
    assert.deepEqual(
      (await publicRoster(sql)).teams?.map((t) => t.id),
      ["baseball-team", "softball-team"],
    );
    const team = (await publicRoster(sql, "baseball-team")).team!;
    assert.equal(team.players.length, 1);
    assert.equal(team.players[0].name, "Public initial");
    assert.deepEqual(Object.keys(team.players[0]).sort(), ["goal","id","name","raised"]);
    assert.equal(playerDestination(team.players[0] as any), "/fundraising/p/fund");
    assert.equal("story" in team.players[0], false);
    assert.equal("roster_player_id" in team.players[0], false);
    assert.equal("team_id" in team.players[0], false);
    assert.equal("medical" in team.players[0], false);
    assert.equal("parent_email" in team.players[0], false);
    await assert.rejects(publicRoster(sql, "softball-team", "a"));
    await assert.rejects(publicRoster(sql, "baseball-team", "hidden"));
    const direct = (await publicRoster(sql, "baseball-team", "a")).player!;
    assert.equal(direct.id, "fund");
    assert.equal(direct.story, "Public story");
    assert.equal("team_id" in direct, false);
    assert.equal("roster_player_id" in direct, false);
    await assert.rejects(
      sql`INSERT INTO fundraising_players(id,owner_id,parent_email,name,team,goal,story,created,team_id,roster_player_id) VALUES('dupe','parent','p','p','13U',10000,'s','d','baseball-team','a')`,
    );
    await recordConsent(sql, "fund", "parent", "withdraw");
    // Withdrawing consent removes only that child's public fundraiser, not
    // the public team directory; unrelated teams remain visible.
    assert.deepEqual((await publicRoster(sql)).teams?.map(t => t.id), ["baseball-team", "softball-team"]);
    assert.deepEqual((await publicRoster(sql, "baseball-team")).team?.players, []);
    assert.equal(await linkedPlayer(sql, "fund"), null);
    await assert.rejects(publicRoster(sql, "baseball-team", "a"), /unavailable/,
      "Withdrawing guardian consent must also revoke the direct public player page");
    await recordConsent(sql, "fund", "parent", "accept");
    // A choice loaded before cleanup never authorizes a subsequent create/relink.
    const earlierChoice = await requireRosterChoice(sql, 'parent', 'baseball-team', 'a');
    assert.equal(earlierChoice.rosterPlayerId, 'a');
    for (const tombstone of [{withdrawn:true}, {withdrawn:false,rosterRemoval:{actorId:'owner',at:'2030-01-01',reason:'Synthetic merged duplicate',requestId:'synthetic',canonicalPlayerId:'survivor'}}]) {
      const retired=structuredClone(club);
      Object.assign(retired.teams[0].roster[0],tombstone);
      await sql`UPDATE club_state SET payload=${JSON.stringify(retired)}::jsonb`;
      assert.equal((await rosterChoicesFor(sql,'parent')).some(p=>p.rosterPlayerId==='a'),false);
      assert.equal((await rosterChoicesFor(sql,'owner')).some(p=>p.rosterPlayerId==='a'),false);
      let wrote=false;
      for(const actor of ['parent','owner']) await assert.rejects(withActiveRosterChoice(sql,actor,'baseball-team','a',async()=>{wrote=true;}),/not available/);
      assert.equal(wrote,false,'cleanup discovered inside transaction prevents create/relink callback');
      assert.ok(await linkedPlayer(sql,'fund'),'existing consented historical page remains accessible');
      assert.equal((await publicRoster(sql,'baseball-team','a')).player?.id,'fund');
      assert.equal((await sql`select roster_player_id from fundraising_players where id='fund'`)[0].roster_player_id,'a','historical linkage remains unchanged');
    }
    await sql`UPDATE club_state SET payload=${JSON.stringify(club)}::jsonb`;
    let checkedInsideGate=false;
    await withActiveRosterChoice(sql,'parent','baseball-team','a',async(tx,choice)=>{
      checkedInsideGate=true;assert.equal(choice.rosterPlayerId,'a');
      assert.equal((await tx`select id from financial_execution_gate where id='oklahoma-prospects'`).length,1);
    });
    assert.equal(checkedInsideGate,true);
    // Revocation after preflight still permits household work, but never owner powers.
    const guardianClub=structuredClone(club);
    guardianClub.teams[0].roster[0].parents.push({email:'owner@example.invalid'});
    await sql`UPDATE club_state SET payload=${JSON.stringify(guardianClub)}::jsonb`;
    assert.equal((await requireRosterChoice(sql,'owner','baseball-team','a')).admin,true);
    await sql`UPDATE owner_grants SET revoked_at=now() WHERE user_id='owner'`;
    const postRevocation=await withActiveRosterChoice(sql,'owner','baseball-team','a',async(tx,choice)=>{
      const [page]=await tx.query<{owner_id:string}>("SELECT owner_id FROM fundraising_players WHERE id=$1 FOR UPDATE",['fund']);
      return {autoApprove:choice.admin,mayEdit:choice.admin||page.owner_id==='owner'};
    });
    assert.deepEqual(postRevocation,{autoApprove:false,mayEdit:false},'revoked owner who remains guardian cannot edit another owner page or auto-approve');
    await sql`UPDATE club_state SET demo=true`;
    assert.equal(await linkedPlayer(sql, "fund"), null);
    assert.deepEqual(await publicRoster(sql), { teams: [] },
      "Demo team fixtures must not appear in the public directory");
    await sql`UPDATE club_state SET demo=false,payload=${JSON.stringify({ teams: club.teams.map((t) => ({ ...t, roster: [] })) })}::jsonb`;
    assert.equal(await linkedPlayer(sql, "fund"), null);
    // A real team with an empty roster remains visible in the public team directory.
    assert.deepEqual((await publicRoster(sql)).teams?.map(t => t.id), ["baseball-team", "softball-team"]);
    assert.deepEqual((await publicRoster(sql,"baseball-team")).team?.players, []);
  } finally {
    await db.close();
  }
});


test('fundraising create and relink acquire cleanup gate before the transactional choice recheck', async()=>{
 const source=await readFile(new URL('./roster-links.ts',import.meta.url),'utf8');
 const helper=source.slice(source.indexOf('export async function withActiveRosterChoice'));
 assert.ok(helper.indexOf('await lockFinancialExecution(tx)') < helper.indexOf('await requireRosterChoice(tx'));
 for(const file of ['players.ts','players-player.ts']) {
  const handler=await readFile(new URL(file,import.meta.url),'utf8');
  assert.match(handler,/await withActiveRosterChoice\(/);
  assert.doesNotMatch(handler,/await requireRosterChoice\(/);
  assert.match(handler,/choice.admin \? 1 : 0/);
 }
});

test('create response and relink authorization use transaction-current owner status',async()=>{
 const create=await readFile(new URL('./players.ts',import.meta.url),'utf8');
 const edit=await readFile(new URL('./players-player.ts',import.meta.url),'utf8');
 assert.match(create,/const approved = await withActiveRosterChoice/);
 assert.match(create,/return choice.admin/);
 assert.match(edit,/if \(!choice.admin && current.owner_id !== user.userId\)/);
});
