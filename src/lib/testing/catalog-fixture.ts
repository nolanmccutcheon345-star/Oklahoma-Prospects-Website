import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {buildPublicCatalog,loadServices} from '../ops';
import type {Sql} from '../db';
/** Tests use a migrated database, never the runtime's removed fallback price list. */
export async function catalogFixture(){
  const db=new PGlite();
  try{
    for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort()) await db.exec(await readFile(`migrations/${name}`,'utf8'));
    const sql=(async(parts:TemplateStringsArray,...values:unknown[])=>(await db.query(parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows) as Sql;
    return buildPublicCatalog(await loadServices(sql));
  }finally{await db.close();}
}
