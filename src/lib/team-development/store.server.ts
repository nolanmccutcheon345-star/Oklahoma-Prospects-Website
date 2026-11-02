import { createHash } from "node:crypto";
import { getSql, type Sql } from "../db";
import { expandAgeBands, normalizeSeedRecord, normalizeCeilingRefs } from "./seed-normalize";
import { assertNamedHuman, isWindmillBlocked, TEAM_DEV_WINDMILL_MESSAGE, TEAM_DEV_WINDMILL_REASON } from "./gates";
import type { NormalizedTeamDevSeedRecord, TeamDevAgeBand, TeamDevSeedRecord } from "./contracts";

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
async function event(sql:Sql,input:{actorId:string;entityType:string;entityId:string;action:string;before?:unknown;after?:unknown;metadata?:unknown}) {
  await sql`
    insert into team_dev_events(actor_id,entity_type,entity_id,action,before_json,after_json,metadata)
    values(${input.actorId},${input.entityType},${input.entityId},${input.action},
      ${input.before===undefined?null:JSON.stringify(input.before)}::jsonb,
      ${input.after===undefined?null:JSON.stringify(input.after)}::jsonb,
      ${JSON.stringify(input.metadata||{})}::jsonb)
  `;
}
function scalar(value: unknown, fallback="") {
  return typeof value === "string" ? value : fallback;
}
function first(value: unknown, fallback="") {
  return Array.isArray(value) ? scalar(value[0],fallback) : scalar(value,fallback);
}

type SeedImportResult={imported:number;inserted:number;updated:number;unchanged:number;rejected:{id:string;reason:string}[]};

/** SCHEMA-00 defaults apply to every record in the batch; record fields win. */
export function applySeedDefaults(records:TeamDevSeedRecord[]):TeamDevSeedRecord[] {
  const schema=records.find(r=>r?.id==="SCHEMA-00");
  const defaults=(schema as {defaults?:Record<string,unknown>}|undefined)?.defaults;
  if(!defaults||typeof defaults!=="object")return records;
  return records.map(r=>{
    if(!r||r.id==="SCHEMA-00"||String(r.id||"").startsWith("MAP-"))return r;
    const merged:Record<string,unknown>={...defaults};
    for(const [k,v] of Object.entries(r))if(v!==undefined)merged[k]=v;
    return merged as TeamDevSeedRecord;
  });
}

const LOCKED="Version is past DRAFT and is immutable; publish a new version number instead.";

/**
 * Idempotent seed import. Every record lands as DRAFT + ESTIMATE; nothing becomes
 * assignable. Re-running the same seed changes nothing and writes no events.
 * Records whose stored version has left DRAFT are never overwritten.
 */
