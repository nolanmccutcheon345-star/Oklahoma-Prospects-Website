import assert from "node:assert/strict";
import test from "node:test";
import { compareDatabaseTargets } from "./check-preview-database.mjs";

const fp = (char) => ({
  status: 200,
  headers: new Headers({ "cache-control": "private, no-store" }),
  json: async () => ({ status:"configured", databaseSource:"postgres", databaseFingerprint:char.repeat(64) }),
});
const live="https://prospectsbaseball.club",preview="https://deploy-preview-130--oklahoma-prospects.netlify.app";

test("read-only database isolation preflight requires distinct validated endpoints",async()=>{
  const requests=[];
  const result=await compareDatabaseTargets(live,preview,async (url,init)=>{
    requests.push([String(url),init.method]);
    return fp(requests.length===1?"a":"b");
  });
  assert.deepEqual(result,{differentTargets:true});
  assert.equal(requests.length,2);
  for(const [url,method] of requests){assert.equal(method,"GET");assert.match(url,/\/api\/health\?check=preflight$/);}
});

test("identical DB fingerprints are blocked even on different websites",async()=>{
  await assert.rejects(compareDatabaseTargets(live,preview,async()=>fp("a")),/same database/);
});

test("invalid, missing or embedded fingerprints never grant permission",async()=>{
  const invalid=[
    {status:200,headers:new Headers({"cache-control":"private, no-store"}),json:async()=>({status:"unverified",databaseSource:"pglite",databaseFingerprint:null})},
    {status:503,headers:new Headers({"cache-control":"private, no-store"}),json:async()=>({status:"unverified",databaseSource:"unconfigured",databaseFingerprint:null})},
    {status:200,headers:new Headers(),json:async()=>({status:"configured",databaseSource:"postgres",databaseFingerprint:"a".repeat(64)})},
  ];
  for(const response of invalid)await assert.rejects(compareDatabaseTargets(live,preview,async()=>response));
  await assert.rejects(compareDatabaseTargets("http://prospectsbaseball.club",preview,async()=>fp("a")),/HTTPS/);
  await assert.rejects(compareDatabaseTargets(live,live,async()=>fp("a")),/distinct hosts/);
});
