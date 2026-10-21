-- Owner-approved identity/photo publication; no account receives permissions.
alter table coordinator_assignments drop constraint coordinator_assignments_permissions_check;
alter table coordinator_assignments add constraint coordinator_assignments_permissions_check check(permissions <@ array['recruiting.read','tryouts.read','tryouts.create','tryouts.update','events.review.request','tryouts.status','recruiting.create','recruiting.update','recruiting.status','recruiting.followups','tryouts.attendance','communications.delivery.read','recruiting.notes','contacts.read','rosters.read','rosters.publication.request','photos.publication.request','rosters.add','rosters.information','rosters.number','rosters.positions','rosters.transfer.request','camps.create','camps.update','clinics.create','clinics.update','events.assign','events.attendance','events.read','practices.create','practices.update','events.cancel.request','cages.read','cages.reserve','cages.update','cages.release','communications.read','communications.team.send','communications.recruit.send','recruiting.invite','communications.inquiry.reply','communications.announcement.schedule','communications.tryout.remind','communications.practice.remind','communications.event.notify','communications.program.request','content.read','content.recruiting.draft','content.tryout.draft','content.team.draft','content.draft','content.update','content.submit','reports.read','reports.recruiting','reports.tryouts','reports.openings','reports.attendance','reports.events','reports.followups','teams.openings','teams.needs','teams.statistics','activity.read']::text[]);
alter table coordinator_approvals drop constraint coordinator_approvals_kind_check;
alter table coordinator_approvals add constraint coordinator_approvals_kind_check check(kind in ('transfer','cancel-event','content','tryout-change','program-change','communication','roster-publication','photo-publication'));
create table coordinator_publication_controls (
 kind text not null check(kind in ('roster','photo')),target_id text not null,team_id text not null,
 visible boolean not null default false,revision integer not null default 1,source_digest text not null default '',
 reviewer_id text references "user"(id),approval_id uuid references coordinator_approvals(id),updated_at timestamptz not null default now(),primary key(kind,target_id)
);
create table coordinator_publication_versions (
 id bigserial primary key,kind text not null,target_id text not null,team_id text not null,visible boolean not null,revision integer not null,
 source_digest text not null,reviewer_id text,approval_id uuid,recorded_at timestamptz not null default now()
);
create function capture_coordinator_publication() returns trigger language plpgsql as $$begin
 insert into coordinator_publication_versions(kind,target_id,team_id,visible,revision,source_digest,reviewer_id,approval_id) values(new.kind,new.target_id,new.team_id,new.visible,new.revision,new.source_digest,new.reviewer_id,new.approval_id);return new;
end $$;
create trigger coordinator_publication_version after insert or update on coordinator_publication_controls for each row execute function capture_coordinator_publication();
create trigger immutable_coordinator_publication_versions before update or delete on coordinator_publication_versions for each row execute function protect_club_audit();
create trigger immutable_coordinator_publication_versions_truncate before truncate on coordinator_publication_versions for each statement execute function protect_club_audit();
create trigger immutable_coordinator_publication_controls_delete before delete on coordinator_publication_controls for each row execute function protect_club_audit();
create trigger immutable_coordinator_publication_controls_truncate before truncate on coordinator_publication_controls for each statement execute function protect_club_audit();
alter table coordinator_publication_controls enable row level security;
alter table coordinator_publication_versions enable row level security;
revoke all on coordinator_publication_controls,coordinator_publication_versions from public;
-- Admissions made by the scoped system never inherit public consent or publication approval.
insert into coordinator_publication_controls(kind,target_id,team_id) select 'roster',roster_id,team_id from coordinator_roster_clearances where status='used' and roster_id is not null on conflict do nothing;
insert into coordinator_publication_controls(kind,target_id,team_id) select 'photo',athlete_id,team_id from coordinator_roster_clearances where status='used' on conflict do nothing;
