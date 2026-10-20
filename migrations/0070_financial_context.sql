-- Internal transaction coordination and honest version provenance only.
-- This does not capture customer data, activate a basis, or grant access.
CREATE TABLE financial_execution_gate (
 id text PRIMARY KEY CHECK(id='oklahoma-prospects')
);
INSERT INTO financial_execution_gate(id) VALUES('oklahoma-prospects');
ALTER TABLE financial_execution_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_execution_gate FROM PUBLIC;

ALTER TABLE financial_basis_versions
 ADD COLUMN actor_kind text NOT NULL DEFAULT 'owner',
 ADD COLUMN provider_order_id text,
 ADD COLUMN provider_payment_id text,
 ADD COLUMN provider_environment text,
 ADD COLUMN provider_observation_digest text;
ALTER TABLE financial_basis_versions ALTER COLUMN changed_by DROP NOT NULL;
ALTER TABLE financial_basis_versions ADD CONSTRAINT financial_version_actor_shape CHECK (
 (actor_kind IN ('owner','guardian','coach') AND changed_by IS NOT NULL
  AND provider_order_id IS NULL AND provider_payment_id IS NULL
  AND provider_environment IS NULL AND provider_observation_digest IS NULL)
 OR
 (actor_kind='provider' AND changed_by IS NULL
  AND provider_order_id IS NOT NULL AND provider_payment_id IS NOT NULL
  AND provider_environment IS NOT NULL AND provider_observation_digest IS NOT NULL
  AND length(provider_order_id)>0 AND length(provider_payment_id)>0
  AND provider_environment='production' AND length(provider_observation_digest)=64)
);
CREATE UNIQUE INDEX financial_provider_observation_once ON financial_basis_versions
 (basis_id,provider_environment,provider_payment_id,provider_observation_digest)
 WHERE actor_kind='provider';
-- Deliberately retain both 0069 captured-only activation constraints unchanged.

-- Future-active ordinary booking admission. There is no binding backfill and
-- this trigger cannot take its active branch under the retained 0069 checks.
CREATE TABLE financial_lesson_bindings (
 booking_id text PRIMARY KEY REFERENCES booking_records(id),
 basis_id text NOT NULL CHECK(basis_id='oklahoma-prospects'),
 basis_version integer NOT NULL,
 order_id text NOT NULL REFERENCES commerce_orders(id),
 original_booking jsonb NOT NULL CHECK(jsonb_typeof(original_booking)='object'),
 approved_terms jsonb NOT NULL CHECK(jsonb_typeof(approved_terms)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(basis_id,basis_version) REFERENCES financial_basis_versions(basis_id,version)
);
ALTER TABLE financial_lesson_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_lesson_bindings FROM PUBLIC;
CREATE TRIGGER immutable_financial_lesson_binding BEFORE UPDATE OR DELETE ON financial_lesson_bindings
 FOR EACH ROW EXECUTE FUNCTION protect_financial_basis_history();

-- Resolve only saved owner-approved terms. No live staff/service defaults are
-- used here. Existing array order and first-match payee/rule semantics remain.
CREATE FUNCTION approved_financial_lesson_terms(inputs jsonb, coach_id text, service_id text, ends_at timestamptz)
 RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE coach jsonb; configured jsonb; payout jsonb; payee jsonb; rule jsonb;
 coach_email text; payee_id text; split numeric;
BEGIN
 SELECT c.value INTO coach
 FROM jsonb_array_elements(coalesce(inputs->'compensation'->'development','[]'::jsonb)) d(value),
 LATERAL jsonb_array_elements(coalesce(d.value->'coaches','[]'::jsonb)) c(value)
 WHERE c.value->>'id'=coach_id LIMIT 1;
 IF coach IS NULL THEN
   SELECT jsonb_build_object('id',coach_id,'email',s.value->>'email','name',s.value->>'name','active',s.value->'active') INTO coach
   FROM jsonb_array_elements(coalesce(inputs->'compensation'->'staff','[]'::jsonb)) s(value)
   WHERE 'c-'||substr(encode(sha256(convert_to(lower(trim(s.value->>'email')),'UTF8')),'hex'),1,32)=coach_id
   LIMIT 1;
 END IF;
 coach_email=lower(trim(coalesce(coach->>'email','')));
 IF coalesce(coach_id,'')='' OR coach_email='' OR coach->>'active'='false' THEN
   RAISE EXCEPTION 'Financial instructor admission is required before booking this lesson';
 END IF;
 IF inputs->'compensation' ? 'services' AND NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(inputs->'compensation'->'services') s(value)
   WHERE s.value->>'id'=service_id AND s.value->>'active'='true') THEN
   RAISE EXCEPTION 'Approved financial service is unavailable for a new booking';
 END IF;
 SELECT ss.value INTO configured
 FROM jsonb_array_elements(coalesce(inputs->'compensation'->'staffServices','[]'::jsonb)) ss(value)
 JOIN jsonb_array_elements(coalesce(inputs->'compensation'->'staff','[]'::jsonb)) s(value)
 ON s.value->>'id'=ss.value->>'staff_id'
 WHERE lower(trim(s.value->>'email'))=coach_email AND s.value->>'active'='true'
 AND ss.value->>'service_id'=service_id LIMIT 1;
 SELECT p.value INTO payout
 FROM jsonb_array_elements(coalesce(inputs->'compensation'->'development','[]'::jsonb)) d(value),
 LATERAL jsonb_array_elements(coalesce(d.value->'coachPayouts','[]'::jsonb)) p(value)
 WHERE p.value->>'coachId'=coach_id AND p.value->>'serviceId'=service_id LIMIT 1;
 split=coalesce((configured->>'profit_split')::numeric,(payout->>'splitPct')::numeric);
 SELECT r.value INTO payee
 FROM jsonb_array_elements(coalesce(inputs->'compensation'->'payeesAndRules','[]'::jsonb)) r(value)
 WHERE r.value->>'kind'='payee' AND lower(trim(r.value->'payload'->>'email'))=coach_email LIMIT 1;
 payee_id=coalesce(payee->>'id','person:'||substr(encode(sha256(convert_to(coach_email,'UTF8')),'hex'),1,24));
 SELECT r.value INTO rule
 FROM jsonb_array_elements(coalesce(inputs->'compensation'->'payeesAndRules','[]'::jsonb)) WITH ORDINALITY r(value,position)
 WHERE r.value->>'kind'='rule' AND r.value->'payload'->>'payeeId'=payee_id
 AND r.value->'payload'->>'serviceId'=service_id
 AND r.value->'payload'->>'effectiveFrom'<=to_char(ends_at AT TIME ZONE 'UTC','YYYY-MM-DD')
 ORDER BY r.value->'payload'->>'effectiveFrom' DESC,r.position LIMIT 1;
 IF (split IS NULL AND rule IS NULL) OR (split IS NOT NULL AND (split<0 OR split>100)) THEN
   RAISE EXCEPTION 'Approved financial instructor/service compensation is required before booking this lesson';
 END IF;
 RETURN jsonb_build_object('coachId',coach_id,'coachEmail',coach_email,'coachName',coalesce(coach->>'name',coach_email),
   'productId',service_id,'payeeId',payee_id,'splitPct',split,'ruleId',rule->>'id');
