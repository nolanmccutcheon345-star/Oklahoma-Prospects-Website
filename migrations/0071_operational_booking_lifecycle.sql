-- Unpriced operational event identity; source events retain their commercial payloads.
CREATE TABLE operational_event_records (
 id text PRIMARY KEY, training_event_id text UNIQUE REFERENCES training_events(id),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 created_by text REFERENCES "user"(id),creation_digest text,
 name text,description text,event_type text,sport text,location text,
 capacity integer CHECK(capacity BETWEEN 1 AND 1000),coach_ids jsonb CHECK(jsonb_typeof(coach_ids)='array'),
 publication text CHECK(publication IN ('draft','open','closed','archived')),
 updated_by text REFERENCES "user"(id),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(training_event_id IS NOT NULL OR (name IS NOT NULL AND description IS NOT NULL AND event_type IS NOT NULL AND sport IS NOT NULL AND location IS NOT NULL AND capacity IS NOT NULL AND coach_ids IS NOT NULL AND publication IS NOT NULL))
);
INSERT INTO operational_event_records(id,training_event_id) SELECT id,id FROM training_events;
CREATE FUNCTION initialize_operational_event_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO operational_event_records(id,training_event_id) VALUES(NEW.id,NEW.id) ON CONFLICT DO NOTHING;RETURN NEW; END $$;
CREATE TRIGGER initialize_operational_event_identity AFTER INSERT ON training_events FOR EACH ROW EXECUTE FUNCTION initialize_operational_event_identity();
CREATE TABLE operational_booking_changes (
 booking_id text PRIMARY KEY REFERENCES booking_records(id),
 revision integer NOT NULL CHECK(revision>0),
 starts_at timestamptz,ends_at timestamptz,resources jsonb CHECK(jsonb_typeof(resources)='array'),
 status text CHECK(status IN ('confirmed','cancelled')),checked_in_at timestamptz,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 1000),updated_by text REFERENCES "user"(id),
 source_kind text NOT NULL CHECK(source_kind IN ('operator','event-session')),source_key text,updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((starts_at IS NULL AND ends_at IS NULL) OR (starts_at IS NOT NULL AND ends_at>starts_at AND mod(extract(epoch FROM starts_at)::numeric,300)=0 AND mod(extract(epoch FROM ends_at)::numeric,300)=0)),
 CHECK(source_kind<>'operator' OR updated_by IS NOT NULL)
);
CREATE TABLE operational_event_sessions (
 event_id text NOT NULL REFERENCES operational_event_records(id),session_key text NOT NULL,is_additional boolean NOT NULL DEFAULT false,
 original_date text NOT NULL,original_start text NOT NULL,original_end text NOT NULL,
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 location text NOT NULL CHECK(length(trim(location)) BETWEEN 3 AND 300),status text NOT NULL CHECK(status IN ('confirmed','cancelled')),
 revision integer NOT NULL CHECK(revision>0),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 1000),
 updated_by text NOT NULL REFERENCES "user"(id),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_id,session_key),UNIQUE(event_id,original_date,original_start,original_end),
 CHECK(mod(extract(epoch FROM starts_at)::numeric,300)=0 AND mod(extract(epoch FROM ends_at)::numeric,300)=0)
);
CREATE FUNCTION protect_operational_session_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.session_key IS DISTINCT FROM OLD.session_key OR NEW.original_date IS DISTINCT FROM OLD.original_date OR NEW.original_start IS DISTINCT FROM OLD.original_start OR NEW.original_end IS DISTINCT FROM OLD.original_end OR NEW.is_additional IS DISTINCT FROM OLD.is_additional THEN RAISE EXCEPTION 'Purchased session identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_operational_session_identity BEFORE UPDATE ON operational_event_sessions FOR EACH ROW EXECUTE FUNCTION protect_operational_session_identity();
CREATE TABLE operational_event_enrollments (
 id text PRIMARY KEY,event_id text NOT NULL REFERENCES operational_event_records(id),session_key text NOT NULL,
 athlete_id text NOT NULL REFERENCES club_athletes(id),booking_id text NOT NULL UNIQUE REFERENCES booking_records(id),
 status text NOT NULL CHECK(status IN ('active','cancelled')),revision integer NOT NULL CHECK(revision>0),
 updated_by text NOT NULL REFERENCES "user"(id),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,session_key,athlete_id)
);
CREATE TABLE operational_booking_history(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,entity text NOT NULL,entity_key text NOT NULL,before_state jsonb,after_state jsonb,actor_id text,recorded_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION audit_operational_booking_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO operational_booking_history(entity,entity_key,before_state,after_state,actor_id)
 VALUES(TG_TABLE_NAME,coalesce(to_jsonb(NEW)->>'booking_id',to_jsonb(NEW)->>'session_key',to_jsonb(OLD)->>'booking_id',to_jsonb(OLD)->>'session_key',to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id'),CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,nullif(current_setting('app.actor_id',true),''));
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER audit_operational_booking_change AFTER INSERT OR UPDATE OR DELETE ON operational_booking_changes FOR EACH ROW EXECUTE FUNCTION audit_operational_booking_change();
CREATE TRIGGER audit_operational_event_session AFTER INSERT OR UPDATE OR DELETE ON operational_event_sessions FOR EACH ROW EXECUTE FUNCTION audit_operational_booking_change();
CREATE TRIGGER audit_operational_event_record AFTER INSERT OR UPDATE OR DELETE ON operational_event_records FOR EACH ROW EXECUTE FUNCTION audit_operational_booking_change();
CREATE TRIGGER audit_operational_event_enrollment AFTER INSERT OR UPDATE OR DELETE ON operational_event_enrollments FOR EACH ROW EXECUTE FUNCTION audit_operational_booking_change();
CREATE TRIGGER immutable_operational_booking_history BEFORE UPDATE OR DELETE ON operational_booking_history FOR EACH ROW EXECUTE FUNCTION protect_financial_basis_history();
-- Scheduling projection only. Financial queries deliberately keep booking_records.
DO $$ DECLARE fields text; BEGIN
 SELECT string_agg(CASE a.attname
 WHEN 'starts_at' THEN 'coalesce(o.starts_at,b.starts_at) AS starts_at'
 WHEN 'ends_at' THEN 'coalesce(o.ends_at,b.ends_at) AS ends_at'
 WHEN 'status' THEN 'CASE WHEN b.status IN (''confirmed'',''completed'') THEN CASE WHEN o.status=''cancelled'' THEN ''cancelled'' ELSE b.status END ELSE b.status END AS status'
 WHEN 'resources' THEN 'coalesce(o.resources,b.resources) AS resources'
 WHEN 'checked_in_at' THEN 'coalesce(o.checked_in_at,b.checked_in_at) AS checked_in_at'
 ELSE format('b.%I',a.attname) END,',' ORDER BY a.attnum) INTO fields FROM pg_attribute a WHERE a.attrelid='booking_records'::regclass AND a.attnum>0 AND NOT a.attisdropped;
 EXECUTE 'CREATE VIEW operational_booking_schedule AS SELECT '||fields||',coalesce(o.revision,0) AS operational_revision FROM booking_records b LEFT JOIN operational_booking_changes o ON o.booking_id=b.id';
END $$;
ALTER TABLE operational_booking_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_event_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_booking_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_event_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_event_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON operational_booking_changes,operational_event_sessions,operational_booking_history,operational_booking_schedule,operational_event_records,operational_event_enrollments FROM PUBLIC;
CREATE FUNCTION protect_operational_event_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.training_event_id IS DISTINCT FROM OLD.training_event_id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.creation_digest IS DISTINCT FROM OLD.creation_digest THEN RAISE EXCEPTION 'Operational event identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_operational_event_identity BEFORE UPDATE ON operational_event_records FOR EACH ROW EXECUTE FUNCTION protect_operational_event_identity();
