create table office_request_work (
 request_id text primary key references club_requests(id),
 assignee_id text references "user"(id),
 follow_up text not null default 'new' check(follow_up in ('new','contacted','scheduled','closed')),
 updated_at timestamptz not null default now()
);
create table office_request_notes (
 id text primary key,
 request_id text not null references club_requests(id),
 actor_id text not null references "user"(id),
 note text not null,
 created_at timestamptz not null default now()
);
create table tryout_evaluation_reviews (
 evaluation_id text primary key references tryout_evaluations(id),
 revision integer not null,
 reviewer_id text not null references "user"(id),
 reviewed_at timestamptz not null default now()
);
create index office_request_notes_request on office_request_notes(request_id,created_at);
alter table office_request_work enable row level security;
alter table office_request_notes enable row level security;
alter table tryout_evaluation_reviews enable row level security;
revoke all on office_request_work,office_request_notes,tryout_evaluation_reviews from public;
create trigger audit_change after insert or update or delete on office_request_work for each row execute function record_club_audit();
create trigger audit_change after insert or update or delete on office_request_notes for each row execute function record_club_audit();
create trigger audit_change after insert or update or delete on tryout_evaluation_reviews for each row execute function record_club_audit();
