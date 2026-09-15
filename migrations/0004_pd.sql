alter table profiles add column if not exists lesson_credits integer not null default 0;
alter table profiles add column if not exists remote_credits integer not null default 0;
alter table profiles add column if not exists plan_name text not null default '';
alter table profiles add column if not exists plan_price integer not null default 0;
