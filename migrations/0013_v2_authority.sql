-- Approved owner grants are server data; verification is required before claiming.
create table owner_grants (
 email text primary key check(email = lower(trim(email))),
 user_id text unique, revoked_at timestamptz, created_at timestamptz not null default now()
);
insert into owner_grants(email) values
 ('stevemccutcheon89@gmail.com'),('nolanmccutcheon@icloud.com');
alter table "user" add column "disabledAt" timestamptz;
-- Remove the previous implicit third-owner grant without changing legitimate coach grants.
update profiles set role='parent' where role='admin' and lower(trim(email)) not in(select email from owner_grants);
insert into profiles(user_id,name,email,role,family_id)
 select u.id,u.name,lower(trim(u.email)),'admin','fam-'||u.id from "user" u
 join owner_grants g on g.email=lower(trim(u.email)) where u."emailVerified"=true
 on conflict(user_id) do update set role='admin';
update owner_grants g set user_id=u.id from "user" u where g.email=lower(trim(u.email)) and u."emailVerified"=true;

create table club_households(
 id text primary key, primary_email text unique not null, created_at timestamptz not null default now()
);
create table household_members(
 household_id text not null references club_households(id), user_id text not null references "user"(id),
 created_at timestamptz not null default now(), primary key(household_id,user_id)
);
-- Split legacy truncated-email identifiers using the actual recorded primary guardian.
-- Each player without a guardian email receives a distinct household; no records are deleted.
do $$ declare c record; team jsonb; player jsonb; teams jsonb; roster jsonb; address text; hid text;
begin
 for c in select id,payload from club_state loop
  teams := '[]'::jsonb;
  for team in select value from jsonb_array_elements(c.payload->'teams') loop
   roster := '[]'::jsonb;
   for player in select value from jsonb_array_elements(team->'roster') loop
    address := lower(trim(coalesce(player->'parents'->0->>'email','')));
    if address = '' then address := 'unlinked:' || gen_random_uuid()::text; end if;
    insert into club_households(id,primary_email) values('fam-'||gen_random_uuid()::text,address)
      on conflict(primary_email) do nothing;
    select id into hid from club_households where primary_email=address;
    player := jsonb_set(player,'{familyId}',to_jsonb(hid));
    roster := roster || jsonb_build_array(player);
   end loop;
   teams := teams || jsonb_build_array(jsonb_set(team,'{roster}',roster));
  end loop;
  update club_state set payload=jsonb_set(payload,'{teams}',teams),rev=rev+1 where id=c.id;
 end loop;
end $$;
insert into household_members(household_id,user_id)
 select h.id,u.id from club_households h join "user" u on lower(trim(u.email))=h.primary_email
 where u."emailVerified"=true on conflict do nothing;

create table audit_events(
 id bigint generated always as identity primary key, actor_id text not null,
 action text not null, target_table text not null, target_id text not null,
 before_state jsonb, after_state jsonb, created_at timestamptz not null default now()
);
create function audit_summary(row_data jsonb) returns jsonb language sql immutable as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(row_data)
 where key in ('id','user_id','role','active','disabledAt','price','status','amount_cents',
 'total_cents','split_pct','gross_cents','transfer_id','coach_ids','rev','revision','cancel_at_period_end','pause_requested_at')
$$;
create function record_club_audit() returns trigger language plpgsql as $$
declare previous jsonb; current_row jsonb; subject jsonb;
begin
 previous := case when TG_OP='INSERT' then null else to_jsonb(OLD) end;
 current_row := case when TG_OP='DELETE' then null else to_jsonb(NEW) end;
 subject := coalesce(current_row,previous);
 insert into audit_events(actor_id,action,target_table,target_id,before_state,after_state)
 values(coalesce(nullif(current_setting('app.actor_id',true),''),'system'),TG_OP,TG_TABLE_NAME,
 coalesce(subject->>'id',subject->>'user_id',subject->>'booking_id','record'),audit_summary(previous),audit_summary(current_row));
 return coalesce(NEW,OLD);
end $$;
create function protect_club_audit() returns trigger language plpgsql as $$
begin raise exception 'Audit events are append-only'; end $$;
create trigger immutable_audit before update or delete on audit_events for each row execute function protect_club_audit();
do $$ declare t text; begin
 foreach t in array array['profiles','club_services','club_staff','club_state','pd_working_file',
 'user','booking_records','commerce_orders','club_requests','credit_grants','club_waivers','club_invites','commerce_refunds','contractor_earnings','club_subscriptions','owner_grants'] loop
  execute format('create trigger audit_change after insert or update or delete on %I for each row execute function record_club_audit()',t);
 end loop;
 foreach t in array array['owner_grants','club_households','household_members','audit_events'] loop
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on %I from public',t);
 end loop;
end $$;