export async function importTeamDevelopmentSeedAs(sql:Sql,actorId:string,rawRecords:TeamDevSeedRecord[]):Promise<SeedImportResult> {
  const normalized:NormalizedTeamDevSeedRecord[]=[];
  const rejected:{id:string;reason:string}[]=[];
  for(const raw of applySeedDefaults(rawRecords)){
    try{normalized.push(normalizeSeedRecord(raw));}
    catch(error){rejected.push({id:raw?.id||"(missing)",reason:error instanceof Error?error.message:"Invalid record"});}
  }
  let inserted=0,updated=0,unchanged=0;
  await sql.transaction(async tx=>{
    await tx`select set_config('app.actor_id',${actorId},true)`;
    for(const row of normalized){
      const table=scalar(row.table);
      const payload=JSON.stringify(row);
      let outcome:"inserted"|"updated"|"unchanged"|"locked";
      if(table==="program"||table==="routine"){
        const windmill=isWindmillBlocked(row.id,row as Record<string,unknown>)?TEAM_DEV_WINDMILL_REASON:null;
        const [existing]=await tx<{status:string;same:boolean}>`
          select status,(payload=${payload}::jsonb) as same from team_dev_program_versions
          where program_id=${row.id} and version=${row.version}
        `;
        outcome=!existing?"inserted":existing.same?"unchanged":existing.status!=="DRAFT"?"locked":"updated";
        if(outcome==="inserted"||outcome==="updated")await tx`
          insert into team_dev_programs(id,name,sport,category,current_version)
          values(${row.id},${scalar(row.name,row.id)},${scalar(row.sport,"both")},${scalar(row.category,"program")},${row.version})
          on conflict(id) do update set
            name=excluded.name,sport=excluded.sport,category=excluded.category,
            current_version=greatest(team_dev_programs.current_version,excluded.current_version),
            updated_at=now()
        `;
        if(outcome==="inserted")await tx`
          insert into team_dev_program_versions(program_id,version,status,data_label,payload,snapshot_hash,blocked_fields,created_by,non_assignable_reason)
          values(${row.id},${row.version},'DRAFT','ESTIMATE',${payload}::jsonb,${hash(row)},${JSON.stringify(row.blocked_fields)}::jsonb,${actorId},${windmill})
        `;
        if(outcome==="updated")await tx`
          update team_dev_program_versions set payload=${payload}::jsonb,snapshot_hash=${hash(row)},
            blocked_fields=${JSON.stringify(row.blocked_fields)}::jsonb,non_assignable_reason=${windmill},data_label='ESTIMATE'
          where program_id=${row.id} and version=${row.version} and status='DRAFT'
        `;
      } else if(table==="exercise"||table==="drill"){
        const [existing]=table==="exercise"
          ? await tx<{status:string;same:boolean}>`select status,(payload=${payload}::jsonb) as same from team_dev_exercises where id=${row.id} and version=${row.version}`
          : await tx<{status:string;same:boolean}>`select status,(payload=${payload}::jsonb) as same from team_dev_drills where id=${row.id} and version=${row.version}`;
        outcome=!existing?"inserted":existing.same?"unchanged":existing.status!=="DRAFT"?"locked":"updated";
        if(outcome==="inserted"||outcome==="updated"){
          if(table==="exercise")await tx`
            insert into team_dev_exercises(id,version,status,data_label,name,category,payload,pd_catalog_ref)
            values(${row.id},${row.version},'DRAFT','ESTIMATE',${scalar(row.name,row.id)},${scalar(row.category,"exercise")},${payload}::jsonb,${first(row.pd_catalog_ref)||null})
            on conflict(id,version) do update set
              data_label='ESTIMATE',name=excluded.name,category=excluded.category,
              payload=excluded.payload,pd_catalog_ref=excluded.pd_catalog_ref
            where team_dev_exercises.status='DRAFT'
          `;
          else await tx`
            insert into team_dev_drills(id,version,status,data_label,name,sport,category,payload,pd_catalog_ref)
            values(${row.id},${row.version},'DRAFT','ESTIMATE',${scalar(row.name,row.id)},${scalar(row.sport,"both")},${scalar(row.category,"skill")},${payload}::jsonb,${first(row.pd_catalog_ref)||null})
            on conflict(id,version) do update set
              data_label='ESTIMATE',name=excluded.name,sport=excluded.sport,category=excluded.category,
              payload=excluded.payload,pd_catalog_ref=excluded.pd_catalog_ref
            where team_dev_drills.status='DRAFT'
          `;
        }
      } else if(table==="config"||table==="meta"||row.id.startsWith("MAP-")||row.id==="SCHEMA-00"){
        const [existing]=await tx<{same:boolean}>`select (payload=${payload}::jsonb) as same from team_dev_config_items where id=${row.id} and version=${row.version}`;
        outcome=!existing?"inserted":existing.same?"unchanged":"updated";
        if(outcome!=="unchanged")await tx`
          insert into team_dev_config_items(id,version,kind,label,active,payload,data_label,updated_by)
          values(${row.id},${row.version},${row.id.startsWith("MAP-")?"mapping":row.id==="SCHEMA-00"?"schema":scalar(row.category,"config")},${scalar(row.name,row.id)},true,${payload}::jsonb,'ESTIMATE',${actorId})
          on conflict(id,version) do update set
            label=excluded.label,payload=excluded.payload,data_label='ESTIMATE',updated_by=excluded.updated_by,updated_at=now()
        `;
      } else {
        rejected.push({id:row.id,reason:"Unsupported seed table: "+(table||"(missing)")});
        continue;
      }
      if(outcome==="locked"){rejected.push({id:row.id,reason:LOCKED});continue;}
      if(outcome==="unchanged"){unchanged++;continue;}
      if(outcome==="inserted")inserted++;else updated++;
      await event(tx,{actorId,entityType:"seed",entityId:row.id+"@"+row.version,action:outcome==="inserted"?"seed_import":"seed_update",after:{status:"DRAFT",data_label:"ESTIMATE",blocked_fields:row.blocked_fields}});
    }
  });
  return {imported:inserted+updated,inserted,updated,unchanged,rejected};
}

