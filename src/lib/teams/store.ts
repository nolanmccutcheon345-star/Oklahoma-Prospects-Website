import { assertRosterAssignment } from "./po-roster.server";
import { rosterAddInput, inquiryRosterInput, assertPORosterSpace, type RosterRole } from "./po-roster";
import {z} from "zod";
import {parseClubSave} from "./contracts";
import { assertTeamInquiryPlacement } from "./inquiry-placement";
import { withFinancialContext, loadFinancialContextInTransaction, lockFinancialExecution, recordFinancialTeamPaymentInTransaction, commitFinancialClubTermsInTransaction, commitFinancialCatalogPriceInTransaction, previewFinancialAdmissionInTransaction, admitFinancialEntitiesForOwnerInTransaction } from "../finance/context.server";
import { financialClubTermsChangeSchema, financialAdmissionSchema } from "../finance/context-contracts";
import { readStoredClub, writeStoredClub, persistClubSave, mutateStoredClub, scopedClubResult } from "./club-store.server";
import { financialPrincipalInTransaction } from "../finance/principal.server";
import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { getProfile } from "@/lib/club-data";
import { clubIdentity } from "@/lib/identity.server";
import { scopeClub, coachHoldsTeam } from "./privacy";
import { emptyClub, sampleClub } from "./seed";
import type { ClubRecord, Player, Team } from "./types";
import type { ClubRole } from "@/lib/club-data";
import { seasonSaveInput, persistTeamSeasons } from "./season-save.server";
import { recordTeamRosterConsent, revokeTeamRosterConsent } from './roster-consent';

type Identity = { primaryRole:ClubRole; playerIds:string[]; guardianHouseholdIds:string[]; email: string; familyId: string; familyIds:string[]; role: ClubRole; name: string };

async function identity(userId: string): Promise<Identity> {
  const me = await clubIdentity(userId);
  let familyId = me.familyId;
  const club = await loadRaw();
  const matched = club?.teams.flatMap(team => team.roster).find(player =>
    player.parents.some(parent => parent.email.trim().toLowerCase() === me.email)
    || (me.role === "player" && player.email.trim().toLowerCase() === me.email));
  if (matched?.familyId) familyId = matched.familyId;
  return { ...me, primaryRole:me.role, role:me.role==='admin'?'admin':me.canTeamCoach?'coach':me.role, familyId };
}

async function loadRaw(sql?:Sql,lock=false){ return readStoredClub(sql||await getSql(),lock); }
async function writeRaw(club:ClubRecord,expectedRev:number|undefined,tx:Sql){ return writeStoredClub(tx,club,expectedRev); }

async function clubResponse(userId:string, me:Identity, family=false) {
  const sql=await getSql();
  if(!await loadRaw(sql)) return {ok:false as const,missing:true as const,role:me.role,me};
  return withFinancialContext(sql,userId,"read",async(tx,financial)=>{
    const club=await loadRaw(tx);
    if(!club)return {ok:false as const,missing:true as const,role:me.role,me};
    return {missing:false as const,role:me.role,me,
      ...scopedClubResult(club,me,financial,family?"family":me.role==="admin"?"office":"coach")};
  });
}
export const getTeamsClub=createServerFn({method:"POST"}).middleware([authMiddleware])
  .handler(async({context})=>clubResponse(context.userId,await identity(context.userId)));

async function familyIdentity(userId:string):Promise<Identity>{const me=await identity(userId);const club=await loadRaw();const selfIds=club?.teams.flatMap(t=>t.roster.filter(p=>p.email&&p.email.trim().toLowerCase()===me.email).map(p=>p.id))||[];return {...me,playerIds:[...new Set([...me.playerIds,...selfIds])],familyIds:me.primaryRole==='player'?me.guardianHouseholdIds:me.familyIds,role:me.primaryRole==='admin'?'admin':me.primaryRole==='player'&&!me.guardianHouseholdIds.length?'player':'parent'};}
export const getFamilyTeamsClub=createServerFn({method:'POST'}).middleware([authMiddleware])
  .handler(async({context})=>clubResponse(context.userId,await familyIdentity(context.userId),true));
async function saveClub(userId:string,me:Identity,data:ReturnType<typeof parseClubSave>) {
  return persistClubSave(await getSql(),userId,me,data);
}
export const saveFamilyTeamsClub=createServerFn({method:'POST'}).middleware([authMiddleware]).validator(parseClubSave)
  .handler(async({context,data})=>saveClub(context.userId,await familyIdentity(context.userId),data));

