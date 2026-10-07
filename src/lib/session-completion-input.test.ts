import test from 'node:test';
import assert from 'node:assert/strict';
import {completeSession,sessionCompletionInput} from './commerce/portal.server';
test('completion rejects invalid records and recaps before identity or ledger access',async()=>{
 for(const [id,notes] of [['','Valid recap'],['b','    '],['b','tiny'],['b','x'.repeat(5001)],['x'.repeat(151),'Valid recap']])await assert.rejects(()=>completeSession('no-account',id,notes),/Too small|Too big/);
 assert.deepEqual(sessionCompletionInput.parse({id:' booking ',notes:' Complete synthetic recap '}),{id:'booking',notes:'Complete synthetic recap'});
 assert.equal(sessionCompletionInput.safeParse({id:'booking',notes:'Valid recap',completedBy:'forged'}).success,false);
});
