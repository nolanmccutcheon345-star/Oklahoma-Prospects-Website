// Reproducible, owner-authorized publication. No credentials or customer data are embedded.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import {
  organizationPolicies,
  organizationStandards,
  POLICY_EFFECTIVE_ON,
  POLICY_RELEASE,
} from "../src/lib/enrollment/organization-policy";
import { emptyReview } from "../src/lib/enrollment/contracts";

const quote = (v: string) => "'" + v.replaceAll("'", "''") + "'";
const json = (v: unknown) => quote(JSON.stringify(v)) + "::jsonb";
const standardContent = {
  title: "Prospects Sports Academy — Organization Team Standards",
  sections: [
    { title: "Scope and playing time", body: organizationStandards.playingTime },
    { title: "Practices", body: organizationStandards.practiceExpectations },
    { title: "Tournaments and travel", body: organizationStandards.tournamentCommitment },
    { title: "Development feedback", body: organizationStandards.evaluationMethod },
    { title: "Communication", body: organizationStandards.communicationChannel },
    {
      title: "Notice and emergency exceptions",
      body: "Give 48 hours’ notice for a planned practice absence and 14 days for a planned tournament absence. Contact the coach directly as well as recording availability. Emergencies, medical restrictions and conflicts learned after the deadline are communicated as soon as reasonably possible and are not automatic disciplinary violations.",
    },
    {
      title: "Fees and individual addenda",
      body: "These minimum standards apply to every team without a published team-specific addendum. A team addendum may explain its competition and schedule but cannot reduce organization safety standards or required development feedback. Actual fees, services and dates remain those in the separately accepted owner-published financial agreement.",
    },
  ],
};
const publications = Object.entries({
  ...organizationPolicies,
  "organization-standards": standardContent,
})
  .map(([id, content]) => {
    const standards = id === "organization-standards" ? organizationStandards : null;
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          content,
          standards,
          review: emptyReview,
          effectiveOn: POLICY_EFFECTIVE_ON,
        }),
      )
      .digest("hex");
    return `INSERT INTO handbook_versions(document_id,version,effective_on,content,standards,review,content_hash,updated_by,status,published_by,published_at)
    SELECT ${quote(id)},coalesce(max(version),0)+1,${quote(POLICY_EFFECTIVE_ON)},${json(content)},${standards ? json(standards) : "NULL"},${json(emptyReview)},${quote(hash)},'system:owner-authorized-release','published','system:owner-authorized-release',now() FROM handbook_versions WHERE document_id=${quote(id)};
  INSERT INTO handbook_audit(id,actor_id,action,target_id,details) VALUES(${quote(POLICY_RELEASE + ":" + id)},'system:owner-authorized-release','handbook.publish',${quote(id)},${json({ authorization: "Steve McCutcheon explicitly requested policy revision, publication and direct organization-wide activation on 2026-10-24.", policyRelease: POLICY_RELEASE, hash, externalLegalApproval: false, externalInsuranceApproval: false })});`;
  })
  .join("\n");

const sql = `-- Direct organization rollout explicitly authorized by Steve McCutcheon on 2026-10-24.
-- No fabricated pilots, external reviews, signatures, training completion, payments or permission grants.
ALTER TABLE enrollment_rollout ADD COLUMN activation_basis text NOT NULL DEFAULT 'pilot' CHECK(activation_basis IN ('pilot','owner-directed'));
ALTER TABLE enrollment_rollout ADD COLUMN all_teams_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE handbook_documents DROP CONSTRAINT handbook_documents_kind_check;
ALTER TABLE handbook_documents ADD CONSTRAINT handbook_documents_kind_check CHECK(kind IN ('master','baseball','softball','medical','team','standards'));
INSERT INTO handbook_documents(id,kind) VALUES('organization-standards','standards');

CREATE TABLE enrollment_concussion_acknowledgments (
 id text PRIMARY KEY,case_id text NOT NULL REFERENCES enrollment_cases(id),guardian_id text NOT NULL,
 guardian_name text NOT NULL,athlete_name text NOT NULL,materials_version text NOT NULL,
 materials jsonb NOT NULL,statement text NOT NULL,acknowledged_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enrollment_concussion_case_idx ON enrollment_concussion_acknowledgments(case_id,acknowledged_at);
ALTER TABLE enrollment_concussion_acknowledgments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON enrollment_concussion_acknowledgments FROM PUBLIC;
CREATE TRIGGER enrollment_concussion_immutable BEFORE UPDATE OR DELETE ON enrollment_concussion_acknowledgments FOR EACH ROW EXECUTE FUNCTION protect_handbook_audit();
CREATE TRIGGER enrollment_concussion_no_truncate BEFORE TRUNCATE ON enrollment_concussion_acknowledgments FOR EACH STATEMENT EXECUTE FUNCTION protect_handbook_audit();

-- The release directive applies to this existing academy, not an empty or synthetic installation.
-- On a new installation, verified owners can publish and activate through the normal scoped UI.
-- BEGIN OWNER AUTHORIZED PUBLICATION
DO $activation$
BEGIN
 IF EXISTS(SELECT 1 FROM club_state WHERE id='oklahoma-prospects' AND NOT demo)
 AND EXISTS(SELECT 1 FROM owner_grants g JOIN "user" u ON u.id=g.user_id JOIN profiles p ON p.user_id=u.id
   WHERE g.email='stevemccutcheon89@gmail.com' AND lower(trim(u.email))=g.email AND g.revoked_at IS NULL AND u."emailVerified"=true AND u."disabledAt" IS NULL AND p.role='admin')
 AND NOT EXISTS(SELECT 1 FROM handbook_audit WHERE id='${POLICY_RELEASE}:activation') THEN
 ${publications}
 UPDATE enrollment_rollout SET mode='organization',activation_basis='owner-directed',all_teams_enabled=true,
   safety_name='Steve McCutcheon',safety_contact='stevemccutcheon89@gmail.com',
   alternate_name='Nolan McCutcheon',alternate_contact='nolanmccutcheon@icloud.com',
   emergency_plan_reference='Published organization handbook: Emergency-response plan; supervising staff adapt the plan to each venue before activity.',
   revision=revision+1,updated_by='system:owner-authorized-release',updated_at=now() WHERE id='academy';
 INSERT INTO enrollment_additional_teams(team_id,sport,season_key,signatures_open,updated_by)
 SELECT t->>'id',t->>'sport',coalesce(nullif(trim(t->>'seasonLabel'),''),'2027'),true,'system:owner-authorized-release'
 FROM club_state c CROSS JOIN LATERAL jsonb_array_elements(c.payload->'teams') t
 WHERE c.id='oklahoma-prospects' AND NOT c.demo AND coalesce(t->>'closed','false')<>'true' AND t->>'sport' IN ('baseball','softball')
 AND NOT EXISTS(SELECT 1 FROM enrollment_pilots p WHERE p.team_id=t->>'id') ON CONFLICT DO NOTHING;
 INSERT INTO handbook_audit(id,actor_id,action,target_id,details) VALUES('${POLICY_RELEASE}:activation','system:owner-authorized-release','rollout.organization','academy',
   '{"basis":"owner-directed","pilotRequired":false,"authorization":"Steve McCutcheon requested direct organization-wide activation on 2026-10-24","contactBasis":"Existing organization and owner contact addresses; no claim of continuous monitoring or a test message","externalLegalApproval":false,"externalInsuranceApproval":false}'::jsonb);
 END IF;
END $activation$;
-- END OWNER AUTHORIZED PUBLICATION
`;
await writeFile("migrations/0108_organization_enrollment.sql", sql);
