// Isolated audit harness: production server functions and migrations, disposable DB.
// Only storage, request context, and outgoing email transport are replaced.
import {PGlite} from '@electric-sql/pglite';
import {build} from 'esbuild';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';

export async function auditHarness() {
  for (const name of ['DATABASE_URL','PREVIEW_DATABASE_URL','NETLIFY_DATABASE_URL','RESEND_API_KEY','SQUARE_PRODUCTION_ACCESS_TOKEN','SQUARE_SANDBOX_ACCESS_TOKEN']) {
    if (process.env[name]) throw new Error(`Audit refuses externally configured ${name}`);
  }
  // Match src/lib/db.ts driver parsing exactly; DATE is a date-only string.
  const db = new PGlite({parsers:{20:Number,1082:v=>v,1186:v=>v}});
  for (const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile('migrations/'+file,'utf8'));
  function wrap(query) {
    const sql=async(parts,...values)=>(await query(parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows;
    sql.query=async(text,values=[])=>(await query(text,values)).rows;
    sql.transaction=work=>db.transaction(tx=>work(wrap(tx.query.bind(tx))));
    return sql;
  }
  const sql=wrap(db.query.bind(db)),outbox=[];
  const base='https://audit.example.invalid';
  const originalEnv={BETTER_AUTH_URL:process.env.BETTER_AUTH_URL,BETTER_AUTH_SECRET:process.env.BETTER_AUTH_SECRET,VITE_AUTH_ENABLED:process.env.VITE_AUTH_ENABLED};
  Object.assign(process.env,{BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),VITE_AUTH_ENABLED:'true'});
  const state={db,sql,outbox,request:new Request(base,{method:'POST',headers:{origin:base,'sec-fetch-site':'same-origin','x-nf-client-connection-ip':'192.0.2.1'}})};
  globalThis.__prospectsAudit=state;
  const temp=await mkdtemp('scripts/.audit-runtime-');
  const outfile=temp+'/server.mjs';
  await build({stdin:{contents:`
    export * from './src/lib/auth/server';
    export * from './src/lib/auth/verify.server';
    export * from './src/lib/identity.server';
    export * from './src/lib/portal.server';
    export * from './src/lib/registrations.server';
    export * as fundraisingPlayers from './src/lib/fundraising/players';
    export * as fundraisingDashboard from './src/lib/fundraising/dashboard';
    export * as fundraisingRoster from './src/lib/fundraising/roster-api';
    export * as fundraising from './src/lib/fundraising/server';
    export * from './src/lib/pd/empty';
    export * from './src/lib/pd/desk-impl.server';
    export * from './src/lib/commerce/portal.server';
    export * from './src/lib/commerce/credits.server';
    export * from './src/lib/commerce/operations.server';
    export * from './src/lib/commerce/square-payments.server';
    export * from './src/lib/commerce/store.server';
    export * from './src/lib/commerce/checkout.server';
    export * from './src/lib/scheduling';
  `,resolveDir:process.cwd(),loader:'ts'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'audit-boundaries',setup(b){
    b.onResolve({filter:/(^|\/)db$/},args=>args.path.startsWith('.')||args.path.startsWith('@/')?{path:'db',namespace:'audit'}:undefined);
    b.onResolve({filter:/email\.server$/},args=>args.importer.endsWith('/auth/server.ts')?{path:'email',namespace:'audit'}:undefined);
    b.onResolve({filter:/^@tanstack\/react-start\/server$/},()=>({path:'request',namespace:'audit'}));
    b.onLoad({filter:/.*/,namespace:'audit'},args=>({contents:args.path==='db'
      ? 'export const getSql=async()=>globalThis.__prospectsAudit.sql; export const ensureDbReady=async()=>{}; export const getPglite=async()=>globalThis.__prospectsAudit.db;'
      :args.path==='email'
      ? 'export const deliverAuthEmail=async(to,subject,url)=>{globalThis.__prospectsAudit.outbox.push({to,subject,url});};'
      : 'export const getRequest=()=>globalThis.__prospectsAudit.request; export const getCookie=(name)=>getRequest()?.headers.get("cookie")?.split("; ").find(x=>x.startsWith(name+"="))?.slice(name.length+1); export const setCookie=()=>{};',loader:'js'}));
  }}]});
  const api=await import(pathToFileURL(process.cwd()+'/'+outfile));
  return {api,db,sql,outbox,base,state,async close(){await db.close();delete globalThis.__prospectsAudit;for(const [k,v] of Object.entries(originalEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}await rm(temp,{recursive:true,force:true});}};
}