export const onboardTeamsClub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({mode:z.enum(["empty","sample"])}).strict())
  .handler(async ({ context, data }) => {
    const me = await identity(context.userId);
    if (me.role !== "admin") throw new Error("Front office only.");
    const existing = await loadRaw();
    if (existing) throw new Error("Club already exists. Reload.");
    if (data.mode === "sample" && process.env.NODE_ENV === "production") throw new Error("Sample data is only available locally.");
    const club = data.mode === "sample" ? sampleClub() : emptyClub();
    await (await getSql()).transaction(async tx=>{
      await lockFinancialExecution(tx);
      const principal=await financialPrincipalInTransaction(tx,context.userId);
      if(!principal.owner)throw new Error("Financial owner access required.");
      await writeRaw(club,undefined,tx);
    });
    return { ok: true, club: scopeClub(club, "admin", me) };
  });

export const saveTeamsClub=createServerFn({method:"POST"}).middleware([authMiddleware]).validator(parseClubSave)
  .handler(async({context,data})=>saveClub(context.userId,await identity(context.userId),data));

export const recordTeamPayment=createServerFn({method:"POST"}).middleware([authMiddleware])
  .validator(z.object({teamId:z.string().min(1).max(150),playerId:z.string().min(1).max(150),amount:z.number().finite().positive().max(100000),method:z.string().min(1).max(80),label:z.string().min(1).max(200),expectedBasisVersion:z.number().int().positive().optional()}).strict())
  .handler(async({context,data})=>{
    const me=await identity(context.userId);
    await withFinancialContext(await getSql(),context.userId,"owner",(tx,financial)=>recordFinancialTeamPaymentInTransaction(tx,financial,data));
    const result=await clubResponse(context.userId,me);
    if(!result.ok)throw new Error("Club is not open.");
    return result;
  });

/** Explicit owner-only financial command, never called by a bulk club save. */
export const saveTeamFinancialTerms=createServerFn({method:"POST"}).middleware([authMiddleware])
  .validator(financialClubTermsChangeSchema)
  .handler(async({context,data})=>{
    await identity(context.userId);
    return withFinancialContext(await getSql(),context.userId,"owner",(tx,financial)=>commitFinancialClubTermsInTransaction(tx,financial,data));
  });

export const saveFinancialCatalogPrice=createServerFn({method:"POST"}).middleware([authMiddleware])
  .validator(z.object({expectedBasisVersion:z.number().int().positive(),sourceClubRevision:z.number().int().nonnegative(),catalogId:z.string().min(1).max(200),fee:z.number().finite().min(0).max(1_000_000_000),confirmed:z.literal(true),reason:z.string().trim().min(1).max(1000)}).strict())
  .handler(async({context,data})=>{
    await identity(context.userId);
    return withFinancialContext(await getSql(),context.userId,"owner",(tx,financial)=>commitFinancialCatalogPriceInTransaction(tx,financial,data));
  });

export const previewTeamFinancialAdmission=createServerFn({method:"POST"}).middleware([authMiddleware])
  .validator(z.object({teamId:z.string().min(1).max(150),playerIds:z.array(z.string().min(1).max(150)).max(500),sourceClubRevision:z.number().int().nonnegative()}).strict())
  .handler(async({context,data})=>{
    await identity(context.userId);
    return withFinancialContext(await getSql(),context.userId,"owner",(tx,financial)=>previewFinancialAdmissionInTransaction(tx,financial,data));
  });
export const admitTeamFinancialEntities=createServerFn({method:"POST"}).middleware([authMiddleware])
  .validator(financialAdmissionSchema)
  .handler(async({context,data})=>{
    await identity(context.userId);
    return withFinancialContext(await getSql(),context.userId,"owner",(tx,financial)=>admitFinancialEntitiesForOwnerInTransaction(tx,financial,data));
  });

export const saveTeamRosterConsent = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({teamId:z.string().min(1).max(150),playerId:z.string().min(1).max(150),
    signerName:z.string().trim().min(1).max(120),consent:z.literal(true),baseRev:z.number().int().nonnegative()}).strict())
  .handler(async ({context,data}) => {
    const me = await identity(context.userId);
    await mutateStoredClub(await getSql(),context.userId,me.role==='admin'?'owner':'read',data.baseRev,async(_tx,club)=>{
      recordTeamRosterConsent(club,data,{...me,familyIds:[...new Set([...me.familyIds,me.familyId])]});
    });
    return {ok:true};
  });

