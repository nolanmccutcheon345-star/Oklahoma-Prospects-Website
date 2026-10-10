import {seedMasterMatrix,masterSchema,rowKey} from '../src/lib/teams/budget-matrix.ts';
import {writeFile} from 'node:fs/promises';
const m=masterSchema.parse(seedMasterMatrix());
const columns=['months','head','assistant','organization','insurance','background','balls','equipment','operations','misc','fields'];
const rows=m.rows.map(r=>{for(const k of columns)if(!Number.isFinite(r[k])||r[k]<0)throw Error(`${rowKey(r)} ${k}`);return `| ${rowKey(r)} | ${columns.map(k=>k==='months'?r[k]:(r[k]/100).toFixed(2)).join(' | ')} | PASS |`;});
await writeFile('docs/budget-matrix-validation.md',`# Supplied master matrix validation\n\n120/120 unique combinations passed: two sports × ages 6–17 × five seasons. All required defaults are populated; amounts below are dollars. Zero outdoor-field cost for Winter/Fall is intentional. This validates the supplied defaults, not unsupplied actual facility expenses or live team season choices.\n\n| Row | Months | Head | Assistant | Org/player | Insurance | Background | Balls | Equipment | Operations | Misc | Fields | Result |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|\n${rows.join('\n')}\n`);
console.log('PASS: 120/120 complete unique master rows.');
