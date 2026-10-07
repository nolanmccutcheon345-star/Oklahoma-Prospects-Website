import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { createLegacyProgram, addLegacyDrill, completeLegacyDrill, createLegacyLog, legacyDrillCompletionInput, legacyLogInput } from "./legacy-training.server";
test('legacy programs require an author role and drills require the same account owner',async()=>{
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




    const player={userId:'player',role:'player' as const},parent={userId:'parent',role:'parent' as const},coach={userId:'coach',role:'coach' as const};
    const program={athlete:'Test Athlete',focus:'Hitting'};
    await assert.rejects(()=>createLegacyProgram(sql,player,program),/Players can follow/);
    const own=await createLegacyProgram(sql,parent,program);
    const other=await createLegacyProgram(sql,coach,program);
    const drill={programId:own.id,name:'Tee drill',detail:'Complete assigned reps'};
    await assert.rejects(()=>addLegacyDrill(sql,player,drill),/Players can follow/);
    await addLegacyDrill(sql,parent,drill);
    await assert.rejects(()=>addLegacyDrill(sql,parent,{...drill,programId:other.id}),/belonging to your account/);
    await assert.rejects(()=>addLegacyDrill(sql,parent,{...drill,programId:99999}),/belonging to your account/);
    await addLegacyDrill(sql,coach,{...drill,programId:other.id});
    const rows=await sql<{program_id:number;user_id:string}>`select program_id,user_id from drills order by id`;
    assert.deepEqual(rows,[{program_id:own.id,user_id:'parent'},{program_id:other.id,user_id:'coach'}]);
    assert.equal((await sql`select id from programs where user_id='player'`).length,0);
    await assert.rejects(()=>createLegacyProgram(sql,parent,{...program,focus:''}),/Too small/);
    await assert.rejects(()=>addLegacyDrill(sql,parent,{...drill,programId:-1}),/Too small/);
    const [parentDrill]=await sql<{id:number}>`select id from drills where user_id='parent'`;
    await assert.rejects(()=>completeLegacyDrill(sql,player,{id:parentDrill.id,done:true}),/belonging to your account/);
    await assert.rejects(()=>completeLegacyDrill(sql,parent,{id:99999,done:true}),/belonging to your account/);
    await completeLegacyDrill(sql,parent,{id:parentDrill.id,done:true});
    assert.equal((await sql<{done:boolean}>`select done from drills where id=${parentDrill.id}`)[0].done,true);
    await createLegacyLog(sql,player,{athlete:' Test Athlete ',note:' Completed assigned reps ',metric:''});
    const [log]=await sql<{user_id:string;athlete:string;note:string}>`select user_id,athlete,note from athlete_logs`;
    assert.deepEqual(log,{user_id:'player',athlete:'Test Athlete',note:'Completed assigned reps'});
    for(const invalid of [{athlete:'',note:'Valid note',metric:''},{athlete:'Test',note:' ',metric:''},{athlete:'Test',note:'x'.repeat(3001),metric:''}])
      await assert.rejects(()=>createLegacyLog(sql,player,invalid),/Too small|Too big/);
    assert.equal((await sql`select id from athlete_logs`).length,1);
  } finally {await db.close();}
});
test('legacy completion and log contracts reject forged and malformed fields',()=>{
 assert.equal(legacyDrillCompletionInput.safeParse({id:1,done:'true'}).success,false);
 assert.equal(legacyDrillCompletionInput.safeParse({id:-1,done:true}).success,false);
 assert.equal(legacyDrillCompletionInput.safeParse({id:1,done:true,userId:'other'}).success,false);
 assert.equal(legacyLogInput.safeParse({athlete:'Test',note:'Valid note',metric:'',userId:'other'}).success,false);
});