export const withdrawTeamRosterConsent = createServerFn({method: 'POST'})
  .middleware([authMiddleware])
  .validator(z.object({teamId:z.string().min(1).max(150),playerId:z.string().min(1).max(150),baseRev:z.number().int().nonnegative()}).strict())
  .handler(async ({context,data}) => {
    const me = await identity(context.userId);
    await mutateStoredClub(await getSql(),context.userId,me.role==='admin'?'owner':'read',data.baseRev,async(_tx,club)=>{
      revokeTeamRosterConsent(club,data,{...me,familyIds:[...new Set([...me.familyIds,me.familyId])]});
    });
    return {ok:true};
  });

export const getTeamRoster = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({teamId:z.string().min(1).max(150)}).strict())
  .handler(async ({ context, data }) => {
    const me = await identity(context.userId);
    const result=await clubResponse(context.userId,me);
    if (!result.ok) throw new Error("Club is not open.");
    const team = result.club.teams.find(t=>t.id===data.teamId);
    if (!team) throw new Error("Not your team.");
    return { ok: true as const, team };
  });

export const getPlayerRecord = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({teamId:z.string().min(1).max(150),playerId:z.string().min(1).max(150)}).strict())
  .handler(async ({ context, data }) => {
    const me = await identity(context.userId);
    const result=await clubResponse(context.userId,me);
    if (!result.ok) throw new Error("Club is not open.");
    const player = result.club.teams.find(t=>t.id===data.teamId)?.roster.find(p=>p.id===data.playerId&&p.teamId===data.teamId);
    if (!player) throw new Error("Player is not accessible on the requested team.");
    return { ok: true as const, player };
  });

export { getProfile };

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "new";
}

function blankPlayer(input: {
  teamId: string;
  familyId: string;
  name: string;
  parentName: string;
  parentEmail: string;
  rosterRole: RosterRole;
}): Player {
  return {
    id: `p-${slug(input.name)}-${Date.now().toString(36).slice(-4)}`,
    teamId: input.teamId,
    familyId: input.familyId,
    name: input.name,
    number: "",
    positions: [],
    bats: "R",
    throws: "R",
    gradYear: "",
    school: "",
    height: "",
    weight: "",
    email: "",
    parents: [{ name: input.parentName, rel: "guardian", phone: "", email: input.parentEmail }],
    roleType: input.rosterRole,
    coachChild: false,
    joinedOn: new Date().toISOString().slice(0, 10),
    withdrawn: false,
    agreement: { version: "", signedBy: "", signedAt: "" },
    feeLock: null,
    planLock: null,
    credits: [],
    payments: [],
    cards: [],
    planType: "four",
    depositPaid: false,
    uniformWaived: false,
    order: { number: "", sizes: {}, submitted: false },
    docs: { waiver: false, birthCert: false, insurance: false, physical: false },
    emergency: {
      allergies: "",
      conditions: "",
      insurer: "",
      policyNo: "",
      physician: "",
      pickup: [],
      notes: "",
    },
    publicProfile: { enabled: false, bio: "", slug: "" },
    prefs: { email: true, sms: true },
    reenroll: false,
    cageOverage: 0,
    stats: {},
    rsvp: {},
  };
}

export const officeAddTeam = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({name:z.string().trim().min(1).max(200),age:z.string().trim().max(30),sport:z.enum(["baseball","softball"]),season:z.string().trim().min(3).max(100)}).strict())
  .handler(async ({ context, data }) => {
    const me = await identity(context.userId);
    if (me.role !== "admin") throw new Error("Front office only.");
    const stored = await loadRaw();
    if (!stored) throw new Error("Club is not open.");
    const name = data.name.trim();
    if (!name) throw new Error("Team name is required.");
    const team: Team = {
      id: `t-${slug(name)}-${Date.now().toString(36).slice(-4)}`,
      name,
      sport: data.sport,
      age: data.age.trim() || "Open",
      level: "Open",
      seasonLabel: data.season,
      seasons: data.season.split(/\s*&\s*/),
      seasonStart: "",
      seasonEnd: "",
      months: 6,
      headCoach: "",
      coachEmail: "",
      staff: [],
      uniformPackageId: stored.uniforms[0]?.id ?? "",
      uniformDeadline: "",
      orgFee: 0,
      coachMonthly: 0,
      eventBudget: 0,
      tournamentIds: [],
      otherCosts: { insurance: 0, balls: 0, fields: 0, admin: 0, travel: 0 },
      teamCageHoursPerWeek: 0,
      playerCageHoursPerWeek: 0,
      record: { w: 0, l: 0, t: 0 },
      roster: [],
      practices: [],
      messages: [],
      announcements: [],
      attendance: {},
      pitchLog: [],
      closed: false,
      notes: "",
    };
    stored.teams.push(team);
    stored._rev += 1;
    stored._savedAt = new Date().toISOString();
    stored.audit.unshift({ at: stored._savedAt, action: "team", detail: `Added ${team.name}` });
    const sql = await getSql();
    const { initializeTeamBudget } = await import("./budget-matrix.server");
    await sql.transaction(async (tx) => {
      await lockFinancialExecution(tx);
      const financial=await loadFinancialContextInTransaction(tx,context.userId,"owner");
      const plan = financial.mode === "legacy" ? await initializeTeamBudget(tx, team) : null;
      if (plan) team.months = plan.budget.months;
      await writeRaw(stored, stored._rev - 1, tx);
    });
    const result=await clubResponse(context.userId,me); if(!result.ok)throw new Error("Club is not open."); return result;
  });

