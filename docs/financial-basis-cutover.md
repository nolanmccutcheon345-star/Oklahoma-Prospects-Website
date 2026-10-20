# Financial identity foundation: captured, not active

## Status and scope

Migration `0069_financial_basis.sql` creates **empty** private tables. It contains no data backfill, account grant, owner-role change, or activation. `src/lib/finance/basis.server.ts` is a dormant server-only repository: no production route, active consumer, webhook, build, or migration imports it. The separately staged dormant `teams/financial-payment-adapter.server.ts` may use its types/pure helpers; the regression allows only these two exact modules and rejects application imports of either. No existing operational guard has been removed because of this foundation.

An initialized record is still **captured**, not active. `financial_basis_state.activation_state` is constrained to `captured`; `active_version` is constrained to NULL. `current_version` tracks the captured/amended private snapshot only. There is no activation API or command, and the schema cannot represent an active cutover without a separately reviewed migration. Never use “row exists” or `current_version > 0` as an activation condition.

This work does not establish full nonfinancial parity or financial-output parity. Existing financial consumers still read/write their legacy sources. The foundation does not enable operational roster transfers, compensation reassignment, guardian billing changes, or fee-linked schedule changes. Account-specific access activation and production financial initialization remain separate release decisions.

## Repository contract

All database-facing exported commands require an authenticated account ID from trusted server session context. They check, inside the transaction, a verified and nondisabled user, an admin profile, a matching unrevoked owner grant, and the absence of any sticky financial restriction. A caller-supplied admin flag, actor label, email, or operations grant is insufficient. These commands neither claim owner grants nor materialize household membership.

- `previewFinancialBasisInitialization(sql, userId)` returns `sourceClubRevision`, `sourceDigest`, and team/agreement counts. It writes nothing, returns no financial payload, and refuses an already initialized basis.
- `initializeFinancialBasisForOwner(sql, userId, {sourceClubRevision, sourceDigest, reason})` is an explicitly invoked owner command. It locks the source tables and empty singleton initialization boundary, validates the preview token, then atomically inserts version 1, identities, and original aliases. It returns a receipt, not a club DTO. No deployment code invokes it.
- `readFinancialBasisForOwner(sql, userId)` returns NULL when uninitialized, otherwise the complete private `FinancialBasis`. It never falls back to live club data. This is for internal financial consumers only, never organization/coordinator payloads, pages, exports, or logs. Even owner UIs must use separately reviewed financial projections rather than exposing every captured account/source by default.
- `updateFinancialBasisForOwner(sql, userId, {expectedVersion, reason}, update)` is an owner-only compare-and-swap primitive. The callback gets a detached saved snapshot, not freshly read operational data. It may make an explicitly authorized financial amendment. Identity, original membership, alias, source-provenance and activation metadata cannot change. It appends an immutable version and advances the captured version atomically. It does not write the operational club, fee plans, provider ledgers, or account metadata.
- `resolveFinancialTeam(basis, {teamSeasonId} | {teamId})` resolves a stable team-season UUID or permanent legacy team alias to the frozen team.
- `resolveFinancialAgreement(basis, {agreementId} | {teamId, playerId})` resolves a stable agreement UUID or complete historical legacy pair. Never resolve an old order using player ID alone or the player’s current operational team.
- `addFinancialPlayerAliasForOwner(sql, userId, {expectedVersion, reason, agreementId, teamId, playerId})` explicitly appends a legacy pair to an existing agreement, creating a new captured version. It never repoints/removes an old alias and never moves the financial roster. A new operational location is not automatically a new financial agreement.
- `hasFrozenFinancialGuardian(basis, agreementId, userId)` answers only the frozen attribution question. It is **not authentication or authorization by itself**. A future consumer must separately check current verified/disabled/restricted account status and commerce eligibility. It uses captured account identities, parental contacts, member/guardian links, and already-effective primary-email household membership. Newly created accounts do not inherit a frozen binding merely by matching an email.

No nonowner, household, or provider-service writer is exposed. A future Square adapter must be private and transaction-level, tied to a verified order/reconciliation path, with idempotent payment/refund handling. It must not obtain arbitrary financial write access through a user-supplied actor or unrestricted generic endpoint. Existing owner commands cannot simply be called from a webhook with an invented owner.

### Storage invariants

