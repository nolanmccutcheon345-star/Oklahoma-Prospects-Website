import {randomUUID,createHash} from 'node:crypto';
import {getSql} from './db';
import {clubIdentity} from './identity.server';
import {isOwnerEmail} from './owners';

/** Acceptance requires this exact verified email. No administrator sets a password. */
export async function issueInvitation(actor:string,email:string,role:string,familyId:string|null=null) {
 const me=await clubIdentity(actor);const normalized=email.trim().toLowerCase();
 if(role==='admin'&&!await isOwnerEmail(normalized))throw new Error('Owner grants are limited to the approved owners.');
 const sql=await getSql();
 if(me.role!=='admin') {
  if(role!=='parent'||!familyId)throw new Error('Owner access required.');
  const members=await sql`select 1 from household_members where household_id=${familyId} and user_id=${actor}`;
  if(!members.length||me.role!=='parent')throw new Error('Household access required.');
 }
 const id=randomUUID(),hash=createHash('sha256').update(randomUUID()).digest('hex');
 await sql.transaction(async tx=>{
  await tx`update club_invites set status='revoked' where lower(email)=${normalized} and role=${role} and family_id is not distinct from ${familyId} and status='pending'`;
  await tx`insert into club_invites(id,token_hash,email,family_id,invited_by,role,expires_at) values(${id},${hash},${normalized},${familyId},${actor},${role},now()+interval '7 days')`;
 });
 return {id,path:'/invitations',message:'Invitation saved. Ask the recipient to sign in with this exact email and open Invitations within seven days.'};
}
export async function pendingInvitations(userId:string) {
 const me=await clubIdentity(userId);const sql=await getSql();
 return sql<{id:string;role:string;family_id:string|null;expires_at:Date}>`select id,role,family_id,expires_at from club_invites where lower(email)=${me.email} and status='pending' and expires_at>now()`;
}
export async function acceptInvitation(userId:string,id:string) {
 const me=await clubIdentity(userId);const sql=await getSql();
 return sql.transaction(async tx=>{
  const [invite]=await tx<{role:string;family_id:string|null}>`select role,family_id from club_invites where id=${id} and lower(email)=${me.email} and status='pending' and expires_at>now() for update`;
  if(!invite)throw new Error('This invitation is unavailable. Sign in with the invited, verified email.');
  if(!['admin','coach','parent','player'].includes(invite.role))throw new Error('Invalid invitation role.');
  if(invite.role==='admin') {
   const grants=await tx`select email from owner_grants where email=${me.email} and revoked_at is null and (user_id is null or user_id=${userId})`;
   if(!grants.length)throw new Error('This account has no approved owner grant.');
  }
  // A guardian invitation adds household access without demoting a coach or owner.
  const role=invite.family_id?me.role:invite.role;
  await tx`insert into profiles(user_id,name,email,role,family_id) values(${userId},${me.name},${me.email},${role},${invite.family_id||me.familyId}) on conflict(user_id) do update set role=excluded.role`;
  if(invite.family_id)await tx`insert into household_members(household_id,user_id) values(${invite.family_id},${userId}) on conflict do nothing`;
  if(role==='coach')await tx`update club_staff set user_id=${userId} where lower(email)=${me.email}`;
  await tx`update club_invites set status='accepted',accepted_by=${userId} where id=${id}`;
  return {ok:true};
 });
}

export async function myHouseholds(userId:string) {
 const me=await clubIdentity(userId);const sql=await getSql();
 const rows=await sql<{id:string;primary_email:string;user_id:string;name:string;email:string}>`select h.id,h.primary_email,u.id as user_id,u.name,u.email
  from club_households h join household_members m on m.household_id=h.id join "user" u on u.id=m.user_id
  where h.id=any(${me.familyIds}::text[]) order by h.id,u.name`;
 return {canInvite:me.role==='parent'||me.role==='admin',userId,rows};
}
