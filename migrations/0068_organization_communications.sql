-- Additive only. Existing drafts remain unclassified; no role/account grants are seeded.
-- Classification is bound to an exact revision so a legacy edit cannot make mixed
-- historical text visible through the operational workspace.
alter table coordinator_drafts add column content_classification text not null default 'unclassified'
 check(content_classification in ('unclassified','operational'));
alter table coordinator_drafts add column classified_revision integer
 check(classified_revision is null or classified_revision > 0);

-- Recheck authority and the current, confirmed recipient before every queued send.
-- A restricted account never falls back to a legacy grant after suspension/removal.
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
   then exists(select 1 from organization_operational_access o where o.user_id=actor and o.financial_restricted and o.status='active')
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