- `financial_basis_state`: one club, captured version, initialization provenance, and separately inactive activation marker/version.
- `financial_basis_versions`: append-only raw JSON financial input versions, content digests, actor and reason.
- `financial_team_seasons`: immutable UUIDs and original team IDs.
- `financial_player_agreements`: immutable UUIDs, original player IDs and team-season membership.
- `financial_team_aliases` / `financial_player_aliases`: append-only legacy lookup keys with creation version and foreign keys.
- Foreign keys prevent incomplete identity/version relationships; the current-version reference is deferred only within the atomic transaction. Database triggers reject historical updates/deletes. All six tables enable RLS and revoke PUBLIC access; existing application server authority still requires the repository checks above.
- Duplicate/missing source team or global player IDs and inconsistent player/team membership fail initialization. They are not silently repaired, deduplicated, repriced, or assigned to a guessed season.
- Full initialization locks source tables to prevent inserts, updates, or deletes from producing a mixed snapshot. Use an explicitly planned initialization window; it is not a background task. Deadlocks/serialization failures must roll back and be retried from a fresh review token, never partially resumed.

## Captured input coverage

The repository copies persisted source values without running `loadBudgetMaster`, normalization/defaulting, pricing, schedule calculation, fee publication, compensation calculation, or current catalog reconstruction. Missing plans and absent published budgets remain missing. Object keys are canonicalized for hashes, but array order and source financial values are preserved. Historical arbitrary fields in the club JSON remain intact.

### Team/player financial inputs

- Entire persisted `club_state.payload`, including settings, catalog/uniform definitions and ordered teams/rosters/staff.
- Team season labels/selections, dates/months, sport/age, closed state, selected event IDs, roster denominator inputs, practices and coaching attribution.
- Player role/withdrawal status, joined date, uniform waiver, guardian contacts/household ID, fee/plan locks, agreement, payment/credit history, deposit state and existing financial fields.
- Raw `team_fee_plans` payload and independent SQL revision, `team_fee_business`, `team_budget_master` payload/revision, and `team_activities` payload/revision.
- Plan player entries retain Roster Hold/Removed distinctions, membership/contingency allocations, service dates, late terms/applied fees and uniform release state. No missing historical offer or published budget is manufactured.

### Billing identity inputs

- Account ID, email, name and existing profile role; household ID/primary email; ordered member, guardian and player links.
- Account credentials/tokens are never selected. Current verification, disablement, owner revocation and sticky restriction are deliberately **not** treated as frozen permission grants.
- `resolveIdentity.familyIds` includes both membership and guardian links for nonplayers. Its login path also materializes membership where a captured account’s normalized email already equals the captured household primary email. The helper preserves that effective relationship without changing source tables.
- Existing guardian-email matching remains bound to the captured account, so later operational contact edits, account email changes or household additions cannot silently grant or revoke the saved financial attribution.

### Compensation and commitment attribution inputs

- Ordered team staff/head-coach attribution is preserved. Assistant count and array order affect odd-cent remainder allocation and cannot be deduplicated.
- `pd_working_file.coaches` and `coachPayouts`; `club_staff` and `club_staff_services`; booking ID/order/user/athlete/instructor/service, original timestamps and status; existing `contractor_earnings` rows.
- `finance_records` payee/rule rows in their existing `created_at,id` order, preserving duplicate-email first-match and same-effective-date rule behavior; owner assignment email/account/name; account identity for master payroll mapping.
- Financial event catalog selections, activity entry fees, travel/hotel nights, status and dates, master defaults, published/draft budget inputs and policy/schedule fields are retained.

This is **attribution-input capture**, not a fully migrated compensation engine. Commerce order quotes, funding provenance, live payment/refund state, finance payable state and provider reconciliation remain outside this snapshot and authoritative in their existing tables. The same stored inputs will need reviewed adapters before live calculations can be held invariant. Do not claim that storing existing earnings alone freezes future gross, refund ratios, or payout recipients.

## Required reader/writer cutover inventory

### 1. Fee workspace, published obligations and team finance

`teams/fee.server.ts`: `playerView`, `feeWorkspace`, `mutateFeePlan`, `teamUniform`, `teamFundingStatus`, and `setFeeBusiness`. Mutation branches `accept`, `roster`, `playerRole`, `lateFee`, `releaseUniform`, `publish` and `close` must address financial identities and versioned financial inputs, not current roster placement. Fee plan SQL revisions and basis revisions require a defined atomic authority, not two independently writable copies.

`teams/pricing.ts`: `publishedPrice`, `priceComponents`, `balance`, `fundingCount`; `teams/recorded-payment-policy.ts`: `remainingTeamPaymentCents`. Their callers must select financial input before calculation. `teams/store.ts`: `recordTeamPayment`, `writeRaw`, `saveTeamsClub`, `saveFamilyTeamsClub`, additions/removals and inquiry placement need distinct operational versus financial writes. `teams/season-save.server.ts: persistTeamSeasons` can alter matrix selection without changing a dollar field.

