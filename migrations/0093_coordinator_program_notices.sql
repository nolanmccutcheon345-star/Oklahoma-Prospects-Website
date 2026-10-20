-- Transactional, recipient-specific event change outbox. No historical mail backfill.
create table coordinator_program_notices (
 id uuid primary key,actor_id text not null references "user"(id),recipient_id text not null references "user"(id),
 event_id text not null,session_key text not null,athlete_id text not null,team_id text not null,sport text not null,
 capability text not null check(capability in ('owner','events.assign')),email text not null,subject text not null,body text not null,source_digest text not null,dedupe_key text not null unique,
 status text not null default 'pending' check(status in ('pending','processing','sent','superseded','review')),
 attempts integer not null default 0,first_attempt_at timestamptz,next_attempt_at timestamptz not null default now(),lease_token text,lease_until timestamptz,
 request_body jsonb,provider_message_id text,accepted_at timestamptz,created_at timestamptz not null default now()
);
create index coordinator_program_notice_delivery on coordinator_program_notices(status,next_attempt_at);
alter table coordinator_program_notices enable row level security;
revoke all on coordinator_program_notices from public;
create function capture_program_notice_version() returns trigger language plpgsql as $$begin
 insert into coordinator_communication_versions(source,source_id,actor_id,sport,team_ids,body,subject,recipients,status) values('event',new.id::text,new.actor_id,new.sport,array[new.team_id],new.body,new.subject,jsonb_build_object('accountId',new.recipient_id,'email',new.email),new.status);return new;
end $$;
create trigger coordinator_program_notice_version after insert or update on coordinator_program_notices for each row execute function capture_program_notice_version();
create function protect_program_notice_content() returns trigger language plpgsql as $$begin
 if old.request_body is not null and old.request_body is distinct from new.request_body then raise exception 'Provider request is immutable';end if;
 if (to_jsonb(old)-array['status','attempts','first_attempt_at','next_attempt_at','lease_token','lease_until','provider_message_id','accepted_at','request_body']) is distinct from (to_jsonb(new)-array['status','attempts','first_attempt_at','next_attempt_at','lease_token','lease_until','provider_message_id','accepted_at','request_body']) then raise exception 'Event message content is immutable';end if;return new;
end $$;
create trigger immutable_program_notice_content before update on coordinator_program_notices for each row execute function protect_program_notice_content();
create trigger immutable_program_notice_delete before delete on coordinator_program_notices for each row execute function protect_club_audit();
create trigger immutable_program_notice_truncate before truncate on coordinator_program_notices for each statement execute function protect_club_audit();
