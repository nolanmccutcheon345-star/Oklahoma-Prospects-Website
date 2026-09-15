create table if not exists "rateLimit" (
  id text primary key, key text not null unique, count integer not null,
  "lastRequest" bigint not null
);
alter table "rateLimit" enable row level security;
revoke all on "rateLimit" from public;