END $$;
REVOKE ALL ON FUNCTION approved_financial_lesson_terms(jsonb,text,text,timestamptz) FROM PUBLIC;

CREATE FUNCTION bind_original_financial_lesson() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state financial_basis_state%ROWTYPE; inputs jsonb; terms jsonb; pin jsonb; terms_version integer;
BEGIN
 -- No locking or legacy behavior change before a separately approved cutover.
 SELECT * INTO state FROM financial_basis_state WHERE id='oklahoma-prospects';
 IF NOT FOUND OR (state.activation_state='captured' AND state.active_version IS NULL) THEN RETURN NEW; END IF;
 IF state.activation_state<>'active' OR state.active_version IS NULL OR state.active_version<>state.current_version THEN
   RAISE EXCEPTION 'Financial activation state is unavailable or inconsistent';
 END IF;
 -- Noncommerce operations (tryout/practice reservations) create no compensation.
 IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
 IF coalesce(NEW.coach_id,'')='' AND NEW.lesson_config IS NULL AND NOT EXISTS(
   SELECT 1 FROM club_services WHERE id=NEW.product_id AND kind='lesson') THEN RETURN NEW; END IF;
 -- Callers must acquire this gate before order/booking locks. Acquiring here is
 -- a last-line atomicity guard, not a substitute for the outer lock protocol.
 PERFORM id FROM financial_execution_gate WHERE id='oklahoma-prospects' FOR UPDATE;
 SELECT * INTO state FROM financial_basis_state WHERE id='oklahoma-prospects' FOR SHARE;
 IF state.activation_state<>'active' OR state.active_version IS NULL OR state.active_version<>state.current_version THEN
   RAISE EXCEPTION 'Financial activation state changed during booking';
 END IF;
 terms_version=state.active_version;
 SELECT snapshot->'financialLessonAdmission' INTO pin FROM commerce_orders WHERE id=NEW.order_id;
 IF pin IS NOT NULL AND pin->>'coachId'=NEW.coach_id AND pin->>'productId'=NEW.product_id
   AND (pin->>'startsAt')::timestamptz=NEW.starts_at AND (pin->>'endsAt')::timestamptz=NEW.ends_at THEN
   terms_version=(pin->>'basisVersion')::integer;
   IF terms_version IS NULL OR terms_version<1 OR terms_version>state.active_version THEN
     RAISE EXCEPTION 'Original approved financial lesson version is unavailable';
   END IF;
 END IF;
 SELECT payload INTO inputs FROM financial_basis_versions WHERE basis_id=state.id AND version=terms_version;
 IF inputs IS NULL THEN RAISE EXCEPTION 'Approved financial terms are unavailable'; END IF;
 terms=approved_financial_lesson_terms(inputs,NEW.coach_id,NEW.product_id,NEW.ends_at);
 INSERT INTO financial_lesson_bindings(booking_id,basis_id,basis_version,order_id,original_booking,approved_terms)
 VALUES(NEW.id,state.id,terms_version,NEW.order_id,
   jsonb_build_object('id',NEW.id,'order_id',NEW.order_id,'user_id',NEW.user_id,'athlete_id',NEW.athlete_id,
     'coach_id',NEW.coach_id,'product_id',NEW.product_id,'starts_at',NEW.starts_at,'ends_at',NEW.ends_at),terms);
 RETURN NEW;