async function requireAdmin(sql:Sql,userId:string){
  const {resolveIdentity}=await import("../identity.server");
  const me=await resolveIdentity(sql,userId);
  if(me.role!=="admin")throw new Error("Front office only.");
}

export async function importTeamDevelopmentSeed(userId:string,rawRecords:TeamDevSeedRecord[]) {
  const sql=await getSql();
  await requireAdmin(sql,userId);
  return importTeamDevelopmentSeedAs(sql,userId,rawRecords);
}

async function approvedCeilings(sql:Sql, refs:string[]) {
  // Until an audited P04 library exists every item counts as throwing, so a
  // template with no ceiling reference is never assignable.
  if(!refs.length)return false;
  const rows=await sql<{id:string}>`
    select id from team_dev_age_band_ceilings
    where id=any(${refs}::text[]) and value_status='APPROVED' and approved_by is not null
  `;
  return rows.length===refs.length;
}

export async function assertProgramAssignable(
  sql:Sql,
  programId:string,
  version:number,
  ageBand:TeamDevAgeBand,
) {
  const [row]=await sql<{status:string;blocked_fields:unknown;payload:TeamDevSeedRecord;non_assignable_reason:string|null}>`
    select status,blocked_fields,payload,non_assignable_reason from team_dev_program_versions
    where program_id=${programId} and version=${version}
  `;
  if(isWindmillBlocked(programId,row?.payload as Record<string,unknown>)||row?.non_assignable_reason===TEAM_DEV_WINDMILL_REASON)
    throw new Error(TEAM_DEV_WINDMILL_MESSAGE);
  if(!row||row.status!=="ACTIVE")throw new Error("Only ACTIVE team-development templates are assignable.");
  if(row.non_assignable_reason)throw new Error("This template is marked non-assignable.");
  const blocked=Array.isArray(row.blocked_fields)?row.blocked_fields:[];
  if(blocked.length)throw new Error("This template still has blocked fields.");
  const refs=normalizeCeilingRefs(row.payload.ceiling_ref,ageBand);
  if(!(await approvedCeilings(sql,refs)))throw new Error("An APPROVED age-band ceiling is required before assignment.");
  return row;
}

const NEXT_REVIEW:Record<string,{to:string;column?:"sports_science"|"safety"}>={
  DRAFT:{to:"SPORTS_SCIENCE_REVIEW"},
  SPORTS_SCIENCE_REVIEW:{to:"SAFETY_REVIEW",column:"sports_science"},
  SAFETY_REVIEW:{to:"APPROVED",column:"safety"},
};

/**
 * Review workflow: DRAFT -> SPORTS_SCIENCE_REVIEW -> SAFETY_REVIEW -> APPROVED.
 * Leaving each review stage records the named human reviewer. Windmill and any
 * version with blocked fields cannot leave DRAFT. Admin only; every step is logged.
 */
