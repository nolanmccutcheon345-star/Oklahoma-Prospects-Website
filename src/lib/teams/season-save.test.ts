import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import type {Sql} from "../db";
import {sampleClub} from "./seed";
import {persistTeamSeasons} from "./season-save.server";
import {teamSeasons} from "./seasons";

test("season edit survives a database reload, preserves other teams and coach photos, rejects stale writes", async () => {
  const db=new PGlite();
  function wrap(query: PGlite["query"]): Sql {
    const sql=(async(parts:TemplateStringsArray,...v:unknown[]) => (await query(parts.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,""),v)).rows) as Sql;
    sql.query=(async(q:string,v:unknown[]=[]) => (await query(q,v)).rows) as Sql["query"];
    sql.transaction=work=>db.transaction(tx=>work(wrap(tx.query.bind(tx) as PGlite["query"])));return sql;
  }
  try {
    await db.exec("create table club_state(id text primary key,payload jsonb,rev integer,demo boolean,updated_at timestamptz)");
    const sql=wrap(db.query.bind(db)),club=sampleClub();club._demo=false;
    const team=club.teams[0];team.headCoachPhoto="data:image/png;base64,YQ==";
    await sql`insert into club_state values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,${club._rev},false,now())`;
    const first=await persistTeamSeasons(sql,{teamId:team.id,baseRev:club._rev,seasons:["Summer 2027"]});
    const [reloaded]=await sql<{payload:typeof club}>`select payload from club_state`;
    assert.equal(reloaded.payload.teams[0].seasonLabel,"Summer 2027");
    assert.equal(reloaded.payload.teams[0].headCoachPhoto,team.headCoachPhoto);
    assert.deepEqual(reloaded.payload.teams[1],club.teams[1]);
    const second=await persistTeamSeasons(sql,{teamId:team.id,baseRev:first._rev,seasons:["Spring 2027","Summer 2027"]});
    assert.deepEqual(teamSeasons(second.teams[0]),["Spring 2027","Summer 2027"]);
    await assert.rejects(persistTeamSeasons(sql,{teamId:team.id,baseRev:first._rev,seasons:["Fall 2027"]}),/changed/);
    await assert.rejects(persistTeamSeasons(sql,{teamId:team.id,baseRev:second._rev,seasons:[]}));
  } finally {await db.close();}
});
