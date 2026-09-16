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