export async function advanceProgramVersionReview(
  userId:string,
  input:{programId:string;version:number;reviewerName?:string},
) {
  const sql=await getSql();
  await requireAdmin(sql,userId);
  return sql.transaction(async tx=>{
    await tx`select set_config('app.actor_id',${userId},true)`;
    const [current]=await tx<{status:string;blocked_fields:unknown;payload:TeamDevSeedRecord;non_assignable_reason:string|null;sports_science_reviewed_by:string|null}>`
      select status,blocked_fields,payload,non_assignable_reason,sports_science_reviewed_by from team_dev_program_versions
      where program_id=${input.programId} and version=${input.version} for update
    `;
    if(!current)throw new Error("Template version not found.");
    if(isWindmillBlocked(input.programId,current.payload as Record<string,unknown>)||current.non_assignable_reason)
      throw new Error(TEAM_DEV_WINDMILL_MESSAGE);
    const blocked=Array.isArray(current.blocked_fields)?current.blocked_fields:[];
    if(blocked.length)throw new Error("Blocked fields must be replaced in a new version before review.");
    const step=NEXT_REVIEW[current.status];
    if(!step)throw new Error("No review step from "+current.status+".");
    let reviewer:string|null=null;
    if(step.column){
      reviewer=assertNamedHuman(input.reviewerName,step.column==="safety"?"Safety reviewer":"Sports-science reviewer");
      if(step.column==="sports_science")await tx`
        update team_dev_program_versions set status=${step.to},sports_science_reviewed_by=${reviewer},sports_science_reviewed_at=now()
        where program_id=${input.programId} and version=${input.version}
      `;
      else await tx`
        update team_dev_program_versions set status=${step.to},safety_reviewed_by=${reviewer},safety_reviewed_at=now()
        where program_id=${input.programId} and version=${input.version}
      `;
    } else await tx`
      update team_dev_program_versions set status=${step.to} where program_id=${input.programId} and version=${input.version}
    `;
    await event(tx,{actorId:userId,entityType:"program_version",entityId:input.programId+"@"+input.version,action:"review_advance",before:{status:current.status},after:{status:step.to,reviewer}});
    return {ok:true as const,status:step.to};
  });
}

export async function activateProgramVersion(
  userId:string,
  input:{programId:string;version:number;humanSigner:string},
) {
  const sql=await getSql();
  await requireAdmin(sql,userId);
  const signer=assertNamedHuman(input.humanSigner,"Named human expert sign-off");
  return sql.transaction(async tx=>{
    await tx`select set_config('app.actor_id',${userId},true)`;
    const [current]=await tx<{status:string;blocked_fields:unknown;payload:TeamDevSeedRecord;non_assignable_reason:string|null;sports_science_reviewed_by:string|null;safety_reviewed_by:string|null}>`
      select status,blocked_fields,payload,non_assignable_reason,sports_science_reviewed_by,safety_reviewed_by from team_dev_program_versions
      where program_id=${input.programId} and version=${input.version} for update
    `;
    if(!current)throw new Error("Template version not found.");
    if(isWindmillBlocked(input.programId,current.payload as Record<string,unknown>)||current.non_assignable_reason)
      throw new Error(TEAM_DEV_WINDMILL_MESSAGE);
    if(!current.sports_science_reviewed_by||!current.safety_reviewed_by)
      throw new Error("Sports-science and safety reviews must both be recorded before activation.");
    if(current.status!=="APPROVED")throw new Error("Template must reach APPROVED before activation.");
    const blocked=Array.isArray(current.blocked_fields)?current.blocked_fields:[];
    if(blocked.length)throw new Error("Blocked fields must be cleared before activation.");
    const ageBands=expandAgeBands(current.payload.age_band);
    const refs=[...new Set(ageBands.flatMap(b=>normalizeCeilingRefs(current.payload.ceiling_ref,b)))];
    if(!(await approvedCeilings(tx,refs)))throw new Error("All required age-band ceilings must be APPROVED before activation.");
    await tx`
      update team_dev_program_versions
      set status='ACTIVE',approved_by=${signer},approved_at=now()
      where program_id=${input.programId} and version=${input.version}
    `;
    await event(tx,{actorId:userId,entityType:"program_version",entityId:input.programId+"@"+input.version,action:"activate",before:{status:current.status},after:{status:"ACTIVE",approved_by:signer}});
    return {ok:true as const};
  });
}
