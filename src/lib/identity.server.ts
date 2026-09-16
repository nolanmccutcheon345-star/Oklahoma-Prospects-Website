import {getSql} from './db';
import type {ClubRole} from './club-data';

export async function clubIdentity(userId:string) {
 const sql=await getSql();
 const [user]=await sql.query<{id:string;email:string;name:string;emailVerified:boolean;disabledAt:Date|null}>('select id,email,name,"emailVerified","disabledAt" from "user" where id=$1',[userId]);
 if(!user || user.disabledAt)throw new Error('Unauthorized');
 if(!user.emailVerified)throw new Error('Verify your email before opening your household records.');
 const email=user.email.trim().toLowerCase();
 // A migration authorizes exactly two owner emails. Claim once, only after verification.
 await sql.transaction(async tx=>{
  const claimed=await tx.query('update owner_grants set user_id=$1 where email=$2 and user_id is null and revoked_at is null returning email',[userId,email]);
  if(claimed.length)await tx.query("insert into profiles(user_id,name,email,role,family_id) values($1,$2,$3,'admin',$4) on conflict(user_id) do update set role='admin'",[userId,user.name,email,'fam-'+userId]);
 });
 const [profile]=await sql.query<{role:string;family_id:string;player_name:string;name:string}>('select role,family_id,player_name,name from profiles where user_id=$1',[userId]);
 let role:ClubRole=profile?.role==='coach'||profile?.role==='player'?profile.role:'parent';
 if(profile?.role==='admin'){
  const grants=await sql.query('select email from owner_grants where user_id=$1 and email=$2 and revoked_at is null',[userId,email]);
  if(grants.length)role='admin';
 }
 return {userId,email,name:profile?.name||user.name,role,familyId:profile?.family_id||'fam-'+userId,playerName:profile?.player_name||''};
}