Specific regression distinctions:

- Fee workspace counts active full/PO players using both withdrawal and per-plan Roster Hold/Removed state. Finance projection uses `max(baseline, active full count)` instead.
- Finance receivables include fee-locked withdrawn players, but mark their status differently. Transferring a live roster currently moves team attribution and generated receivable IDs.
- Membership-recognition fallback differs between fee workspace and finance source generation. Preserve explicit/missing service dates and published dates.
- Missing `publishedBudget` protects all collected cash. Do not fill it as part of migration.

### 2. Team checkout, provider completion and reconciliation

`teams/payment.server.ts`: `lockedPlayer`, `prepareTeamCheckout`, `validateTeamPayment`, `fulfillTeamPayment`, `syncTeamPayment`.

- New checkout/order snapshots need stable agreement/team-season IDs and compatibility aliases. Existing `snapshot.teamFee.teamId/playerId/lockedAt/role` must continue resolving the original agreement after an operational transfer, deletion or rename.
- Signed terms, financial closed/withdrawn state, role and remaining accepted balance must come from the same financial version. Guardian attribution uses frozen bindings plus current account security checks.
- Pending orders and payment attempts remain live idempotency/concurrency authorities.
- Reconciliation uses verified provider gross/refunded amounts and externally reconciled refunds. It must amend the original financial ledger atomically and idempotently, keyed by provider payment identity; it must not append to whichever operational roster currently contains the player.
- Existing paid-order/refund behavior, `payment_review` paths, receipt notifications and retry handling must remain intact.

Authoritative live sources: `commerce_orders`, `square_payments`, `square_payment_attempts`, `commerce_refunds`, `payment_notifications`. A snapshot must not permanently freeze their changing payment states or balances.

### 3. Billing/household authorization and financial projections

`identity.server.ts: resolveIdentity`, `teams/store.ts` identity/family helpers, `teams/privacy.ts: ownsPlayer/scopeClub`, and the fee/payment guardian implementations currently derive access differently. A reviewed financial principal adapter must preserve intended effective access without reusing editable operational contacts or exposing a full basis.

Broader household financial consumers include `commerce/portal.server.ts`, `credits.server.ts`, `saved-methods.server.ts`, `square-management.server.ts`, `booking-resolution.server.ts`, and `family-cancellation.server.ts`. They use billing-household relationships and need their own scoped projections/security tests. Operational guardian management must not edit these financial bindings implicitly.

### 4. Team and facility compensation

`finance/sources.server.ts: sourceData` derives head coach/assistant recipients, stipend recipient, ordered split count and cost-source selection from team/budget inputs. The first matching cost ID or label wins; premium rounding precedes assistant splitting; assistant array order allocates remainder cents. Preserve existing `season:<team>:<role>:<payee>` and `stipend:<team>:<category>` identities/aliases.

`finance/facility.server.ts: facilityPayables` derives payroll payee from `team_budget_master.payroll.userId` and live account email/name. Future operational identity changes must leave captured payroll payee attribution unchanged. Owner changes to payroll terms require an explicit financial command.

### 5. Lesson compensation, funded value and refund allocation

`commerce/portal.server.ts: completeSessionInTransaction` chooses a completion split first from active `club_staff`/`club_staff_services.profit_split`, then `pd_working_file.coachPayouts`. Operational instructor/date changes must not silently alter financial recipient, split, duration-based terms or accrued earnings.

`commerce/lesson-assignment.server.ts`, `commerce/operations.server.ts` earnings reads, `finance/sources.server.ts`, `finance/store.server.ts` refresh/approval/reconciliation, and `finance/self.server.ts` must use preserved assignment identity where appropriate. Current `sourceData` selects `e.*` followed by `b.coach_id`, so the booking coach overrides existing earnings attribution; existing `contractor_earnings` does not alone freeze the payee.

Unmigrated determinants include `commerce_orders` snapshot recurring/kind/regularCents/credits/total/provider/environment/household, saved `finance_records` payable amounts/paid/manualOverride/legacyPaid, current refund allocation and pending/unallocated holds. `commerce/lesson-refund-value.server.ts` additionally reads:

