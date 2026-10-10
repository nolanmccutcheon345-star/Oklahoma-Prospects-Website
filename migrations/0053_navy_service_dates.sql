-- Owner-requested correction; only the unique, uncommitted 14U Navy draft with
-- the exact reported dates qualifies. Existing offers/agreements are untouched.
DO $$
DECLARE c jsonb; candidate record; matches integer; revised jsonb;
BEGIN
 SELECT payload INTO c FROM club_state WHERE id='oklahoma-prospects' FOR UPDATE;
 IF c IS NULL THEN RETURN; END IF;
 SELECT count(*) INTO matches FROM jsonb_array_elements(c->'teams') t
 WHERE lower(t->>'name') LIKE '%navy%' AND t->>'sport'='softball' AND upper(t->>'age')='14U';
 IF matches <> 1 THEN RETURN; END IF;
 FOR candidate IN
 SELECT t.value AS team, (t.ordinality-1)::text AS idx, p.payload AS plan, p.team_id
 FROM jsonb_array_elements(c->'teams') WITH ORDINALITY t(value,ordinality)
 JOIN team_fee_plans p ON p.team_id=t.value->>'id'
 WHERE lower(t.value->>'name') LIKE '%navy%' AND t.value->>'sport'='softball'
 AND upper(t.value->>'age')='14U'
 AND p.payload->>'status'='draft'
 AND coalesce(p.payload->'published','null'::jsonb)='null'::jsonb
 AND coalesce(p.payload->'publishedBudget','null'::jsonb)='null'::jsonb
 AND p.payload#>>'{defaults,key}'='softball:14:springSummer'
 AND p.payload#>>'{budget,start}'='2027-02-10'
 AND p.payload#>>'{budget,end}'='2027-07-10'
 AND p.payload#>>'{budget,months}'='6'
 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t.value->'roster') r
   WHERE coalesce(r->'feeLock','null'::jsonb)<>'null'::jsonb
      OR coalesce(r->'planLock','null'::jsonb)<>'null'::jsonb
      OR coalesce(r#>>'{agreement,signedAt}','')<>'')
 FOR UPDATE OF p
 LOOP
   revised=jsonb_set(jsonb_set(candidate.plan,'{budget,start}','"2027-02-01"'),'{budget,end}','"2027-07-31"');
   revised=jsonb_set(revised,'{history}',coalesce(revised->'history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',now(),'actor','system:0053','action','Owner-requested six-month service dates: February 1–July 31, 2027.')));
   UPDATE team_fee_plans SET payload=revised,revision=revision+1,updated_at=now() WHERE team_id=candidate.team_id;
   c=jsonb_set(c,ARRAY['teams',candidate.idx,'seasonStart'],'"2027-02-01"');
   c=jsonb_set(c,ARRAY['teams',candidate.idx,'seasonEnd'],'"2027-07-31"');
   c=jsonb_set(c,ARRAY['teams',candidate.idx,'months'],'6');
   UPDATE club_state SET payload=c,rev=rev+1,updated_at=now() WHERE id='oklahoma-prospects';
   INSERT INTO club_audit(user_id,action,detail) VALUES('system:0053','correct-service-dates',candidate.team_id||': February 1–July 31, 2027; six months; unpublished draft only');
 END LOOP;
END $$;
