-- New versions preserve previously assigned instruction snapshots.
create table pd_curriculum_versions (
 id text primary key, parent_id text references pd_curriculum_versions(id),
 author_id text not null references "user"(id), document jsonb not null,
 status text not null default 'draft' check(status in ('draft','approved','retired')),
 reviewed_by text references "user"(id), review_note text, created_at timestamptz not null default now()
);
alter table pd_curriculum_versions enable row level security;
revoke all on pd_curriculum_versions from public;
create trigger audit_change after insert or update or delete on pd_curriculum_versions for each row execute function record_club_audit();
