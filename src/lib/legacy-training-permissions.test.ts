import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { createLegacyProgram, addLegacyDrill } from "./legacy-training.server";
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
  } finally {await db.close();}
});
