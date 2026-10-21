-- Add explicit capabilities without granting them to any account.
alter table coordinator_assignments drop constraint coordinator_assignments_permissions_check;
alter table coordinator_assignments add constraint coordinator_assignments_permissions_check check(permissions <@ array['recruiting.read','recruiting.create','recruiting.update','recruiting.status','recruiting.followups','tryouts.attendance','communications.delivery.read','recruiting.notes','contacts.read','rosters.read','rosters.number','rosters.positions','rosters.transfer.request','events.read','practices.create','practices.update','events.cancel.request','cages.read','cages.reserve','cages.update','cages.release','communications.read','communications.team.send','communications.recruit.send','content.draft','content.update','content.submit','reports.read','activity.read']::text[]);
-- Internal reminders must not restore legacy recipient access after revocation.
create function coordinator_recipient_allowed(recipient text, request_key text) returns boolean language sql stable as $$
 select exists(select 1 from "user" where id=recipient and "disabledAt" is null and "emailVerified"=true) and (
 not exists(select 1 from coordinator_assignments where user_id=recipient)
   and not exists(select 1 from organization_operational_access where user_id=recipient and financial_restricted)
 or not exists(select 1 from organization_operational_access where user_id=recipient and financial_restricted)
 and exists(select 1 from owner_grants g join staff_authorities a on a.email=g.email join "user" u on u.id=g.user_id where g.user_id=recipient and g.email=lower(trim(u.email)) and g.revoked_at is null and a.capability='staff_roles.manage')
 or coordinator_scoped_ready(recipient) and exists(
   select 1 from "user" u join coordinator_assignments g on g.user_id=u.id
   join club_requests r on r.id=request_key and r.kind in ('tryout','team-inquiry')
   where u.id=recipient and u."disabledAt" is null and u."emailVerified"=true
   and g.status='active' and 'recruiting.read'=any(g.permissions)
   and g.sport=lower(r.payload->>'sport')
   and (g.coverage='sport' or coalesce(r.payload->>'preferredTeamId','')=any(g.team_ids))
   and (coalesce(r.payload->>'preferredTeamId','')='' or exists(select 1 from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t where c.id='oklahoma-prospects' and not c.demo and t->>'id'=r.payload->>'preferredTeamId' and t->>'sport'=g.sport and coalesce(t->>'closed','false')<>'true'))
 ))
$$;
revoke all on function coordinator_recipient_allowed(text,text) from public;
