-- Generated from migrations/0081_coordinator_scoped_transition.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0081_coordinator_scoped_transition.sql') THEN
alter table coordinator_drafts add column scoped_reset_at timestamptz;
-- No account is reset, activated, or granted permissions by this migration.
-- A current explicit owner reset is required before old isolated accounts can
-- use newly granted coordinator permissions. Financial restrictions remain sticky.
create function coordinator_scoped_reset_at(actor text) returns timestamptz language sql stable as $$
 select max(a.created_at) from organization_operational_access o join coordinator_audit a
 on a.target_id=o.user_id and a.action='staff.access-reset' and a.result='allowed'
 where o.user_id=actor and o.status='removed'
 and a.details->'before'->'legacy'->>'revision'=(o.revision-1)::text
$$;
create function coordinator_scoped_ready(actor text) returns boolean language sql stable as $$
 select not exists(select 1 from organization_operational_access o where o.user_id=actor and o.financial_restricted)
 or coordinator_scoped_reset_at(actor) is not null
$$;
revoke all on function coordinator_scoped_reset_at(text),coordinator_scoped_ready(text) from public;
-- Retire blanket authority for pending delivery as well as interactive requests.
-- No account, permission, message, or financial record is modified.
create or replace function coordinator_notice_allowed(actor text, request_key text, recipient text)
 returns boolean language sql stable as $$
 select exists(
  select 1 from "user" u join club_requests r on r.id=request_key
  where u.id=actor and u."disabledAt" is null and u."emailVerified"=true
  and r.kind in ('tryout','team-inquiry')
  and lower(r.payload->>'sport') in ('baseball','softball')
  and lower(trim(r.payload->>'email'))=recipient
  and (coalesce(r.payload->>'preferredTeamId','')='' or exists(
   select 1 from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t
   where c.id='oklahoma-prospects' and not c.demo
   and t->>'id'=r.payload->>'preferredTeamId' and t->>'sport'=lower(r.payload->>'sport')
   and coalesce(t->>'closed','false')<>'true'
  ))
  and case when exists(select 1 from organization_operational_access o where o.user_id=actor and o.financial_restricted)
   then coordinator_scoped_ready(actor) and exists(select 1 from coordinator_assignments g where g.user_id=actor and g.status='active' and g.sport=lower(r.payload->>'sport') and 'communications.recruit.send'=any(g.permissions) and 'contacts.read'=any(g.permissions) and (g.coverage='sport' or coalesce(r.payload->>'preferredTeamId','')=any(g.team_ids)))
   else exists(select 1 from coordinator_assignments g where g.user_id=actor
    and g.status='active' and g.sport=lower(r.payload->>'sport')
    and 'communications.recruit.send'=any(g.permissions) and 'contacts.read'=any(g.permissions)
    and (g.coverage='sport' or coalesce(r.payload->>'preferredTeamId','')=any(g.team_ids)))
    or exists(select 1 from owner_grants g join profiles p on p.user_id=g.user_id
     where g.user_id=actor and g.email=lower(trim(u.email)) and g.revoked_at is null and p.role='admin')
   end
 )
$$;
revoke all on function coordinator_notice_allowed(text,text,text) from public;

    INSERT INTO _migrations (name) VALUES ('0081_coordinator_scoped_transition.sql');
  END IF;
END
$netlify_apply$;
