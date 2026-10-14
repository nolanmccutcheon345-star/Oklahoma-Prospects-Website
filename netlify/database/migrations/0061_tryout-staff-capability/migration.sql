-- Generated from migrations/0061_tryout_staff_capability.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0061_tryout_staff_capability.sql') THEN
-- Preserve migration 0060 already applied to the PR preview; append capability correction.
-- Preserve the existing separate team-coach capability for approved dual-role accounts.
create function is_tryout_staff(account_id text, account_email text) returns boolean language sql stable as $$
 with active_teams as (
  select t from club_state c cross join lateral jsonb_array_elements(coalesce(c.payload->'teams','[]'::jsonb)) t
  where c.id='oklahoma-prospects' and not c.demo and coalesce(t->>'closed','false')<>'true'
 ), team_emails as (
  select lower(trim(t->>'coachEmail')) as email from active_teams
  union all
  select lower(trim(member->>'email')) as email from active_teams cross join lateral jsonb_array_elements(coalesce(t->'staff','[]'::jsonb)) member
 )
 select exists(
  select 1 from club_staff s where s.active
  and lower(trim(s.email))=lower(trim(account_email)) and (s.user_id='' or s.user_id=account_id)
  and (s.role in ('coach','admin') or exists(select 1 from team_emails where email=lower(trim(account_email))))
 );
$$;
revoke all on function is_tryout_staff(text,text) from public;
create or replace function notify_tryout_coaches() returns trigger language plpgsql as $$
begin
 if new.kind not in ('tryout','team-inquiry') then return new; end if;
 insert into tryout_center_notices(id,request_id,recipient_id,email,subject,body,dedupe_key,status)
 select 'registration:'||new.id||':'||u.id,new.id,u.id,lower(trim(u.email)),
 'New tryout registration',
 'Player: '||coalesce(new.payload->>'player','')||'. A new '||coalesce(new.payload->>'sport','')||' '||coalesce(new.payload->>'age','')||' registration is ready for review. Open the secure Tryouts & Evaluations center: https://prospectssports.club/registrations',
 'registration:'||new.id||':'||u.id,case when coalesce(p.email_enabled,true) then 'pending' else 'skipped' end
 from "user" u left join tryout_center_preferences p on p.user_id=u.id
 where u."disabledAt" is null and u."emailVerified"=true

 and (exists(select 1 from owner_grants g where g.user_id=u.id and g.email=lower(trim(u.email)) and g.revoked_at is null)
 or is_tryout_staff(u.id,u.email)
 or exists(select 1 from registration_readers r where r.user_id=u.id and r.email=lower(trim(u.email)) and r.active and r.can_manage_tryouts))
 and (coalesce(cardinality(p.sports),0)=0 or lower(new.payload->>'sport')=any(p.sports))
 and (coalesce(cardinality(p.ages),0)=0 or new.payload->>'age'=any(p.ages))
 and (coalesce(cardinality(p.team_ids),0)=0 or coalesce(new.payload->>'preferredTeamId','')=any(p.team_ids))
 on conflict(dedupe_key) do nothing;
 return new;
end $$;

    INSERT INTO _migrations (name) VALUES ('0061_tryout_staff_capability.sql');
  END IF;
END
$netlify_apply$;
