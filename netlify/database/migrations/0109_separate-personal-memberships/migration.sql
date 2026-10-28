-- Generated from migrations/0109_separate_personal_memberships.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0109_separate_personal_memberships.sql') THEN
-- Owner directive, 2026-10-24: personal memberships are separate full-price purchases.
-- Append a handbook version; preserve signed policies, fee locks, ledgers and financial snapshots.
DO $membership$
DECLARE previous handbook_versions%ROWTYPE;
 updated_content jsonb;
 new_hash text;
 new_version integer;
 replacement_bodies jsonb := '{"Season fees and optional services":"Before acceptance, your account shows the owner-published team fee, included services, installment amounts and due dates. The usual new-season schedule is 70%, 15%, 15%, subject to the actual published plan and any retained agreement. The Team & Development Program amount comes from the owner-approved team configuration; this handbook sets no dollar amount and changes no pricing formula. Personal memberships must be purchased separately through the Memberships page at the full published price; team fees do not include a discounted personal membership. Do not assume team enrollment includes unlimited cage use, private lessons or every membership product. Only verified payments and approved ledger credits affect the account.","Facility and equipment":"Use the Prospects Sports Facility, 3804 S. Elm Pl., Suite A, Broken Arrow, OK 74011, only for an authorized booking or scheduled activity. A responsible adult must supervise minors; a membership or access credential does not authorize unattended activity. Staff identify safe boundaries, exits and equipment rules before use. Use appropriate helmets, protective screens and sport-specific protective equipment; only an authorized adult operates a pitching machine. Keep spectators and siblings clear of active lanes, return equipment and report hazards immediately. Each participating athlete needs the current required waiver. Personal memberships must be purchased separately through the Memberships page at the full published price and remain subject to booking availability and their own purchase terms. Team enrollment does not include a discounted personal membership or promise unlimited facility use."}'::jsonb;
 new_review jsonb := '{"legalReviewer":"","legalReviewedOn":"","insuranceReviewer":"","insuranceReviewedOn":"","reviewReference":""}'::jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM club_state WHERE id='oklahoma-prospects' AND NOT demo)
 AND EXISTS(SELECT 1 FROM owner_grants g JOIN "user" u ON u.id=g.user_id JOIN profiles p ON p.user_id=u.id
  WHERE g.email='stevemccutcheon89@gmail.com' AND lower(trim(u.email))=g.email AND g.revoked_at IS NULL AND u."emailVerified"=true AND u."disabledAt" IS NULL AND p.role='admin')
 AND NOT EXISTS(SELECT 1 FROM handbook_audit WHERE id='separate-memberships-2026-10-24') THEN
 SELECT * INTO previous FROM handbook_versions WHERE document_id='academy-2027' AND status='published' AND effective_on<='2026-10-24' ORDER BY version DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  SELECT jsonb_set(previous.content,'{sections}',jsonb_agg(
   CASE WHEN replacement_bodies ? (section->>'title') THEN jsonb_set(section,'{body}',replacement_bodies->(section->>'title')) ELSE section END ORDER BY ordinal))
   INTO updated_content FROM jsonb_array_elements(previous.content->'sections') WITH ORDINALITY AS s(section,ordinal);
  SELECT coalesce(max(version),0)+1 INTO new_version FROM handbook_versions WHERE document_id='academy-2027';
  new_hash := encode(sha256(convert_to(jsonb_build_object('content',updated_content,'standards',previous.standards,'review',new_review,'effectiveOn','2026-10-24')::text,'UTF8')),'hex');
  INSERT INTO handbook_versions(document_id,version,effective_on,content,standards,review,content_hash,updated_by,status,published_by,published_at)
   VALUES('academy-2027',new_version,'2026-10-24',updated_content,previous.standards,new_review,new_hash,'system:owner-authorized-release','published','system:owner-authorized-release',now());
  INSERT INTO handbook_audit(id,actor_id,action,target_id,details) VALUES('separate-memberships-2026-10-24','system:owner-authorized-release','handbook.publish','academy-2027',jsonb_build_object('authorization','Steve McCutcheon directed removal of the player membership add-on and separate full-price site purchases on 2026-10-24.','previousVersion',previous.version,'version',new_version,'hash',new_hash,'externalLegalApproval',false,'externalInsuranceApproval',false));
 END IF;
 END IF;
END $membership$;

    INSERT INTO _migrations (name) VALUES ('0109_separate_personal_memberships.sql');
  END IF;
END
$netlify_apply$;
