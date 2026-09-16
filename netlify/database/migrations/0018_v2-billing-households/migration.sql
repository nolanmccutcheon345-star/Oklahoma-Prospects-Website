-- Generated from migrations/0018_v2_billing_households.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0018_v2_billing_households.sql') THEN
-- Household sharing is attached to records, never all records owned by a member.
alter table club_athletes add column household_id text references club_households(id);
alter table commerce_orders add column household_id text references club_households(id);
alter table booking_records add column household_id text references club_households(id);
alter table club_subscriptions add column household_id text references club_households(id);
alter table credit_grants add column household_id text references club_households(id);
alter table billing_invoices add column household_id text references club_households(id);
create function canonical_household(address text) returns text language plpgsql as $$
declare result text;
begin
 if nullif(trim(address),'') is null then return null; end if;
 insert into club_households(id,primary_email) values('fam-'||gen_random_uuid()::text,lower(trim(address))) on conflict(primary_email) do nothing;
 select id into result from club_households where primary_email=lower(trim(address));
 return result;
end $$;
create function assign_billing_household() returns trigger language plpgsql as $$
declare source jsonb; result text; address text;
begin
 if NEW.household_id is not null then return NEW; end if;
 source:=to_jsonb(NEW);
 if TG_TABLE_NAME='club_athletes' then result:=canonical_household(source->>'household_email');
 elsif TG_TABLE_NAME='commerce_orders' then
  select household_id into result from club_athletes where id=source->>'athlete_id';
  result:=coalesce(result,canonical_household(source->>'email'));
 else
  if source->>'order_id' is not null then select household_id into result from commerce_orders where id=source->>'order_id'; end if;
  if result is null and source->>'subscription_id' is not null then select household_id into result from club_subscriptions where id=source->>'subscription_id'; end if;
  if result is null and source->>'athlete_id' is not null then select household_id into result from club_athletes where id=source->>'athlete_id'; end if;
  if result is null then select email into address from "user" where id=source->>'user_id'; result:=canonical_household(address); end if;
 end if;
 NEW.household_id:=result;
 return NEW;
end $$;
do $$ declare t text; begin
 foreach t in array array['club_athletes','commerce_orders','booking_records','club_subscriptions','credit_grants','billing_invoices'] loop
  execute format('create trigger assign_household before insert or update on %I for each row execute function assign_billing_household()',t);
  execute format('update %I set household_id=null where household_id is null',t);
  execute format('create index %I on %I(household_id)',t||'_household',t);
 end loop;
end $$;
insert into household_members(household_id,user_id)
 select h.id,u.id from club_households h join "user" u on lower(trim(u.email))=h.primary_email
 where u."emailVerified"=true on conflict do nothing;

    INSERT INTO _migrations (name) VALUES ('0018_v2_billing_households.sql');
  END IF;
END
$netlify_apply$;
