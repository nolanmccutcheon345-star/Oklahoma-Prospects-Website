import { createHash } from "node:crypto";
import { getSql, type Sql } from "../db";
import { expandAgeBands, normalizeSeedRecord, normalizeCeilingRefs } from "./seed-normalize";
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

export async function importTeamDevelopmentSeed(
  userId:string,
  rawRecords:TeamDevSeedRecord[],
) {
  const sql=await getSql();
  const {resolveIdentity}=await import("../identity.server");
  const me=await resolveIdentity(sql,userId);
  if(me.role!=="admin")throw new Error("Front office only.");
  const normalized:NormalizedTeamDevSeedRecord[]=[];
  const rejected:{id:string;reason:string}[]=[];
  for(const raw of rawRecords){
    try{normalized.push(normalizeSeedRecord(raw));}
    catch(error){rejected.push({id:raw?.id||"(missing)",reason:error instanceof Error?error.message:"Invalid record"});}
  }
  let imported=0;
  await sql.transaction(async tx=>{
    await tx`select set_config('app.actor_id',${userId},true)`;
    for(const row of normalized){
      const table=scalar(row.table);
      if(table==="program"||table==="routine"){
        await tx`
          insert into team_dev_programs(id,name,sport,category,current_version)
          values(${row.id},${scalar(row.name,row.id)},${scalar(row.sport,"both")},${scalar(row.category,"program")},${row.version})
          on conflict(id) do update set
            name=excluded.name,sport=excluded.sport,category=excluded.category,
            current_version=greatest(team_dev_programs.current_version,excluded.current_version),
            updated_at=now()
        `;
        await tx`
          insert into team_dev_program_versions(program_id,version,status,data_label,payload,snapshot_hash,blocked_fields,created_by)
          values(${row.id},${row.version},'DRAFT','ESTIMATE',${JSON.stringify(row)}::jsonb,${hash(row)},${JSON.stringify(row.blocked_fields)}::jsonb,${userId})
          on conflict(program_id,version) do update set
            payload=excluded.payload,snapshot_hash=excluded.snapshot_hash,
            blocked_fields=excluded.blocked_fields,status='DRAFT',data_label='ESTIMATE'
        `;
      } else if(table==="exercise"){
        await tx`
          insert into team_dev_exercises(id,version,status,data_label,name,category,payload,pd_catalog_ref)
          values(${row.id},${row.version},'DRAFT','ESTIMATE',${scalar(row.name,row.id)},${scalar(row.category,"exercise")},${JSON.stringify(row)}::jsonb,${first(row.pd_catalog_ref)||null})
          on conflict(id,version) do update set
            status='DRAFT',data_label='ESTIMATE',name=excluded.name,category=excluded.category,
            payload=excluded.payload,pd_catalog_ref=excluded.pd_catalog_ref
        `;
      } else if(table==="drill"){
        await tx`
          insert into team_dev_drills(id,version,status,data_label,name,sport,category,payload,pd_catalog_ref)
          values(${row.id},${row.version},'DRAFT','ESTIMATE',${scalar(row.name,row.id)},${scalar(row.sport,"both")},${scalar(row.category,"skill")},${JSON.stringify(row)}::jsonb,${first(row.pd_catalog_ref)||null})
          on conflict(id,version) do update set
            status='DRAFT',data_label='ESTIMATE',name=excluded.name,sport=excluded.sport,category=excluded.category,
            payload=excluded.payload,pd_catalog_ref=excluded.pd_catalog_ref
        `;
      } else if(table==="config"||row.id.startsWith("MAP-")||row.id==="SCHEMA-00"){
        await tx`
          insert into team_dev_config_items(id,version,kind,label,active,payload,data_label,updated_by)
          values(${row.id},${row.version},${row.id.startsWith("MAP-")?"mapping":row.id==="SCHEMA-00"?"schema":scalar(row.category,"config")},${scalar(row.name,row.id)},true,${JSON.stringify(row)}::jsonb,'ESTIMATE',${userId})
          on conflict(id,version) do update set
            label=excluded.label,payload=excluded.payload,data_label='ESTIMATE',updated_by=excluded.updated_by,updated_at=now()
        `;
      } else {
        rejected.push({id:row.id,reason:"Unsupported seed table: "+(table||"(missing)")});
        continue;
      }
      imported++;
      await event(tx,{actorId:userId,entityType:"seed",entityId:row.id+"@"+row.version,action:"seed_import",after:{status:"DRAFT",data_label:"ESTIMATE",blocked_fields:row.blocked_fields}});
    }
  });
  return {imported,rejected};
}

async function approvedCeilings(sql:Sql, refs:string[]) {
  if(!refs.length)return true;
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
  const [row]=await sql<{status:string;blocked_fields:unknown;payload:TeamDevSeedRecord}>`
    select status,blocked_fields,payload from team_dev_program_versions
    where program_id=${programId} and version=${version}
  `;
  if(!row||row.status!=="ACTIVE")throw new Error("Only ACTIVE team-development templates are assignable.");
  const blocked=Array.isArray(row.blocked_fields)?row.blocked_fields:[];
  if(blocked.length)throw new Error("This template still has blocked fields.");
  const refs=normalizeCeilingRefs(row.payload.ceiling_ref,ageBand);
  if(!(await approvedCeilings(sql,refs)))throw new Error("An APPROVED age-band ceiling is required before assignment.");
  return row;
}

export async function activateProgramVersion(
  userId:string,
  input:{programId:string;version:number;humanSigner:string},
) {
  const sql=await getSql();
  const {resolveIdentity}=await import("../identity.server");
  const me=await resolveIdentity(sql,userId);
  if(me.role!=="admin")throw new Error("Front office only.");
  if(!input.humanSigner.trim())throw new Error("Named human expert sign-off is required.");
  return sql.transaction(async tx=>{
    const [current]=await tx<{status:string;blocked_fields:unknown;payload:TeamDevSeedRecord}>`
      select status,blocked_fields,payload from team_dev_program_versions
      where program_id=${input.programId} and version=${input.version} for update
    `;
    if(!current)throw new Error("Template version not found.");
    if(current.status!=="APPROVED")throw new Error("Template must reach APPROVED before activation.");
    const blocked=Array.isArray(current.blocked_fields)?current.blocked_fields:[];
    if(blocked.length)throw new Error("Blocked fields must be cleared before activation.");
    const ageBands=expandAgeBands(current.payload.age_band);
    const refs=[...new Set(ageBands.flatMap(b=>normalizeCeilingRefs(current.payload.ceiling_ref,b)))];
    if(!(await approvedCeilings(tx,refs)))throw new Error("All required age-band ceilings must be APPROVED before activation.");
    await tx`
      update team_dev_program_versions
      set status='ACTIVE',approved_by=${input.humanSigner.trim()},approved_at=now()
      where program_id=${input.programId} and version=${input.version}
    `;
    await event(tx,{actorId:userId,entityType:"program_version",entityId:input.programId+"@"+input.version,action:"activate",before:{status:current.status},after:{status:"ACTIVE",approved_by:input.humanSigner.trim()}});
    return {ok:true as const};
  });
}
