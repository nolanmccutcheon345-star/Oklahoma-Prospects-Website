import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';

function git(args) { try { return execFileSync('git', args, {encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); } catch { return ''; } }
// Netlify Drop may wrap an uploaded archive in a synthetic git repository.
// Prefer git archive's stamped source commit over that temporary build commit.
const archivedCommit = await readFile('source-commit.txt', 'utf8').then(s=>s.trim()).catch(()=> '');
const commit = [archivedCommit, git(['rev-parse','HEAD']), process.env.COMMIT_REF, process.env.GITHUB_SHA]
  .find(value => /^[a-f0-9]{40}$/i.test(value ?? ''));
if (!commit) throw new Error('A release must identify its full source commit.');
const migrations = await Promise.all((await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort().map(async name=>({
  name, sha256:createHash('sha256').update(await readFile('migrations/'+name)).digest('hex'),
})));
await writeFile('public/release.json', JSON.stringify({
  commit, dirty:Boolean(git(['diff','--stat','HEAD'])), builtAt:new Date().toISOString(), migrations,
},null,2)+'\n');
console.log(`Release ${commit.slice(0,12)}: ${migrations.length} migration checksums recorded; no database changed.`);