export const officeRemoveTeam = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({teamId:z.string().min(1).max(150),baseRev:z.number().int().nonnegative()}).strict())
  .handler(async ({context,data}) => {
    const me=await identity(context.userId);
    if(me.role!=="admin") throw new Error("Front office only.");
    await mutateStoredClub(await getSql(),context.userId,'owner',data.baseRev,async(_tx,stored)=>{
      const team=stored.teams.find(t=>t.id===data.teamId);
      if(!team)throw new Error("Team not found.");
      if(team.roster.length||team.tournamentIds.length||team.practices.length||team.messages.length)
        throw new Error("This team has roster or activity records. Remove or transfer them before deleting the team.");
      stored.teams=stored.teams.filter(t=>t.id!==data.teamId);
      stored.audit.unshift({at:new Date().toISOString(),action:'team-delete',detail:`Removed ${team.name}`});
    });
    const result=await clubResponse(context.userId,me); if(!result.ok)throw new Error("Club is not open."); return result;
  });

export const officeSaveTeamSeasons = createServerFn({method: "POST"})
  .middleware([authMiddleware]).validator(seasonSaveInput)
  .handler(async ({context, data}) => {
    const me = await identity(context.userId);
    if (me.role !== "admin") throw new Error("Front office only.");
    await persistTeamSeasons(await getSql(), data, context.userId);
    const result=await clubResponse(context.userId,me); if(!result.ok)throw new Error("Club is not open."); return result;
  });

async function addRosterPlayer(userId:string,me:Identity,data:z.infer<typeof rosterAddInput>,ownerOnly:boolean){
  if(ownerOnly?me.role!=='admin':me.role!=='admin'&&me.role!=='coach')throw new Error("Coach access required.");
  await mutateStoredClub(await getSql(),userId,me.role==='admin'?'owner':'read',undefined,async(tx,club)=>{
    const team=club.teams.find(t=>t.id===data.teamId);
    if(!team||me.role!=='admin'&&!coachHoldsTeam(club,me.email,team.id))throw new Error("Not assigned to this team.");
    const email=data.parentEmail.trim().toLowerCase();
    await tx`insert into club_households(id,primary_email) values(${'fam-'+randomUUID()},${email}) on conflict(primary_email) do nothing`;
    const [household]=await tx<{id:string}>`select id from club_households where primary_email=${email}`;
    const player=blankPlayer({teamId:team.id,familyId:household.id,name:data.name,parentName:data.parentName||'Parent',parentEmail:email,rosterRole:data.rosterRole});
    team.roster.push(player);
    if(ownerOnly)await tx`update profiles set family_id=${household.id} where lower(email)=${email}`;
    club.audit.unshift({at:new Date().toISOString(),action:ownerOnly?'player':'coach-roster-add',detail:`Added ${player.name} to ${team.name}`});
  });
  const result=await clubResponse(userId,me);if(!result.ok)throw new Error("Club is not open.");return result;
}
export const coachAddRosterPlayer=createServerFn({method:'POST'}).middleware([authMiddleware]).validator(rosterAddInput)
  .handler(async({context,data})=>addRosterPlayer(context.userId,await identity(context.userId),data,false));
export const officeAddPlayer=createServerFn({method:'POST'}).middleware([authMiddleware]).validator(rosterAddInput)
  .handler(async({context,data})=>addRosterPlayer(context.userId,await identity(context.userId),data,true));