END $$;
CREATE TRIGGER bind_original_financial_lesson AFTER INSERT ON booking_records
 FOR EACH ROW EXECUTE FUNCTION bind_original_financial_lesson();

-- Owner-confirmed admission may append new financial identities. Versions keep
-- their original membership; existing identity/alias rows stay immutable.
ALTER TABLE financial_team_seasons ADD COLUMN created_version integer NOT NULL DEFAULT 1;
ALTER TABLE financial_team_seasons ADD CONSTRAINT financial_team_created_version
 FOREIGN KEY(basis_id,created_version) REFERENCES financial_basis_versions(basis_id,version);
ALTER TABLE financial_player_agreements ADD COLUMN created_version integer NOT NULL DEFAULT 1;
ALTER TABLE financial_player_agreements ADD CONSTRAINT financial_player_created_version
 FOREIGN KEY(basis_id,created_version) REFERENCES financial_basis_versions(basis_id,version);

-- Operational completion alone is not financial recognition. Existing frozen
-- completed lessons retain their captured recognition; later recognition is an
-- explicitly authorized coach/owner financial event, never a Sara ops side effect.
CREATE TABLE financial_lesson_recognitions (
 booking_id text PRIMARY KEY REFERENCES booking_records(id),
 basis_id text NOT NULL CHECK(basis_id='oklahoma-prospects'),
 basis_version integer NOT NULL,
 recognized_by text NOT NULL REFERENCES "user"(id),
 recognized_at timestamptz NOT NULL DEFAULT now(),
 actor_kind text NOT NULL CHECK(actor_kind IN ('owner','coach')),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
 FOREIGN KEY(basis_id,basis_version) REFERENCES financial_basis_versions(basis_id,version)
);
ALTER TABLE financial_lesson_recognitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_lesson_recognitions FROM PUBLIC;
CREATE TRIGGER immutable_financial_lesson_recognition BEFORE UPDATE OR DELETE ON financial_lesson_recognitions
 FOR EACH ROW EXECUTE FUNCTION protect_financial_basis_history();

-- Staff observations are deliberately separate from booking status/check-in:
-- those legacy fields influence customer refund eligibility and payables.
CREATE TABLE operational_lesson_completions (
 booking_id text PRIMARY KEY REFERENCES booking_records(id),
 attendance text NOT NULL CHECK(attendance='present'),
 recap text NOT NULL CHECK(length(trim(recap)) BETWEEN 10 AND 5000),
 completed_by text NOT NULL REFERENCES "user"(id),
 completed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE operational_lesson_completions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON operational_lesson_completions FROM PUBLIC;
CREATE TRIGGER immutable_operational_lesson_completion BEFORE UPDATE OR DELETE ON operational_lesson_completions
 FOR EACH ROW EXECUTE FUNCTION protect_financial_basis_history();

-- An approved precharge pin cannot be replaced after provider I/O. Existing
-- unpinned completed orders require a separately reviewed activation backfill.
CREATE FUNCTION protect_financial_lesson_admission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_pin jsonb; new_pin jsonb;
BEGIN
 old_pin=OLD.snapshot->'financialLessonAdmission';
 new_pin=NEW.snapshot->'financialLessonAdmission';
 IF old_pin IS NOT NULL AND old_pin IS DISTINCT FROM 'null'::jsonb AND old_pin IS DISTINCT FROM new_pin THEN
   RAISE EXCEPTION 'Original financial lesson admission is immutable';
 END IF;
 IF (old_pin IS NULL OR old_pin='null'::jsonb) AND new_pin IS NOT NULL AND new_pin<>'null'::jsonb
   AND EXISTS(SELECT 1 FROM square_payments p WHERE p.order_id=OLD.id AND p.status='COMPLETED') THEN
   RAISE EXCEPTION 'Financial lesson admission must precede completed payment';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_financial_lesson_admission BEFORE UPDATE OF snapshot ON commerce_orders
 FOR EACH ROW EXECUTE FUNCTION protect_financial_lesson_admission();
