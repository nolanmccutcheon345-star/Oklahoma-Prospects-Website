-- Capture role/scope at the event time without rewriting immutable historical entries.
alter table coordinator_audit add column actor_roles jsonb not null default '[]';
create function coordinator_audit_role_snapshot() returns trigger language plpgsql as $$
begin
 new.actor_roles := coalesce((select jsonb_agg(r.entry) from (
   select jsonb_build_object('role',p.role,'source','profile') as entry from profiles p where p.user_id=new.actor_id
   union all
   select jsonb_build_object('role','verified_owner','source','owner_grant') from owner_grants g join "user" u on u.id=g.user_id where g.user_id=new.actor_id and g.email=lower(trim(u.email)) and g.revoked_at is null and u."disabledAt" is null and u."emailVerified"=true
   union all
   select jsonb_build_object('role',g.role,'sport',g.sport,'status',g.status,'coverage',g.coverage,'teamIds',g.team_ids,'revision',g.revision) from coordinator_assignments g where g.user_id=new.actor_id and g.status<>'removed'
 ) r),'[]'::jsonb);
 return new;
end $$;
create trigger coordinator_audit_roles before insert on coordinator_audit for each row execute function coordinator_audit_role_snapshot();
create index coordinator_audit_action_time on coordinator_audit(action,created_at);
create index coordinator_audit_correlation on coordinator_audit(correlation_id);
create table coordinator_risk_alerts (
 id text primary key, code text not null, priority text not null check(priority in ('critical','review')),
 actor_id text not null default '', observed_count integer not null, window_hours integer not null,
 created_at timestamptz not null default now()
);
alter table coordinator_risk_alerts enable row level security;
revoke all on coordinator_risk_alerts from public;
create trigger immutable_coordinator_risk_alert before update or delete on coordinator_risk_alerts for each row execute function protect_club_audit();
create trigger immutable_coordinator_risk_truncate before truncate on coordinator_risk_alerts for each statement execute function protect_club_audit();
-- The established privileged activity log receives the same minimized context.
alter table audit_events add column actor_roles jsonb not null default '[]';
alter table audit_events add column correlation_id uuid;
create trigger staff_audit_roles before insert on audit_events for each row execute function coordinator_audit_role_snapshot();
create function staff_audit_request_context() returns trigger language plpgsql as $$
begin
 new.correlation_id := coalesce(new.correlation_id,nullif(current_setting('app.correlation_id',true),'')::uuid,gen_random_uuid());
 return new;
end $$;
create trigger staff_audit_correlation before insert on audit_events for each row execute function staff_audit_request_context();
create or replace function mirror_coordinator_audit() returns trigger language plpgsql as $$
begin
 insert into audit_events(actor_id,action,target_table,target_id,after_state,correlation_id)
 values(new.actor_id,new.action,'coordinator_activity',coalesce(new.target_id,''),jsonb_build_object('status',new.result,'sport',new.sport,'team_id',new.team_id),new.correlation_id);
 return new;
end $$;