export const coachRemoveRosterPlayer=createServerFn({method:'POST'}).middleware([authMiddleware])
  .validator(z.object({teamId:z.string().min(1).max(150),playerId:z.string().min(1).max(150)}).strict())
  .handler(async({context,data})=>{
    const me=await identity(context.userId);
    if(me.role!=='admin'&&me.role!=='coach')throw new Error("Coach access required.");
    await mutateStoredClub(await getSql(),context.userId,me.role==='admin'?'owner':'read',undefined,async(_tx,club,financial)=>{
      const team=club.teams.find(t=>t.id===data.teamId);
      if(!team||me.role!=='admin'&&!coachHoldsTeam(club,me.email,team.id))throw new Error("Not assigned to this team.");
      const player=team.roster.find(p=>p.id===data.playerId);
      if(!player)throw new Error("Player not found.");
      if(financial.mode==='legacy'&&(player.payments.length||player.feeLock||player.planLock||player.credits.length))throw new Error("Player has billing records. Contact Front Office to handle a transfer or withdrawal.");
      team.roster=team.roster.filter(p=>p.id!==data.playerId);
      club.audit.unshift({at:new Date().toISOString(),action:'coach-roster-remove',detail:`Removed player from ${team.name}`});
    });
    const result=await clubResponse(context.userId,me);if(!result.ok)throw new Error("Club is not open.");return result;
  });

export const reviewTeamInquiry=createServerFn({method:'POST'}).middleware([authMiddleware])
 .validator(inquiryRosterInput)
 .handler(async({context,data})=>{
  const me=await identity(context.userId);if(me.role!=='admin')throw new Error('Front office only.');
  const sql=await getSql();
  return sql.transaction(async tx=>{
   await lockFinancialExecution(tx);
   const financial=await loadFinancialContextInTransaction(tx,context.userId,"owner");
   const [request]=await tx<{kind:string;payload:{player:string;parent:string;email:string;sport:string;age:string;preferredTeamId?:string;preferredCoachId?:string;rosterPlayerId?:string}}> `select kind,payload from club_requests where id=${data.id} for update`;
   if(!request||!['tryout','team-inquiry'].includes(request.kind))throw new Error('Choose a tryout or team inquiry.');
   const [row]=await tx<{payload:ClubRecord;rev:number}>`select payload,rev from club_state where id='oklahoma-prospects' for update`;
   if(!row)throw new Error('Open the club record first.');
   const club={...row.payload,_rev:row.rev},team=club.teams.find(t=>t.id===data.teamId);
   if(!team)throw new Error('Choose a current team.');
   if(request.payload.rosterPlayerId)return {ok:true,message:'This registration is already on a roster.'};
   assertTeamInquiryPlacement(request.payload,team,data.acknowledgePreferenceOverride);
   if(data.stage==='offer'||data.stage==='accepted') {
    if(financial.mode==='basis') { if(data.rosterRole==='po') assertPORosterSpace(team); }
    else await assertRosterAssignment(tx,team,data.rosterRole!, '',data.id);
   }
   const leadId='inquiry-'+data.id,prior=club.leads.find(l=>l.id===leadId);
   const lead={id:leadId,name:request.payload.player,age:request.payload.age,stage:data.stage,grades:prior?.grades||{},teamId:team.id};
   club.leads=[...club.leads.filter(l=>l.id!==leadId),lead];
   let rosterPlayerId:string|undefined;
   if(data.stage==='accepted'){
    const email=z.string().email().parse(request.payload.email).toLowerCase();
    await tx`insert into club_households(id,primary_email) values(${'fam-'+randomUUID()},${email}) on conflict(primary_email) do nothing`;
    const [household]=await tx<{id:string}>`select id from club_households where primary_email=${email}`;
    const player=blankPlayer({teamId:team.id,familyId:household.id,name:request.payload.player,parentName:request.payload.parent,parentEmail:email,rosterRole:data.rosterRole!});
    team.roster.push(player);rosterPlayerId=player.id;
    await tx`insert into club_invites(id,token_hash,email,team_id,family_id,invited_by,role,expires_at) values(${randomUUID()},${randomUUID()},${email},${team.id},${household.id},${context.userId},'parent',now()+interval '7 days')`;
   }
   const revision=club._rev;club._rev++;club._savedAt=new Date().toISOString();
   await tx`update club_requests set status=case when ${data.stage}='accepted' then 'accepted' else status end,payload=payload||${JSON.stringify({stage:data.stage,teamId:team.id,...(data.rosterRole?{rosterRole:data.rosterRole}:{}),...(rosterPlayerId?{rosterPlayerId}:{})})}::jsonb where id=${data.id}`;
   await writeRaw(club,revision,tx);
   return {ok:true,message:rosterPlayerId?'Added to the roster. Ask the guardian to sign in at /invitations to accept access.':'Registration stage saved.'};
  });
 });
