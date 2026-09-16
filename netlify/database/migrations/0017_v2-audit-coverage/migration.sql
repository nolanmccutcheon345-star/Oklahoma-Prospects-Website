-- Generated from migrations/0017_v2_audit_coverage.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0017_v2_audit_coverage.sql') THEN
create or replace function audit_summary(row_data jsonb) returns jsonb language sql immutable as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(row_data)
 where key in ('id','user_id','role','active','disabledAt','price','status','amount_cents',
 'total_cents','split_pct','profit_split','gross_cents','transfer_id','coach_ids','coach_id',
 'service_id','lane_ids','rev','revision','cancel_at_period_end','pause_requested_at',
 'revoked_at','remaining','quantity','minutes','athlete_id','household_id')
$$;
create trigger audit_change after insert or update or delete on club_athletes for each row execute function record_club_audit();
create trigger audit_change after insert or update or delete on club_staff_services for each row execute function record_club_audit();

insert into audit_events(actor_id,action,target_table,target_id,before_state,after_state)
 select 'migration','APPROVED_OWNER_GRANT','owner_grants',coalesce(user_id,md5(email)),null,
 jsonb_build_object('user_id',user_id,'role','admin','revoked_at',revoked_at) from owner_grants;

    INSERT INTO _migrations (name) VALUES ('0017_v2_audit_coverage.sql');
  END IF;
END
$netlify_apply$;
