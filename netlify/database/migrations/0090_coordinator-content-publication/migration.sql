-- Generated from migrations/0090_coordinator_content_publication.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0090_coordinator_content_publication.sql') THEN
-- Independent draft capabilities. No grants or public content are created.
alter table coordinator_assignments drop constraint coordinator_assignments_permissions_check;
alter table coordinator_assignments add constraint coordinator_assignments_permissions_check check(permissions <@ array['recruiting.read','tryouts.read','tryouts.create','tryouts.update','events.review.request','tryouts.status','recruiting.create','recruiting.update','recruiting.status','recruiting.followups','tryouts.attendance','communications.delivery.read','recruiting.notes','contacts.read','rosters.read','rosters.add','rosters.information','rosters.number','rosters.positions','rosters.transfer.request','camps.create','camps.update','clinics.create','clinics.update','events.assign','events.attendance','events.read','practices.create','practices.update','events.cancel.request','cages.read','cages.reserve','cages.update','cages.release','communications.read','communications.team.send','communications.recruit.send','content.read','content.recruiting.draft','content.tryout.draft','content.team.draft','content.draft','content.update','content.submit','reports.read','reports.recruiting','reports.tryouts','reports.openings','reports.attendance','reports.events','reports.followups','teams.openings','teams.needs','teams.statistics','activity.read']::text[]);


alter table coordinator_drafts add column content_kind text not null default 'announcement' check(content_kind in ('announcement','recruiting','tryout','team'));
create table coordinator_draft_versions (
 draft_id uuid not null references coordinator_drafts(id), revision integer not null,
 title text not null,body text not null,content_kind text not null,status text not null,
 actor_id text,created_at timestamptz not null default now(),primary key(draft_id,revision)
);
create function capture_coordinator_draft_version() returns trigger language plpgsql as $$begin
 insert into coordinator_draft_versions(draft_id,revision,title,body,content_kind,status,actor_id) values(new.id,new.revision,new.title,new.body,new.content_kind,new.status,coalesce(nullif(current_setting('app.actor_id',true),''),new.last_editor_id,new.user_id)) on conflict do nothing;
 return new;
end $$;
create trigger coordinator_draft_version after insert or update on coordinator_drafts for each row execute function capture_coordinator_draft_version();
alter table coordinator_draft_versions enable row level security;
revoke all on coordinator_draft_versions from public;
create trigger immutable_coordinator_draft_versions before update or delete on coordinator_draft_versions for each row execute function protect_club_audit();
create trigger immutable_coordinator_draft_versions_truncate before truncate on coordinator_draft_versions for each statement execute function protect_club_audit();
create table coordinator_public_posts (
 id uuid primary key, draft_id uuid not null references coordinator_drafts(id), source_revision integer not null,
 sport text not null check(sport in ('baseball','softball')), team_id text not null default '',
 title text not null,body text not null,content_kind text not null,
 published_by text not null references "user"(id), published_at timestamptz not null default now(),
 visible boolean not null default true, revision integer not null default 1,
 unique(draft_id,source_revision)
);
alter table coordinator_public_posts enable row level security;
revoke all on coordinator_public_posts from public;
create function protect_coordinator_public_snapshot() returns trigger language plpgsql as $$begin
 if TG_OP='DELETE' then raise exception 'Publication snapshots cannot be deleted';end if;
 if (to_jsonb(old)-'visible'-'revision') is distinct from (to_jsonb(new)-'visible'-'revision') then raise exception 'Publication snapshots are immutable';end if;
 return new;
end $$;
create trigger immutable_coordinator_public_snapshot before update or delete on coordinator_public_posts for each row execute function protect_coordinator_public_snapshot();
create trigger immutable_coordinator_public_snapshot_truncate before truncate on coordinator_public_posts for each statement execute function protect_club_audit();

    INSERT INTO _migrations (name) VALUES ('0090_coordinator_content_publication.sql');
  END IF;
END
$netlify_apply$;
