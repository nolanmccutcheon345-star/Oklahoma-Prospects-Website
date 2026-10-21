# Coordinator privacy, retention and protected audit operations

Review date: October 20, 2026. This is an engineering review of actual code paths, not a legal-compliance certification or evidence that an external archive is configured.

## Actual collection and publication flows

| Flow                        | Current implementation                                                                                                                                                                                | Required operational decision                                                                                                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account creation            | `login.tsx` and Better Auth accept names/email/password and require verified email. The interface explicitly includes players. This is not an age-assurance or verifiable-parental-consent system.    | Owners must determine whether children under 13 use self-registration, inventory OAuth/embedded providers, and approve the appropriate child-account/guardian process. Do not equate email verification with verified legal guardianship. |
| Family/athlete relationship | Existing household membership, owner-managed guardian/player links and verified accounts determine access. Coordinator roster admission requires an exact owner eligibility clearance.                | Resolve incorrect links through the existing owner process; do not match children to adults by display name.                                                                                                                              |
| Recruiting intake           | Existing tryout/team inquiry records may contain parent contacts and free text. Scoped readers receive approved fields; contacts require a separate grant.                                            | Explain collection to submitting adults; discourage medical/payment narratives. Review historic free text before any expanded disclosure.                                                                                                 |
| Public roster               | Existing signed roster agreement covers name and jersey number, explicitly excludes photos and private fields. New coordinator admissions start with publication disabled.                            | Guardian consent is separate from owner approval of the exact proposed public identity. A changed controlled identity or withdrawn consent fails closed on subsequent reads.                                                              |
| Recruiting profile/photo    | The existing guardian consent, profile publication status, account relationship and current consent version are rechecked. Controlled photos additionally require exact owner approval.               | Resolve withdrawal promptly. Previous public downloads cannot be recalled. Review external media providers separately.                                                                                                                    |
| Communications              | Individual email purposes require separate grants. Team announcements bind a preview to actual verified recipients, scope and event revision. Program-wide requests require owner review.             | Review historical message bodies before marking operational. Delivery acceptance is not inbox receipt; no unsupported reply-import claim.                                                                                                 |
| Sensitive information       | Coordinator queries and reports omit financial, medical, credential and unrestricted export fields. Staff account status and current grants are checked on each server operation and queued dispatch. | Owners retain separate financial/security authority. Never use a coordinator checkbox to authorize a prohibited capability.                                                                                                               |

The FTC explains that COPPA can apply to child-directed services and general-audience services with actual knowledge of collection from children under 13. Collection from parents is distinguished from collection from children. The revised rule restricts retention to a specific necessary purpose; it does not permit indefinite retention. Therefore this site's player self-registration and provider flows require an explicit applicability review. Existing signatures and verified email are engineering controls, not proof that every applicable consent obligation is met.

Primary references reviewed: [FTC FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions), [FTC revised-rule summary](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data). Consult the revised rule linked by the FTC for controlling requirements. No legal conclusion about this organization is asserted here.

## Retention and deletion procedure

Staff Management → Privacy & Audit Protection has five independently reviewed categories: recruiting, communications, operational records, publication evidence and audit metadata. No duration is seeded. Owners enter the specific purpose, necessary period and supporting obligations. Changes use optimistic revisions and append-only review receipts. Candidate counts use record age (operational records use last update); they identify review candidates, not automatic deletion eligibility.

1. Receive a correction, access, consent-withdrawal or deletion request through the existing published contact channel. Verify the account and guardian/athlete relationship without copying identity documents into ordinary audit notes.
2. Identify the specific records, purpose, dependency, contractual obligation and any applicable hold. Separate operational, communication, publication, medical and financial records. A coordinator may not make deletion decisions.
3. Withdraw public consent or owner publication as appropriate immediately through existing controls. Revoke departing staff access through Roles & Permissions. These actions preserve underlying history.
4. Apply the reviewed category policy. Record the decision and a restricted evidence reference in the owner privacy review; do not copy child narratives into review notes. Route necessary financial/agreement retention to the separately authorized owner workflow.
5. If deletion or de-identification is justified, prepare an exact record-level plan, independent backup/restore evidence, dependency checks and owner approval. Execute through a separately reviewed maintenance change, not routine coordinator hard deletion or a broad database purge. Include processor copies, exports, media and backup expiration in the plan.
6. Verify public and private reads, dependencies and external processors; document the actual outcome. A review attestation does not mean deletion occurred. Explain outstanding obligations to the verified requester.

The current feature deliberately contains no automated athlete/financial/audit-history purge. Policies need real owner decisions before activation. Provider backup retention is controlled separately in Netlify. Recording a local policy does not alter or delete backups.

## Provider-managed backups — no separate AWS account

Owner direction on October 20: use the existing services without a separate AWS account. The S3 adapter and dependency have been removed. Migration 0096 adds append-only owner backup-review records; migration 0095 and any historical S3 receipts remain unchanged.

The original directive requires append-only audit history for normal users and an independently protected copy where appropriate. It does not require S3, Object Lock, permanent write-once storage, or a separate cloud account. The supported design combines:

- Server-generated append-only audit and communication history, owner-only review, existing transactional integrity checks and risk alerts.
- Netlify-managed full database backups outside the application runtime. The application does not receive Netlify administration/restore credentials. Backups include the audit and communications tables as of the snapshot time.
- Owner-only, append-only reviews of provider backup references, snapshot time and expiration; optional recovery evidence is distinctly labeled as owner-reported. Neither an environment flag nor a review record is presented as automatic backup or restore verification.
- The authenticated production review worker flags missing, expired or more-than-seven-day-old reviewed backup evidence. This is a review reminder, not proof that provider backups failed. Previews skip this check. No storage uploads or credentials are required.

### Verified provider configuration

On October 20 the authenticated Netlify Database dashboard showed daily backups retained for 30 days, the ten most recent on-publish backups, and a scheduled backup dated October 20 at 6:02 PM America/Chicago. The current production publish snapshot was also visible. Production personal-access-token write access was disabled and was not changed.

These backups are independent of application permissions, not independent of the Netlify team administrators. They are not WORM storage. A compromised Netlify owner account or provider incident remains a shared risk. Backups cover only data through the snapshot timestamp, not later writes. Maintain owner MFA and restricted administration. Do not describe this arrangement as AWS Object Lock or an externally verified immutable archive.

### Review and recovery

In Netlify, open Data & Storage → Database → Backups. Review the current backup reference, snapshot time and plan retention. After deployment, record that evidence in Staff Management → Privacy & Audit Protection → Record a provider backup review. Do not include credentials or athlete details. No production evidence is seeded by migrations.

Netlify's documented Restore replaces the production database. Never use it to conduct a routine test. For an actual incident, preserve current data, assess changes since the snapshot and obtain an exact recovery decision. Prefer a targeted correction where possible. A successful isolated restore has not been demonstrated; record that limitation rather than claiming a test passed. The original deployment directive requires a backup, staging migrations and security/regression checks; an isolated production-backup restoration was an additional implementation checklist item, not an instruction to overwrite production.

Provider backup retention and the application's purpose-specific retention policies are separate. Owner policy choices do not change Netlify settings or erase records. Review child-account/guardian flows and specific retention purposes before staff activation.

References: https://docs.netlify.com/build/data-and-storage/netlify-database/backup-and-recovery/
