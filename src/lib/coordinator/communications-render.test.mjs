import test from 'node:test';
import assert from 'node:assert/strict';
import {withRendered} from '../../../scripts/render-component-support.mjs';
const mocks={'@/lib/coordinator/api':`export const previewCoordinatorNotice=x=>globalThis.commUI.preview(x);export const queueCoordinatorNotice=x=>globalThis.commUI.queue(x);export const getCoordinatorNoticeHistory=x=>globalThis.commUI.history(x);export const getCoordinatorNoticeTargets=x=>globalThis.commUI.targets(x);export const cancelCoordinatorNotice=x=>globalThis.commUI.cancel(x);export const getReviewableTeamMessages=x=>globalThis.commUI.reviewList(x);export const reviewCoordinatorTeamMessage=x=>globalThis.commUI.review(x);export const getOwnerCommunicationArchive=x=>globalThis.commUI.archive(x);`};
test('scheduled communication preview freezes exact proposal, confirms recipients and reports pending owner review',async()=>{
 const previous=globalThis.FormData,calls=[];let confirmed=false;
 globalThis.commUI={preview:async x=>{calls.push(['preview',x]);return{teams:[{id:'soft',name:'Synthetic softball',recipientCount:3}],previewDigest:'a'.repeat(64),requiresApproval:true}},queue:async x=>{calls.push(['queue',x]);return{status:'pending-review'}}};
 try{await withRendered('src/components/coordinator/communications.tsx','ScheduledCommunications',{sport:'softball',teamId:'soft',teams:[{id:'soft',name:'Synthetic softball'}],allowed:p=>p==='communications.program.request'},mocks,async({host,act,dom})=>{
 globalThis.FormData=dom.window.FormData;dom.window.confirm=()=>confirmed;
 host.querySelector('[name="team"]').checked=true;host.querySelector('[name="body"]').value='Program update';host.querySelector('[name="reason"]').value='Owner should review the program announcement';
 await act(async()=>host.querySelector('button[type="submit"]').click());assert.equal(calls.length,1);assert.match(host.textContent,/3 verified members/);
 const button=()=>[...host.querySelectorAll('button')].find(x=>x.textContent==='Confirm Owner Review Request');
 await act(async()=>button().click());assert.equal(calls.length,1);confirmed=true;await act(async()=>button().click());assert.equal(calls.length,2);assert.deepEqual(calls[1][1].data,{...calls[0][1].data,previewDigest:'a'.repeat(64),confirm:true});assert.match(host.textContent,/nothing sent/);
 });}finally{globalThis.FormData=previous;delete globalThis.commUI;}
});
test('owner historical review binds exact digest and clears private text after denial',async()=>{
 const calls=[];let reads=0;globalThis.commUI={reviewList:async()=>{reads++;return{items:[{id:'message',author:'Owner',body:'Synthetic private historical text',sourceDigest:'b'.repeat(64),operational:false}],nextCursor:null}},review:async x=>{calls.push(x);throw Error('Owner authority revoked')}};
 try{await withRendered('src/components/coordinator/communications.tsx','TeamMessageReview',{teams:[{id:'soft',name:'Softball'}]},mocks,async({host,act,dom,change})=>{
 dom.window.prompt=()=> 'Reviewed for operational visibility';dom.window.confirm=()=>true;
 await change(host.querySelector('select'),'soft');assert.equal(reads,1);
 await act(async()=>[...host.querySelectorAll('button')].find(x=>x.textContent==='Approve Operational Visibility').click());assert.equal(calls[0].data.sourceDigest,'b'.repeat(64));assert.equal(calls[0].data.operational,true);assert.doesNotMatch(host.textContent,/Synthetic private historical text/);assert.match(host.textContent,/revoked/);
 });}finally{delete globalThis.commUI;}
});