- `credit_uses` quantity and reversal state
- `credit_grants` funded quantity, original order/payment/household/kind and rollover
- `commerce_policy['credit-funding:' + grantId].sourceGrantId`
- `square_payments` purpose/status/invoice grouping
- `commerce_refunds` pending/completed reserved amounts

Preserve funded value provenance. Never reprice historical package/recurring lessons from today’s catalog, credits or split defaults. Legitimate payment/refund activity must remain live while operational assignment changes leave attribution unchanged.

### 6. Schedule/event commitments

`teams/travel-budget.ts`: `seasonHotelNights`, `seasonEntryCosts`, `withScheduledHotels`; `teams/fee-model.ts`: `deadline`, `scheduleRows`; `teams/budget-matrix.ts`: `matchMatrix`, `linkedPODraft`, `budgetFromMatrix`; `teams/facility-overhead.ts`: `teamSeasonOverhead`.

Hotel/entry totals depend on activity kind, cancelled status, travel mode, nights, date within the financial season, entry fee, catalog organization and selected events. “Team schedule” catalog rows are excluded to avoid double counting. Deadline overrides, trigger event/days-before and published payment schedules must remain financial commitments.

`teams/activity.server.ts: saveTeamActivity` also rewrites catalog selections and open fee-plan budgets, readiness, status, revision and history. It cannot become an unrestricted operational saver merely because amounts appear unchanged. Preserve the existing independent operational score saver in `coordinator/organization-game-results.server.ts`; create similarly separated schedule commands only after commitments are migrated.

### 7. UI/legacy compatibility inventory

Owner/family/coach financial views must receive deliberately scoped financial projections. Inspect `teams/context.tsx`, `scope.ts`, `roster.ts`, `ops.ts`, `program.ts`, `staff.ts`, `money.ts`, `schedule.ts`, `pricing.ts` and their mounted consumers before permitting an operational mutation.

`teams/engine/02-pricing.js` additionally contains staff/child credit rebuilding, season/joined-date pricing, sponsors/actuals, withdrawal settlement based on selected events and schedule fee amendments. The audit found no mounted `TeamsProvider` outside its definition; treat this as legacy compatibility inventory, not demonstrated active authority. Do not copy preview seed/default policies into persisted agreements.

## Validation and release gates still required

1. Review the initialization source inventory with actual production schema using read-only inspection. Do not export customer records into test fixtures. Resolve ambiguous identity failures explicitly.
2. Define the complete source-of-truth/write protocol for financial plans, basis versions and live transaction ledgers, including retries and atomic provider reconciliation. Add a closed transaction-level provider adapter rather than a generic unguarded writer. Exercise initialization/lock ordering and concurrent payment, plan, roster, authorization and alias writes against real isolated PostgreSQL before live cutover; PGlite serialization tests do not certify PostgreSQL deadlock/concurrency behavior.
3. Build dual-read comparison at the same explicit as-of date/timezone. Compare both `feeWorkspace` and `financeWorkspace`/`financeSummary`: receivables, candidate/payee IDs, wages, gross/earned/paid/remaining, team attribution/protection, contingency, deferred revenue, warnings, cash, distributable amount and owner splits. Warnings can themselves block distributions.
4. Cover multiple ordered assistants/odd-cent splits; Roster Hold, Removed and transferred players; missing published budgets/service dates; PO variants; uniform waivers; contact/account changes; payroll reassignment; cancelled/out-of-season hotel events; package/rollover funding; partial/unallocated refunds; in-flight payments created before cutover; repeated and concurrent reconciliation.
5. Test complete server requests and direct routes for restricted users, including stale/suspended/revoked access, owner impostors, private financial canaries and DTO/export boundaries. Continue existing financial-coupling guards until the affected consumer group is fully migrated.
6. Obtain reviewed exact-commit CI, build/SSR checks, isolated authenticated/browser verification and preview evidence. Add activation/rollback logic only after consumer parity gates pass. There is no activation path in this change.
7. Production initialization, active cutover, account access expansion and deployment each require their applicable authorization. This document and passing fixture tests do not authorize those actions.

## Local evidence for this foundation

`src/lib/finance/basis.test.ts` uses one disposable PGlite/WASM instance with the synthetic schema rebuilt between cases. It checks empty/private migration, owner authentication/denials, preview staleness across club and other determinants, exact raw preservation and absent defaults, invariance under operational changes, effective frozen guardian bindings, CAS concurrency/rollback, stable/append-only aliases, captured-only activation constraints, insertion-failure rollback, malformed identity rejection, and absence of production imports/backfill.

These tests establish repository invariants only. They do not prove production parity, real provider transactions, or completed operational access replacement.
