-- Generated from migrations/0091_coordinator_communications.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0091_coordinator_communications.sql') THEN
-- Explicit communication capabilities only; no account grants or messages are seeded.
alter table coordinator_assignments drop constraint coordinator_assignments_permissions_check;
alter table coordinator_assignments add constraint coordinator_assignments_permissions_check check(permissions <@ array['recruiting.read','tryouts.read','tryouts.create','tryouts.update','events.review.request','tryouts.status','recruiting.create','recruiting.update','recruiting.status','recruiting.followups','tryouts.attendance','communications.delivery.read','recruiting.notes','contacts.read','rosters.read','rosters.add','rosters.information','rosters.number','rosters.positions','rosters.transfer.request','camps.create','camps.update','clinics.create','clinics.update','events.assign','events.attendance','events.read','practices.create','practices.update','events.cancel.request','cages.read','cages.reserve','cages.update','cages.release','communications.read','communications.team.send','communications.recruit.send','recruiting.invite','communications.inquiry.reply','communications.announcement.schedule','communications.tryout.remind','communications.practice.remind','communications.event.notify','communications.program.request','content.read','content.recruiting.draft','content.tryout.draft','content.team.draft','content.draft','content.update','content.submit','reports.read','reports.recruiting','reports.tryouts','reports.openings','reports.attendance','reports.events','reports.followups','teams.openings','teams.needs','teams.statistics','activity.read']::text[]);

alter table coordinator_approvals drop constraint coordinator_approvals_kind_check;
alter table coordinator_approvals add constraint coordinator_approvals_kind_check check(kind in ('transfer','cancel-event','content','tryout-change','program-change','communication'));
create table coordinator_team_notices (
 id uuid primary key, actor_id text not null references "user"(id),sport text not null check(sport in ('baseball','softball')),
 team_ids text[] not null,kind text not null,proposal jsonb not null,preview_digest text not null,
 recipients jsonb not null,send_at timestamptz not null,status text not null check(status in ('pending-review','queued','sent','blocked','cancelled')),
 revision integer not null default 1,reviewer_id text references "user"(id),created_at timestamptz not null default now(),sent_at timestamptz
);
create table coordinator_notice_messages (message_id uuid primary key references team_chat_messages(id),notice_id uuid not null references coordinator_team_notices(id),recipient_ids text[] not null,source_digest text not null);
create table coordinator_message_reviews (message_id uuid primary key references team_chat_messages(id),source_digest text not null,operational boolean not null,reviewer_id text not null references "user"(id),reviewed_at timestamptz not null default now());
create function coordinator_message_digest(m team_chat_messages) returns text language sql immutable as $$select encode(sha256(convert_to(jsonb_build_array(m.id,m.team_id,m.user_id,m.author,m.body)::text,'UTF8')),'hex')$$;
create table coordinator_communication_versions (id bigserial primary key,source text not null,source_id text not null,actor_id text,sport text,team_ids text[],body text not null,subject text not null default '',recipients jsonb not null,status text not null,recorded_at timestamptz not null default now());
alter table tryout_center_notices add column coordinator_permission text not null default 'communications.recruit.send' check(coordinator_permission in ('communications.recruit.send','recruiting.invite','communications.inquiry.reply','communications.tryout.remind'));
create function coordinator_typed_notice_allowed(actor text,request_key text,recipient text,capability text) returns boolean language sql stable as $$
 select case when capability='communications.recruit.send' then coordinator_notice_allowed(actor,request_key,recipient) else exists(
 select 1 from "user" u join club_requests r on r.id=request_key join coordinator_assignments g on g.user_id=u.id
 where u.id=actor and u."emailVerified" and u."disabledAt" is null and coordinator_scoped_ready(actor)
 and r.kind in ('tryout','team-inquiry') and (capability<>'communications.inquiry.reply' or r.kind='team-inquiry') and (capability<>'communications.tryout.remind' or r.kind='tryout')
 and lower(trim(r.payload->>'email'))=recipient and g.status='active' and g.sport=lower(r.payload->>'sport') and capability=any(g.permissions) and 'contacts.read'=any(g.permissions)
 and capability in ('recruiting.invite','communications.inquiry.reply','communications.tryout.remind')
 and (g.coverage='sport' or coalesce(r.payload->>'preferredTeamId','')=any(g.team_ids))
 and (coalesce(r.payload->>'preferredTeamId','')='' or exists(select 1 from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t where c.id='oklahoma-prospects' and not c.demo and t->>'id'=r.payload->>'preferredTeamId' and t->>'sport'=g.sport and coalesce(t->>'closed','false')<>'true'))
 ) end
$$;
create function capture_coordinator_communication() returns trigger language plpgsql as $$declare r club_requests;begin
 if TG_TABLE_NAME='coordinator_team_notices' then
 insert into coordinator_communication_versions(source,source_id,actor_id,sport,team_ids,body,recipients,status) values('team',new.id::text,new.actor_id,new.sport,new.team_ids,new.proposal->>'body',new.recipients,new.status);
 elsif new.coordinator_actor_id is not null then
 select * into r from club_requests where id=new.request_id;
 insert into coordinator_communication_versions(source,source_id,actor_id,sport,team_ids,body,subject,recipients,status) values('email',new.id,new.coordinator_actor_id,lower(r.payload->>'sport'),array[coalesce(r.payload->>'preferredTeamId','')],new.body,new.subject,jsonb_build_object('email',new.email,'requestId',new.request_id),new.status);
 end if;return new;
end $$;
create trigger coordinator_team_notice_version after insert or update on coordinator_team_notices for each row execute function capture_coordinator_communication();
create trigger coordinator_email_version after insert or update on tryout_center_notices for each row execute function capture_coordinator_communication();
alter table coordinator_team_notices enable row level security;
alter table coordinator_notice_messages enable row level security;
alter table coordinator_message_reviews enable row level security;
alter table coordinator_communication_versions enable row level security;
revoke all on coordinator_team_notices,coordinator_notice_messages,coordinator_message_reviews,coordinator_communication_versions from public;
revoke all on function coordinator_typed_notice_allowed(text,text,text,text),coordinator_message_digest(team_chat_messages) from public;
create trigger immutable_coordinator_communications before update or delete on coordinator_communication_versions for each row execute function protect_club_audit();
create trigger immutable_coordinator_communications_truncate before truncate on coordinator_communication_versions for each statement execute function protect_club_audit();

create function protect_coordinator_notice_proposal() returns trigger language plpgsql as $$begin
 if TG_OP='DELETE' then raise exception 'Communication history cannot be deleted';end if;
 if (to_jsonb(old)-'status'-'revision'-'reviewer_id'-'sent_at') is distinct from (to_jsonb(new)-'status'-'revision'-'reviewer_id'-'sent_at') then raise exception 'Queued message proposals are immutable';end if;return new;
end $$;
create trigger immutable_coordinator_notice_proposal before update or delete on coordinator_team_notices for each row execute function protect_coordinator_notice_proposal();
create trigger immutable_coordinator_notices_truncate before truncate on coordinator_team_notices for each statement execute function protect_club_audit();
create trigger immutable_coordinator_notice_messages before update or delete on coordinator_notice_messages for each row execute function protect_club_audit();
create trigger immutable_coordinator_notice_messages_truncate before truncate on coordinator_notice_messages for each statement execute function protect_club_audit();

    INSERT INTO _migrations (name) VALUES ('0091_coordinator_communications.sql');
  END IF;
END
$netlify_apply$;
