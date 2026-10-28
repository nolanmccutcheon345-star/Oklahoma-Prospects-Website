-- Additive only: existing lessons and bookings are deliberately not rewritten.
alter table club_services add column lesson_version integer not null default 1;
create function bump_lesson_service_version() returns trigger language plpgsql as $$
begin
 if (to_jsonb(new)-'lesson_version') is distinct from (to_jsonb(old)-'lesson_version') then new.lesson_version=old.lesson_version+1; end if;
 return new;
end $$;
create trigger lesson_service_version before update on club_services for each row execute function bump_lesson_service_version();
alter table booking_records add column lesson_sport text check(lesson_sport in ('baseball','softball'));
alter table booking_records add column lesson_config jsonb;
create function snapshot_booked_lesson() returns trigger language plpgsql as $$
declare service jsonb; sport text;
begin
 select to_jsonb(s) into service from club_services s where s.id=new.product_id and s.kind='lesson';
 if service is not null and new.lesson_config is null then
   select coalesce(new.lesson_sport, case when case when jsonb_typeof(a.profile->'sports')='array' then jsonb_array_length(a.profile->'sports') else 0 end<=1 then a.profile->>'sport' end) into sport from club_athletes a where a.id=new.athlete_id;
   new.lesson_config=jsonb_build_object('service',service,'sport',sport,'source','booking-created','capturedAt',now());
 end if;
 return new;
end $$;
create trigger snapshot_booked_lesson before insert on booking_records for each row execute function snapshot_booked_lesson();
create table guided_lesson_sessions (
 id text primary key,
 booking_id text not null unique references booking_records(id),
 athlete_id text not null references club_athletes(id),
 instructor_id text not null,
 status text not null default 'draft' check(status in ('draft','published')),
 revision integer not null default 1,
 snapshot jsonb not null,
 document jsonb not null,
 created_by text not null,
 updated_by text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 published_at timestamptz
);
create index guided_lesson_athlete_history on guided_lesson_sessions(athlete_id,published_at desc);
alter table guided_lesson_sessions enable row level security;
revoke all on guided_lesson_sessions from public;
create trigger audit_change after insert or update or delete on guided_lesson_sessions for each row execute function record_club_audit();
