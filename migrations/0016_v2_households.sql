-- Link only verified guardians explicitly recorded on the existing roster.
insert into household_members(household_id,user_id)
 select distinct p.value->>'familyId',u.id from club_state c
 cross join lateral jsonb_array_elements(c.payload->'teams') t
 cross join lateral jsonb_array_elements(t.value->'roster') p
 cross join lateral jsonb_array_elements(p.value->'parents') g
 join "user" u on lower(trim(u.email))=lower(trim(g.value->>'email')) and u."emailVerified"=true
 join club_households h on h.id=p.value->>'familyId'
 on conflict do nothing;
create trigger audit_change after insert or update or delete on household_members for each row execute function record_club_audit();
