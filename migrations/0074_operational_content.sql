-- Revision-bound classification of existing operational narratives. No publication or consent grants.
alter table coordinator_drafts add column last_editor_id text references "user"(id);
create table operational_content_classifications (
 kind text not null check(kind in ('recruiting-profile','recruiting-metric','pd-document')),
 target_id text not null,
 source_revision integer not null check(source_revision>=0),
 source_digest text not null check(length(source_digest)=64),
 classified_by text not null references "user"(id),
 reason text not null,
 classified_at timestamptz not null default now(),
 primary key(kind,target_id)
);
alter table operational_content_classifications enable row level security;
revoke all on operational_content_classifications from public;
