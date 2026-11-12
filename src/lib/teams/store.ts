import { duplicateRosterPlayer, assertSafeRosterMerge } from "./roster-cleanup";
import { balance } from "./pricing";
import { assertRosterAssignment } from "./po-roster.server";
import { rosterAddInput, inquiryRosterInput, assertPORosterSpace, type RosterRole } from "./po-roster";
import {z} from "zod";
import {parseClubSave} from "./contracts";
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
import { blankPlayer, slug } from "./blank-player";
import { assertSecondTeamReason, householdGuardian, liveTeamsFor, recordAssignment, reviewTeamInquiryForOffice } from "./roster-assignment.server";
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
  return { ...me, primaryRole:me.role, role:me.role==='admin'?'admin':me.canTeamCoach?'coach':me.role==='coach'&&me.coachInactive?'parent':me.role, familyId };
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
  .validator(z.object({teamId:z.string().min(1).max(150),playerId:z.string().min(1).max(150),amount:z.number().finite().positive().max(100000),method:z.enum(["Cash","Check","Square invoice","Bank transfer"]),label:z.string().trim().min(1).max(200),verifiedReceived:z.literal(true),requestId:z.string().uuid(),expectedBasisVersion:z.number().int().positive().optional()}).strict())
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
  .validator(z.object({teamId:z.string().min(1).max(150),baseRev:z.number().int().nonnegative(),confirmedTeamName:z.string().min(1).max(200)}).strict())
  .handler(async ({context,data}) => {
    const me=await identity(context.userId);
    if(me.role!=="admin") throw new Error("Front office only.");
    await mutateStoredClub(await getSql(),context.userId,'owner',data.baseRev,async(tx,stored)=>{
      const team=stored.teams.find(t=>t.id===data.teamId);
      if(!team)throw new Error("Team not found.");
      if(data.confirmedTeamName!==team.name)throw new Error("Type the exact team name to confirm whole-team removal.");
      if(team.roster.length||team.tournamentIds.length||team.practices.length||team.messages.length)
        throw new Error("This team has roster or activity records. Remove or transfer them before deleting the team.");
      await tx`update team_dev_roster_links set ended_at=now(),ended_by=${context.userId} where team_id=${team.id} and ended_at is null`;
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
    const existing=duplicateRosterPlayer(team,data.name,email);
    if(existing && data.existingPlayerId===existing.id && !existing.withdrawn)return;
    if(data.existingPlayerId)throw Error('The selected existing player changed or is no longer active. Review the roster again.');
    if(existing) throw Error(`Duplicate roster player: ${existing.name} (${existing.id}). Open the existing record or cancel; no new player was created.`);
    await tx`insert into club_households(id,primary_email) values(${'fam-'+randomUUID()},${email}) on conflict(primary_email) do nothing`;
    const [household]=await tx<{id:string}>`select id from club_households where primary_email=${email}`;
    const guardian=await householdGuardian(tx,household.id);
    const others=await liveTeamsFor(tx,club,{teamId:team.id,householdId:household.id,name:data.name});
    if(others.length&&me.role!=='admin')throw new Error("This player is already on another team. Ask Front Office to place them on a second team.");
    const additionalTeamReason=assertSecondTeamReason(club,others,data.additionalTeamReason);
    const player=blankPlayer({teamId:team.id,familyId:household.id,name:data.name,parentName:data.parentName||'Parent',parentEmail:guardian.email,rosterRole:data.rosterRole});
    team.roster.push(player);
    await recordAssignment(tx,{actor:userId,action:'assign',teamId:team.id,status:'active',source:me.role==='admin'?'office':'coach',rosterPlayerId:player.id,householdId:household.id,additionalTeamReason});
    if(ownerOnly)await tx`update profiles set family_id=${household.id} where lower(email)=${email}`;
    club.audit.unshift({at:new Date().toISOString(),action:ownerOnly?'player':'coach-roster-add',detail:`Added ${player.name} to ${team.name}`});
  });
  const result=await clubResponse(userId,me);if(!result.ok)throw new Error("Club is not open.");return result;
}
export const coachAddRosterPlayer=createServerFn({method:'POST'}).middleware([authMiddleware]).validator(rosterAddInput)
  .handler(async({context,data})=>addRosterPlayer(context.userId,await identity(context.userId),data,false));
export const officeAddPlayer=createServerFn({method:'POST'}).middleware([authMiddleware]).validator(rosterAddInput)
  .handler(async({context,data})=>addRosterPlayer(context.userId,await identity(context.userId),data,true));
const cleanupTarget = z.object({teamId:z.string().min(1).max(150),playerId:z.string().min(1).max(150)}).strict();
const cleanupCommand = cleanupTarget.extend({baseRev:z.number().int().nonnegative(),expectedDue:z.number().finite().nonnegative().nullable(),reason:z.string().trim().min(1).max(1000),requestId:z.string().uuid(),confirmed:z.literal(true)}).strict();
function cleanupDue(financial: Awaited<ReturnType<typeof loadFinancialContextInTransaction>>, teamId:string, player:Player) {
  const source=financial.club.teams.find(t=>t.id===teamId)?.roster.find(p=>p.id===player.id) || player;
  return source.feeLock ? balance(source,source.feeLock.amount) : null;
}
export const previewRosterRemoval=createServerFn({method:'POST'}).middleware([authMiddleware]).validator(cleanupTarget)
 .handler(async({context,data})=>{
  const me=await identity(context.userId);if(me.role!=='admin')throw Error('Front office only.');
  return withFinancialContext(await getSql(),context.userId,'owner',async(tx,financial)=>{
   const club=await readStoredClub(tx,true),team=club?.teams.find(t=>t.id===data.teamId),player=team?.roster.find(p=>p.id===data.playerId);
   if(!club||!team||!player)throw Error('Player not found.');
   return {teamId:team.id,playerId:player.id,baseRev:club._rev,teamName:team.name,playerName:player.name,parentEmail:player.parents.map(p=>p.email).filter(Boolean).join(', '),due:cleanupDue(financial,team.id,player)};
  });
 });
/** Kept under its old export for compatibility; removal is now strictly owner-only. */
export const coachRemoveRosterPlayer=createServerFn({method:'POST'}).middleware([authMiddleware]).validator(cleanupCommand)
 .handler(async({context,data})=>{
  const me=await identity(context.userId);if(me.role!=='admin')throw Error('Front office only.');
  await mutateStoredClub(await getSql(),context.userId,'owner',undefined,async(tx,club,financial)=>{
   const team=club.teams.find(t=>t.id===data.teamId),player=team?.roster.find(p=>p.id===data.playerId);
   if(!team||!player)throw Error('Player not found.');
   if(player.rosterRemoval?.requestId===data.requestId)return;
   if(player.rosterRemoval)throw Error('This player is already removed. Reload the roster.');
   if(club._rev!==data.baseRev||cleanupDue(financial,team.id,player)!==data.expectedDue)throw Error('The roster or balance changed. Review the removal again.');
   const at=new Date().toISOString();
   player.withdrawn=true;
   player.rosterRemoval={actorId:context.userId,at,reason:data.reason,requestId:data.requestId};
   const {endRosterDevelopmentLink}=await import('../team-development/runtime.server');
   await endRosterDevelopmentLink(tx,{teamId:team.id,rosterPlayerId:player.id,actorId:context.userId});
   const detail=JSON.stringify({teamId:team.id,playerId:player.id,player:player.name,parentEmail:player.parents.map(p=>p.email),outstandingBalance:data.expectedDue,...player.rosterRemoval});
   club.audit.unshift({at,action:'roster-remove',detail});
   await tx`insert into club_audit(user_id,action,detail) values(${context.userId},'roster-remove',${detail})`;
   await recordAssignment(tx,{actor:context.userId,action:'remove',teamId:team.id,status:'removed',source:'office',rosterPlayerId:player.id,reason:data.reason});
   await tx`insert into audit_events(actor_id,action,target_table,target_id,after_state) values(${context.userId},'roster.remove','club_roster',${player.id},${JSON.stringify({teamId:team.id,reason:data.reason,removed:true})}::jsonb)`;
  });
  const result=await clubResponse(context.userId,me);if(!result.ok)throw Error('Club is not open.');return result;
 });
const mergeTarget=cleanupTarget.extend({survivorId:z.string().min(1).max(150)}).strict();
async function verifyMerge(tx:Sql,club:ClubRecord,data:z.infer<typeof mergeTarget>,financial:Awaited<ReturnType<typeof loadFinancialContextInTransaction>>) {
 const team=club.teams.find(t=>t.id===data.teamId),duplicate=team?.roster.find(p=>p.id===data.playerId),survivor=team?.roster.find(p=>p.id===data.survivorId);
 if(!team||!duplicate||!survivor)throw Error('Choose two players on the same team.');
 assertSafeRosterMerge(survivor,duplicate);
 if(financial.basis?.agreements.some(a=>a.originalPlayerId===duplicate.id)||financial.basis?.playerAliases.some(a=>a.playerId===duplicate.id))throw Error('The duplicate has an immutable financial identity. Separate financial review is required.');
 if(team.pitchLog.some(p=>p.playerId===duplicate.id)||Object.values(team.attendance).some(a=>Object.hasOwn(a,duplicate.id)))throw Error('The duplicate has activity history. Separate review is required.');
 const [links]=await tx<{linked:boolean}>`select exists(select 1 from recruiting_roster_links where roster_id=${duplicate.id} union all select 1 from team_dev_roster_links where roster_player_id=${duplicate.id} union all select 1 from person_player_links where player_id=${duplicate.id} union all select 1 from team_hub_family_messages where player_id=${duplicate.id} union all select 1 from team_hub_rsvps where player_id=${duplicate.id} union all select 1 from enrollment_cases where player_id=${duplicate.id} union all select 1 from team_collection_authorizations where player_id=${duplicate.id} union all select 1 from fundraising_players where roster_player_id=${duplicate.id} union all select 1 from commerce_orders where snapshot->'teamFee'->>'playerId'=${duplicate.id} union all select 1 from club_requests where payload->>'rosterPlayerId'=${duplicate.id}) as linked`;
 if(links.linked)throw Error('The duplicate has athlete, evaluation, account or communication links. Separate identity review is required; no histories were moved.');
 return {team,duplicate,survivor};
}
export const previewRosterMerge=createServerFn({method:'POST'}).middleware([authMiddleware]).validator(mergeTarget)
 .handler(async({context,data})=>{
  const me=await identity(context.userId);if(me.role!=='admin')throw Error('Front office only.');
  return withFinancialContext(await getSql(),context.userId,'owner',async(tx,financial)=>{
   const club=await readStoredClub(tx,true);if(!club)throw Error('Club is not open.');
   const {team,duplicate,survivor}=await verifyMerge(tx,club,data,financial);
   return {teamId:team.id,playerId:duplicate.id,survivorId:survivor.id,baseRev:club._rev,teamName:team.name,duplicateName:duplicate.name,survivorName:survivor.name,parentEmail:duplicate.parents.map(p=>p.email).join(', ')};
  });
 });
export const mergeRosterDuplicates=createServerFn({method:'POST'}).middleware([authMiddleware]).validator(mergeTarget.extend({baseRev:z.number().int().nonnegative(),reason:z.string().trim().min(1).max(1000),requestId:z.string().uuid(),confirmed:z.literal(true)}).strict())
 .handler(async({context,data})=>{
  const me=await identity(context.userId);if(me.role!=='admin')throw Error('Front office only.');
  await mutateStoredClub(await getSql(),context.userId,'owner',undefined,async(tx,club,financial)=>{
   const prior=club.teams.find(t=>t.id===data.teamId)?.roster.find(p=>p.id===data.playerId)?.rosterRemoval;
   if(prior?.requestId===data.requestId&&prior.canonicalPlayerId===data.survivorId)return;
   if(club._rev!==data.baseRev)throw Error('The roster changed. Review the merge again.');
   const {team,duplicate,survivor}=await verifyMerge(tx,club,data,financial),at=new Date().toISOString();
   duplicate.withdrawn=true;
   duplicate.rosterRemoval={actorId:context.userId,at,reason:data.reason,requestId:data.requestId,canonicalPlayerId:survivor.id};
   const detail=JSON.stringify({teamId:team.id,duplicateId:duplicate.id,survivorId:survivor.id,...duplicate.rosterRemoval});
   club.audit.unshift({at,action:'roster-merge',detail});
   await tx`insert into club_audit(user_id,action,detail) values(${context.userId},'roster-merge',${detail})`;
   await recordAssignment(tx,{actor:context.userId,action:'remove',teamId:team.id,status:'removed',source:'office',rosterPlayerId:duplicate.id,reason:`Merged duplicate into ${survivor.id}: ${data.reason}`});
   await tx`insert into audit_events(actor_id,action,target_table,target_id,after_state) values(${context.userId},'roster.merge','club_roster',${duplicate.id},${JSON.stringify({teamId:team.id,reason:data.reason,removed:true,canonicalPlayerId:survivor.id})}::jsonb)`;
  });
  const result=await clubResponse(context.userId,me);if(!result.ok)throw Error('Club is not open.');return result;
 });

export const reviewTeamInquiry=createServerFn({method:'POST'}).middleware([authMiddleware])
 .validator(inquiryRosterInput)
 .handler(async({context,data})=>{
  const me=await identity(context.userId);if(me.role!=='admin')throw new Error('Front office only.');
  return reviewTeamInquiryForOffice(await getSql(),context.userId,data);
 });
