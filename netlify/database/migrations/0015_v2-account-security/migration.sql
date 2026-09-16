-- Generated from migrations/0015_v2_account_security.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0015_v2_account_security.sql') THEN
alter table "user" add column "twoFactorEnabled" boolean not null default false;
create table "twoFactor" (
 id text primary key, secret text not null, "backupCodes" text not null,
 "userId" text not null references "user"(id), verified boolean default true,
 "failedVerificationCount" integer default 0, "lockedUntil" timestamptz
);
create index two_factor_user on "twoFactor"("userId");
create index two_factor_secret on "twoFactor"(secret);
alter table "twoFactor" enable row level security;
revoke all on "twoFactor" from public;

    INSERT INTO _migrations (name) VALUES ('0015_v2_account_security.sql');
  END IF;
END
$netlify_apply$;
