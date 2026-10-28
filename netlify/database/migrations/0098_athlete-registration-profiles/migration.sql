-- Generated from migrations/0098_athlete_registration_profiles.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0098_athlete_registration_profiles.sql') THEN
-- Additive private profile extension; no account permissions or existing identities change.
alter table club_athletes add column school_status text not null default '';
alter table club_athletes add column school text not null default '';
alter table club_athletes add column graduation_year integer;
alter table club_athletes add column education_confirmed_at timestamptz;
alter table club_athletes add column registration_revision integer not null default 0;
create table athlete_registration_profiles (
 request_id text primary key references club_requests(id),
 athlete_id text references club_athletes(id),
 submitted_by text,
 birth_date date not null,
 school_status text not null,
 school text not null,
 graduation_year integer,
 snapshot jsonb not null,
 claim_hash text,
 confirmed_at timestamptz not null default now()
);
create index athlete_registration_profiles_athlete on athlete_registration_profiles(athlete_id);
create table athlete_profile_changes (
 id text primary key, athlete_id text not null references club_athletes(id),
 actor_id text not null, fields text[] not null, reason text not null,
 created_at timestamptz not null default now()
);

-- Recompute only open work against its immutable, server-selected rule snapshot.
-- Historical facts and settled decisions stay untouched; every correction requires review.
create function flag_registration_birthdate_change() returns trigger language plpgsql as $$
declare registration record; cutoff date; age_years integer; division integer; explanation text;
begin
 if old.birth_date is distinct from new.birth_date then
  for registration in select r.id,p.snapshot from athlete_registration_profiles p join club_requests r on r.id=p.request_id
    where p.athlete_id=new.id and r.status not in ('accepted','declined','closed','resolved') loop
   cutoff:=null; division:=null;
   if registration.snapshot->'ruleset'->>'cutoff' is not null then
    cutoff:=(registration.snapshot->'ruleset'->>'cutoff')::date;
   end if;
   if new.birth_date is not null and cutoff is not null and new.birth_date<=cutoff then
    age_years:=extract(year from age(cutoff,new.birth_date));
    select min(value::integer) into division from jsonb_array_elements_text(registration.snapshot->'ruleset'->'divisions') where value::integer>=age_years;
   end if;
   explanation:=case when division is null then 'Birthdate changed. Needs review — eligibility not calculated.'
    else 'Birthdate changed. Recalculated base division '||division||'U using the original registration ruleset. Staff must review placement and any exceptions.' end;
   update club_requests set payload=payload||jsonb_build_object('birthMonthYear',coalesce(to_char(new.birth_date,'YYYY-MM'),''),'birthYear',coalesce(to_char(new.birth_date,'YYYY'),''),'suggestedDivision',case when division is null then '' else division||'U' end,'eligibilityStatus','Needs review','eligibilityExplanation',explanation),coordinator_revision=coordinator_revision+1 where id=registration.id;
  end loop;
 end if;
 return new;
end $$;
create trigger registration_birthdate_changed after update of birth_date on club_athletes for each row execute function flag_registration_birthdate_change();

create function bump_athlete_registration_revision() returns trigger language plpgsql as $$
begin
 if old.birth_date is distinct from new.birth_date and new.registration_revision=old.registration_revision then new.registration_revision:=old.registration_revision+1; end if;
 return new;
end $$;
create trigger athlete_registration_revision before update of birth_date on club_athletes for each row execute function bump_athlete_registration_revision();

-- Append-only review receipt, separate from eligibility calculation and team placement.
create table athlete_eligibility_reviews (
 id text primary key, request_id text not null references club_requests(id),
 actor_id text not null, decision text not null check(decision in ('approved','deferred')),
 reason text not null, rule_reference text not null, registration_revision integer not null,
 created_at timestamptz not null default now()
);

    INSERT INTO _migrations (name) VALUES ('0098_athlete_registration_profiles.sql');
  END IF;
END
$netlify_apply$;
