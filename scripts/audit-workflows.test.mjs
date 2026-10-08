import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {auditHarness} from './audit-support.mjs';

test('isolated full account and lesson journey through real server commands',async(t)=>{
 const h=await auditHarness();
 const {api,sql,outbox,base,state}=h;
 const password=randomBytes(20).toString('base64url');
 async function authRequest(path,body,cookie='') {
   const request=new Request(base+'/api/auth/'+path,{method:body?'POST':'GET',headers:{origin:base,'content-type':'application/json',cookie,'x-forwarded-for':'192.0.2.2'},...(body?{body:JSON.stringify(body)}:{})});
   const response=await api.handleAuthRequest(request);
   return {response,body:await response.json().catch(()=>null),cookie:response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')};
 }
 let parent,coach,other,player,parentCookie,athlete,booking,grant,coachId;
 const future=new Date(Date.now()+3*864e5).toISOString().slice(0,10);
 const config={environment:'sandbox',locationId:'audit-location'};
 async function fixtureUser(id,role,name=id) {
   const email=id+'@audit.example.invalid';
   await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${id},${name},${email},true,now(),now())`;
   await sql`insert into profiles(user_id,name,email,role,family_id,player_name) values(${id},${name},${email},${role},${'fam-'+id},${role==='player'?'Audit Athlete':''})`;
   await api.clubIdentity(id);return id;
 }
 async function placeOrder(id,q) {
   await sql`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,hold_until,payment_provider,payment_environment,square_customer_id)
     values(${id},${id},${parent},'parent@audit.example.invalid',${athlete},${q.productId},${q.kind},${JSON.stringify(q)}::jsonb,${q.totalCents},now()+interval '10 minutes','square','sandbox','audit-customer')`;
 }
 function payment(id,cents) {return {id:'pay-'+id,referenceId:id,status:'COMPLETED',locationId:'audit-location',customerId:'audit-customer',amountMoney:{amount:BigInt(cents),currency:'USD'},totalMoney:{amount:BigInt(cents),currency:'USD'},sourceType:'CARD',createdAt:new Date().toISOString(),receiptUrl:base+'/fixture-receipt'};}
 const quote={productId:'s1',kind:'lesson',title:'Audit assessment',totalCents:15400,regularCents:15400,setupCents:0,recurring:false,assessment:true,duration:75,sessionMinutes:75,credits:0,remote:0,expiresDays:0,discipline:'Pitching',resources:[],lines:[],teamRate:false,needsSlot:true};
 try {
  await t.test('email signup starts unverified and refuses household access',async()=>{
   const signup=await authRequest('sign-up/email',{name:'Audit Parent',email:'parent@audit.example.invalid',password});
   assert.equal(signup.response.status,200,JSON.stringify(signup.body));
   parent=signup.body.user.id;
   assert.equal(signup.body.user.emailVerified,false);
   await assert.rejects(api.clubIdentity(parent),/Verify your email/);
   const login=await authRequest('sign-in/email',{email:'parent@audit.example.invalid',password});
   assert.equal(login.response.status,403);
   assert.equal((await sql`select id from session where "userId"=${parent}`).length,0);
  });
  await t.test('verification link permits password login, persisted session and real identity resolution',async()=>{
   const letter=outbox.find(m=>m.to==='parent@audit.example.invalid');
   assert.ok(letter); // The transport is a local outbox, not an email delivery test.
   const verification=await api.handleAuthRequest(new Request(letter.url));
   assert.ok([200,302].includes(verification.status));
   const login=await authRequest('sign-in/email',{email:'parent@audit.example.invalid',password});
   assert.equal(login.response.status,200,JSON.stringify(login.body));
   parentCookie=login.cookie;assert.match(parentCookie,/__Host-grok-auth.session_token=/);
   state.request=new Request(base,{method:'POST',headers:{origin:base,cookie:parentCookie,'sec-fetch-site':'same-origin'}});
   assert.equal((await api.getSessionUser()).id,parent);
   assert.equal((await api.clubIdentity(parent)).role,'parent');
  });
  await t.test('new family creates exactly one athlete for repeated request and rejects future DOB',async()=>{
   const input={requestId:randomUUID(),name:'Audit Athlete',birthDate:'2014-02-01',sport:'baseball',throws:'R',bats:'R'};
   const first=await api.addAthlete(parent,input),second=await api.addAthlete(parent,input);
   assert.equal(first.id,second.id);athlete=first.id;
   assert.equal((await api.familyBilling(parent)).athletes.length,1);
   assert.equal((await api.loadDeskForUser(parent)).data.athletes[0].id,first.id);
   await assert.rejects(api.addAthlete(parent,{...input,requestId:randomUUID(),birthDate:'2099-02-01'}),/valid date/);
  });
  await t.test('test coach, unrelated family and linked player have distinct database identities',async()=>{
   coach=await fixtureUser('audit-coach','coach','Audit Coach');
   other=await fixtureUser('audit-unrelated','parent','Other Parent');
   player=await fixtureUser('audit-player','player','Audit Athlete');
   const me=await api.clubIdentity(parent);
   await sql`insert into household_members(household_id,user_id) values(${me.billingHouseholdIds[0]},${player})`;
   const desk=await api.loadDeskForUser(coach);coachId=desk.data.coaches.find(c=>c.email==='audit-coach@audit.example.invalid').id;
   await sql`insert into club_staff(id,user_id,name,email,role) values('audit-staff',${coach},'Audit Coach','audit-coach@audit.example.invalid','coach')`;
   await sql`insert into club_staff_services(staff_id,service_id,profit_split) values('audit-staff','s1',60),('audit-staff','s2',60)`;
   const full=await api.readWorkingFile();full.availability=[{id:'audit-av',coachId,weekday:'Sun-Sat',window:'10:00 AM-8:00 PM'}];
   await api.writeWorkingFile(full);
   assert.equal((await api.familyBilling(other)).athletes.length,0);
   await assert.rejects(api.loadAthleteForUser(other,athlete),/Forbidden/);
   await assert.rejects(api.coachBookings(parent),/Coach access/);
  });
  await t.test('assessment purchase remains unpaid on decline and wrong amount',async()=>{
   const window=api.validateWindow(future,'16:00',75);
   await placeOrder('audit-assessment',{...quote,resources:[`coach:${coachId}`,`athlete:${athlete}`],bookingWindow:{start:window.start.toISOString(),end:window.end.toISOString(),coachId,participantCount:1}});
   await sql.transaction(tx=>api.fulfillSquarePayment(tx,{...payment('audit-assessment',15400),status:'FAILED'},config));
   await assert.rejects(sql.transaction(tx=>api.fulfillSquarePayment(tx,payment('audit-assessment',1),config)),/verification/);
   assert.equal((await sql`select status from commerce_orders where id='audit-assessment'`)[0].status,'pending');
   assert.equal((await sql`select id from booking_records`).length,0);
  });
  await t.test('verified simulated payment creates one confirmed assessment and one notification despite duplicate event',async()=>{
   for(let i=0;i<2;i++)await sql.transaction(tx=>api.fulfillSquarePayment(tx,payment('audit-assessment',15400),config));
   const rows=await sql`select * from booking_records where order_id='audit-assessment'`;
   assert.equal(rows.length,1);assert.equal(rows[0].status,'confirmed');booking=rows[0].id;
   assert.equal((await api.coachBookings(coach)).length,1);
   assert.equal((await api.familyBilling(parent)).bookings.length,1);
   assert.equal((await api.familyBilling(other)).bookings.length,0);
   assert.equal((await sql`select id from payment_notifications where order_id='audit-assessment' and kind='receipt'`).length,1);
  });
  await t.test('RELEASE GATE: paid assigned coach can open the new athlete development record',async()=>{
   assert.equal((await api.loadAthleteForUser(coach,athlete)).ok,true);
  });
  await t.test('only assigned coach can complete after the end; first completion records one assessment and one earning',async()=>{
   await assert.rejects(api.completeSession(coach,booking,'Too early'),/after it ends/);
   await assert.rejects(api.completeSession(parent,booking,'Forged'),/Coach access/);
   // Advance this isolated fixture to an ended session, retaining five-minute alignment.
   await sql`update booking_records set starts_at=date_trunc('hour',now())-interval '2 hours',ends_at=date_trunc('hour',now())-interval '1 hour' where id=${booking}`;
   assert.equal((await api.completeSession(coach,booking,'Audit assessment completed')).assessmentCompleted,true);
   await api.completeSession(coach,booking,'Retry must not overwrite');
   assert.equal((await sql`select * from athlete_assessments where athlete_id=${athlete}`).length,1);
   const earning=(await sql`select * from contractor_earnings where booking_id=${booking}`)[0];
   assert.equal(earning.amount_cents,9240);assert.equal(earning.status,'payable');
   assert.equal((await sql`select completion_recap from booking_records where id=${booking}`)[0].completion_recap,'Audit assessment completed');
   assert.equal((await api.loadDeskForUser(parent)).data.athletes[0].assessmentComplete,true);
  });
  await t.test('package purchase grants four credits once and records them in the household',async()=>{
   await placeOrder('audit-package',{...quote,productId:'p1',kind:'package',title:'Audit 4 lessons',totalCents:22700,regularCents:22700,assessment:false,duration:30,sessionMinutes:30,credits:4,expiresDays:120,needsSlot:false});
   for(let i=0;i<2;i++)await sql.transaction(tx=>api.fulfillSquarePayment(tx,payment('audit-package',22700),config));
   const grants=await sql`select * from credit_grants where order_id='audit-package'`;assert.equal(grants.length,1);grant=grants[0].id;
   assert.equal(grants[0].remaining,4);assert.equal((await api.familyBilling(parent)).credits.length,1);
   assert.equal((await api.familyBilling(other)).credits.length,0);
  });
  await t.test('available lessons honor coach service assignments and foreign household credits are rejected',async()=>{
   const input={requestId:randomUUID(),grantId:grant,serviceId:'s2',coachId,date:future,time:'18:00',household:false,athleteCount:1};
   h.redemption=input;
   await assert.rejects(api.creditSlots(parent,input),/facility space/);
   await sql`insert into service_resources(service_id,lane_ids) values('s2','["1"]'::jsonb)`;
   assert.ok((await api.creditSlots(parent,input)).some(s=>s.value==='18:00'));
   await assert.rejects(api.creditSlots(other,input),/unavailable/);
   await assert.rejects(api.creditSlots(parent,{...input,serviceId:'s7'}),/not assigned/);
   await assert.rejects(api.creditSlots(parent,{...input,serviceId:'s3'}),/included/);
  });
  await t.test('credit redemption persists one lesson; repeated request cannot spend twice',async()=>{
   await api.redeemCredit(parent,h.redemption);await api.redeemCredit(parent,h.redemption);
   assert.equal((await sql`select remaining from credit_grants where id=${grant}`)[0].remaining,3);
   assert.equal((await sql`select id from booking_records where order_id='audit-package'`).length,1);
   assert.equal((await sql`select id from credit_uses where grant_id=${grant}`).length,1);
  });
  await t.test('unavailable slot rolls back credits and no extra booking or redemption event remains',async()=>{
   await assert.rejects(api.redeemCredit(parent,{...h.redemption,requestId:randomUUID()}),/just booked/);
   assert.equal((await sql`select remaining from credit_grants where id=${grant}`)[0].remaining,3);
   assert.equal((await sql`select id from booking_records where order_id='audit-package'`).length,1);
   assert.equal((await api.creditSlots(parent,h.redemption)).some(s=>s.value==='18:00'),false);
  });
  await t.test('parent can sign minor waiver, unrelated family cannot, repeated signature is idempotent',async()=>{
   const waiver={athleteId:athlete,adultName:'Audit Parent',adultPhone:'555-0100',participantType:'minor',emergencyName:'Audit Emergency',emergencyPhone:'555-0101',signerName:'Audit Parent',relationship:'parent',medicalNotes:'',consent:true};
   await assert.rejects(api.signWaiver(other,waiver),/your household/);
   await api.signWaiver(parent,waiver);await api.signWaiver(parent,waiver);
   assert.equal((await api.myWaivers(parent)).length,1);
   assert.equal((await api.myWaivers(other)).length,0);
   const [lesson]=await sql`select id from booking_records where order_id='audit-package'`;
   await assert.rejects(api.checkIn(parent,lesson.id),/date of your booking/);
   await sql`update booking_records set starts_at=date_trunc('hour',now()),ends_at=date_trunc('hour',now())+interval '1 hour' where id=${lesson.id}`;
   await api.checkIn(parent,lesson.id);
   assert.ok((await sql`select checked_in_at from booking_records where id=${lesson.id}`)[0].checked_in_at);
  });
  await t.test('assigned coach publishes saved lesson/recaps and parent/player reload them without private coach notes',async()=>{
   // Provisioning an assignment is explicit fixture setup, not a fabricated login.
   await sql`update club_athletes set coach_ids=${JSON.stringify([coachId])}::jsonb where id=${athlete}`;
   const coachDesk=await api.loadDeskForUser(coach),d=coachDesk.data;
   d.lessons.push({id:'audit-lesson',athleteId:athlete,date:api.chicagoDate(),coachId,focus:'Balance',minutes:30,notes:'Family recap'});
   d.messages.push({id:'audit-private',athleteId:athlete,channel:'coach',fromName:'Audit Coach',fromRole:'coach',body:'Private staff note',createdAt:new Date().toISOString()},{id:'audit-shared',athleteId:athlete,channel:'family',fromName:'Audit Coach',fromRole:'coach',body:'Practice balance',createdAt:new Date().toISOString()});
   await api.saveDeskForUser(coach,d);
   for(const userId of [parent,player]){
    const saved=(await api.loadDeskForUser(userId)).data;
    assert.ok(saved.lessons.some(l=>l.id==='audit-lesson'));
    assert.ok(saved.messages.some(m=>m.id==='audit-shared'));
    assert.equal(saved.messages.some(m=>m.id==='audit-private'),false);
   }
   assert.equal((await api.loadDeskForUser(other)).data.lessons.length,0);
  });
  await t.test('stale coach save is rejected and parent cannot forge completed assessment or coach-only records',async()=>{
   const stale=(await api.loadDeskForUser(coach)).data;
   await api.writeMessageForUser(parent,{athleteId:athlete,body:'Parent response',channel:'family'});
   await assert.rejects(api.saveDeskForUser(coach,stale),/Another editor/);
   await assert.rejects(api.writeMessageForUser(other,{athleteId:athlete,body:'Forged'}),/Forbidden/);
   const d=(await api.loadDeskForUser(parent)).data;
   d.lessons.push({id:'forged',athleteId:athlete,date:api.chicagoDate(),coachId,focus:'Forged',minutes:1,notes:'Forged'});
   await api.saveDeskForUser(parent,d);
   assert.equal((await api.readWorkingFile()).lessons.some(l=>l.id==='forged'),false);
  });
  await t.test('softball registration submission persists once and rejects cross-origin requests',async()=>{
   const input={kind:'tryout',requestId:randomUUID(),player:'Audit Softball Player',age:'12U',parent:'Audit Parent',phone:'555-0100',email:'parent@audit.example.invalid',notes:'ISOLATED AUDIT ONLY',sport:'Softball',session:'Individual tryout request'};
   await api.submitInquiry(input);await api.submitInquiry(input);
   assert.equal((await sql`select id from club_requests where id=${input.requestId}`).length,1);
   for(const sport of ['Baseball','Softball']){
    const extended={...input,requestId:randomUUID(),age:'18U',sport};
    await api.submitInquiry(extended);
    const [saved]=await sql`select payload from club_requests where id=${extended.requestId}`;
    assert.equal(saved.payload.age,'18U');assert.equal(saved.payload.sport,sport);
   }
   await assert.rejects(api.submitInquiry({...input,requestId:randomUUID(),age:' '}),/age group/);
   const prior=state.request;
   state.request=new Request(base,{method:'POST',headers:{origin:'https://unrelated.example.invalid','sec-fetch-site':'cross-site'}});
   await assert.rejects(api.submitInquiry({...input,requestId:randomUUID()}),/cross-site/);state.request=prior;
  });
  await t.test('coordinator reader can see registrations, cannot see billing requests or grant access',async()=>{
   await assert.rejects(api.registrationRowsFor(sql,other),/viewing access/);
   const owner=await fixtureUser('audit-owner','admin','Audit Owner');
   await sql`insert into owner_grants(email,user_id) values('audit-owner@audit.example.invalid',${owner})`;
   await api.setRegistrationReaderFor(sql,owner,{userId:other,enabled:true});
   await sql`insert into club_requests(id,user_id,kind,payload) values('audit-refund',${parent},'refund-review','{"private":"payment"}'::jsonb)`;
   const rows=await api.registrationRowsFor(sql,other);
   assert.ok(rows.some(r=>r.payload.player==='Audit Softball Player'));
   assert.equal(rows.some(r=>r.kind==='refund-review'),false);
   await assert.rejects(api.setRegistrationReaderFor(sql,other,{userId:parent,enabled:true}),/Owner access/);
   await sql`update registration_readers set active=false where user_id=${other}`;
   await assert.rejects(api.registrationRowsFor(sql,other),/viewing access/);
  });
  await t.test('fundraising page creation is pending owner approval and public response excludes family contact details',async()=>{
   const me=await api.clubIdentity(parent);
   const team={id:'audit-team',name:'Audit 12U',sport:'baseball',age:'12U',seasonLabel:'2027',roster:[{id:'audit-roster',name:'Private full roster name',familyId:me.familyIds[0],parents:[{email:'parent@audit.example.invalid'}]}]};
   await sql`insert into club_state(id,payload,demo) values('oklahoma-prospects',${JSON.stringify({teams:[team]})}::jsonb,false) on conflict(id) do update set payload=excluded.payload,demo=false`;
   const options=await api.fundraisingRoster.GET(new Request(base+'/api/fundraising/teams?scope=my'));
   assert.equal(options.status,200);assert.equal((await options.json()).choices[0].rosterPlayerId,'audit-roster');
   const input={name:'Audit Fundraiser',teamId:'audit-team',rosterPlayerId:'audit-roster',number:'8',goal:100000,story:'Isolated audit fundraising story.',consent:true};
   const request=new Request(base+'/api/fundraising/players',{method:'POST',headers:{origin:base,'content-type':'application/json',cookie:parentCookie},body:JSON.stringify(input)});
   const response=await api.fundraisingPlayers.POST(request);assert.equal(response.status,201,await response.clone().text());
   const made=await response.json();assert.equal(made.approved,false);h.fundraiser=made.id;
   assert.equal((await api.fundraising.listPlayers('home')).length,0);
   assert.equal((await api.fundraising.listPlayers('my',parent)).length,1);
   assert.equal((await api.fundraising.listPlayers('my',other)).length,0);
   assert.equal((await api.fundraisingDashboard.GET(new Request(base+'/api/fundraising/dashboard?scope=office'))).status,403);
   await sql`update fundraising_players set approved=1 where id=${made.id}`;
   const published=await api.fundraising.publicPlayer(made.id);assert.equal(published.name,'Audit Fundraiser');
   assert.equal('parent_email' in published,false);assert.equal('owner_id' in published,false);
   const rosterResponse=await api.fundraisingRoster.GET(new Request(base+'/api/fundraising/teams?teamId=audit-team'));
   assert.equal(rosterResponse.status,200);const roster=(await rosterResponse.json()).team;
   assert.equal(roster.players.length,1);assert.equal(roster.players[0].name,'Audit Fundraiser');
   assert.deepEqual(Object.keys(roster.players[0]).sort(),['goal','id','name','raised']);
   assert.equal(roster.players[0].id,made.id);
   assert.equal('roster_player_id' in roster.players[0],false);
   assert.equal('team_id' in roster.players[0],false);
   assert.equal('parents' in roster.players[0],false);
  });
  await t.test('public fundraising totals include completed payments less refunds and exclude pending/failed payments',async()=>{
   for(const [id,status,amount,refunded] of [['paid','completed',5000,1200],['pending','pending',2000,0],['failed','failed',1000,0]])
    await sql`insert into fundraising_contributions(id,player_id,donor,email,amount,refunded,status,created) values(${id},${h.fundraiser},'Audit Donor','donor@audit.example.invalid',${amount},${refunded},${status},${new Date().toISOString()})`;
   const row=await api.fundraising.publicPlayer(h.fundraiser);assert.equal(Number(row.raised),3800);assert.equal(Number(row.sponsors),1);
   const dashboard=await api.fundraisingDashboard.GET(new Request(base+'/api/fundraising/dashboard?scope=home'));
   const json=await dashboard.json();assert.deepEqual(json.contributions,[]);assert.deepEqual(json.players,[]);assert.equal(json.paymentReady,false);
   await sql`update fundraising_players set active=0 where id=${h.fundraiser}`;
   assert.equal(await api.fundraising.publicPlayer(h.fundraiser),null);
  });
  await t.test('sign out revokes persisted session and old cookie cannot resolve an account',async()=>{
   const logout=await authRequest('sign-out',{},parentCookie);assert.equal(logout.response.status,200);
   assert.equal(await api.getSessionUser(),null);
  });
  await t.test('password reset via local outbox revokes old password and sessions',async()=>{
   const login=await authRequest('sign-in/email',{email:'parent@audit.example.invalid',password});
   assert.equal(login.response.status,200);
   const reset=await authRequest('request-password-reset',{email:'parent@audit.example.invalid',redirectTo:base+'/login'});
   assert.equal(reset.response.status,200);
   const letter=outbox.findLast(m=>m.subject==='Reset your password');assert.ok(letter);
   const token=new URL(letter.url).pathname.split('/').at(-1);
   const newPassword=randomBytes(20).toString('base64url');
   const changed=await authRequest('reset-password',{token,newPassword});assert.equal(changed.response.status,200,JSON.stringify(changed.body));
   assert.equal((await authRequest('sign-in/email',{email:'parent@audit.example.invalid',password})).response.status,401);
   assert.equal((await authRequest('sign-in/email',{email:'parent@audit.example.invalid',password:newPassword})).response.status,200);
   const staleSession=await authRequest('get-session',undefined,login.cookie);assert.equal(staleSession.body,null);
  });
  await t.test('disabled and unverified identities cannot read existing household records',async()=>{
   await sql`update "user" set "disabledAt"=now() where id=${other}`;
   await assert.rejects(api.familyBilling(other),/Unauthorized/);
   await sql`update "user" set "emailVerified"=false where id=${player}`;
   await assert.rejects(api.loadDeskForUser(player),/Verify your email/);
  });
 } finally { await h.close(); }
});
