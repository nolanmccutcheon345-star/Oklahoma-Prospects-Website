-- Generated from migrations/0034_tryout_notice_delivery.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0034_tryout_notice_delivery.sql') THEN
alter table tryout_notification_outbox drop constraint tryout_notification_outbox_status_check;
alter table tryout_notification_outbox add constraint tryout_notification_outbox_status_check check(status in ('pending','processing','sent','superseded','review'));
alter table tryout_notification_outbox add column attempts integer not null default 0;
alter table tryout_notification_outbox add column first_attempt_at timestamptz;
alter table tryout_notification_outbox add column next_attempt_at timestamptz not null default now();
alter table tryout_notification_outbox add column lease_token text;
alter table tryout_notification_outbox add column lease_until timestamptz;
alter table tryout_notification_outbox add column request_body jsonb;
alter table tryout_notification_outbox add column provider_message_id text;
alter table tryout_notification_outbox add column accepted_at timestamptz;

    INSERT INTO _migrations (name) VALUES ('0034_tryout_notice_delivery.sql');
  END IF;
END
$netlify_apply$;
