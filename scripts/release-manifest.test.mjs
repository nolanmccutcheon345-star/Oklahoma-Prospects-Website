import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const script=resolve('scripts/release-manifest.mjs');
test('manual source archives retain exact commit provenance and migration checksums',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'prospects-release-'));
 try{
  await mkdir(join(dir,'public'));await mkdir(join(dir,'migrations'));
  const migration='select 1;\n',commit='1234567890abcdef1234567890abcdef12345678';
  await writeFile(join(dir,'migrations/0001.sql'),migration);
  await writeFile(join(dir,'source-commit.txt'),commit+'\n');
  const env={...process.env,COMMIT_REF:'HEAD',GITHUB_SHA:''};
  let result=spawnSync(process.execPath,[script],{cwd:dir,env,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const release=JSON.parse(await readFile(join(dir,'public/release.json'),'utf8'));
  assert.equal(release.commit,commit);assert.equal(release.dirty,false);
  assert.deepEqual(release.migrations,[{name:'0001.sql',sha256:createHash('sha256').update(migration).digest('hex')}]);
  assert.equal(await readFile(join(dir,'migrations/0001.sql'),'utf8'),migration);
  await writeFile(join(dir,'source-commit.txt'),'$Format:%H$\n');
  result=spawnSync(process.execPath,[script],{cwd:dir,env,encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/full source commit/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
