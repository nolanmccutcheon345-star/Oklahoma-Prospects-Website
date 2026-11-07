import { rosterWaiver } from "./athlete-link.server";
import type { Sql } from "../db";
import { withFinancialContext, isFinancialGuardian } from "../finance/context.server";
import { enrollmentScope } from "./access.server";
import { enrollmentTeams, packetFor } from "./enrollment.server";
import { financialState } from "./financial.server";
import { resolveSquareConfig, checkoutScopeAllowsKind } from "../commerce/square-config";
import { teamCollectionsEnabled } from "../teams/collections.server";
import type { ClubRecord } from "../teams/types";

export type GuideStatus =
  | "Complete"
  | "Action needed"
  | "Waiting for Prospects"
  | "Payment processing"
  | "Payment unsuccessful"
  | "Autopay not authorized"
  | "Autopay unavailable"
  | "Not applicable";
export type GuideStep = { title: string; status: GuideStatus; detail: string; href: string };
export type GuidePlayer = {
  teamId: string;
  playerId: string;
  name: string;
  team: string;
  season: string;
  steps: GuideStep[];
  parentComplete: boolean;
  participation: string;
};

/** Read-only progress projection. It cannot sign documents, accept fees, create a
 * checkout, admit financial identities, save a card or authorize collection. */
export async function enrollmentGuide(
  sql: Sql,
  actor: string,
  env: Record<string, string | undefined> = {
    ...process.env,
    // Match the existing payment and collection APIs' build-pinned readiness flags.
    SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT,
    SQUARE_OWNER_FULL_CATALOG_LAUNCH: process.env.SQUARE_OWNER_FULL_CATALOG_LAUNCH,
    CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT || process.env.CONTEXT,
  },
) {
  return withFinancialContext(sql, actor, "read", async (tx, c) => {
    const scope = await enrollmentScope(tx, actor);
    const [live] = await tx<{
      payload: ClubRecord;
    }>`select payload from club_state where id='oklahoma-prospects' and not demo`;
    const pending = await tx<{
      id: string;
    }>`select id from club_invites where lower(trim(email))=${c.principal.currentEmail} and role='parent' and status='pending' and expires_at>now()`;
    const pilots = await enrollmentTeams(tx);
    const config = resolveSquareConfig(env);
    const checkoutReady = Boolean(
      config && checkoutScopeAllowsKind(config.checkoutScope, "team-fee"),
    );
    const autopayReady = Boolean(
      checkoutReady && config && teamCollectionsEnabled(env, config.environment),
    );
    const players: GuidePlayer[] = [];
    for (const team of live?.payload.teams || []) {
      if (team.closed) continue;
      const access = scope.teams.find((t) => t.id === team.id);
      if (!access) continue;
      for (const player of team.roster) {
        if (player.withdrawn || (!scope.owner && !access.guardianPlayerIds.includes(player.id)))
          continue;
        const ids = { teamId: team.id, playerId: player.id };
        const url = `/enrollment?${new URLSearchParams(ids)}`;
        const pilot = pilots.find((p) => p.teamId === team.id);
        const season = pilot?.seasonKey || team.seasonLabel;
        const packet = await packetFor(tx, team.id, team.sport);
        const [record] = await tx<{
          id: string;
          cleared_at: string | null;
          medical: boolean;
          concussion: boolean;
        }>`select c.id,c.cleared_at::text,
          exists(select 1 from enrollment_medical m where m.case_id=c.id) as medical,
          exists(select 1 from enrollment_concussion_acknowledgments a where a.case_id=c.id and a.acknowledged_at<=now() and a.acknowledged_at+interval '1 year'>now()) as concussion
          from enrollment_cases c where c.team_id=${team.id} and c.player_id=${player.id} and c.season_key=${season}`;
        const waiver = await rosterWaiver(tx, team.id, player.id);
        const financialPlayer = c.club.teams
          .find((t) => t.id === team.id)
          ?.roster.find((p) => p.id === player.id);
        const admitted = Boolean(
          financialPlayer && (scope.owner || isFinancialGuardian(c, team.id, player.id)),
        );
        const plan = admitted ? c.feePlans.find((p) => p.team_id === team.id)?.payload : undefined;
        const fee = plan?.players[player.id];
        const payer = fee?.independent?.offer?.payerUserId || fee?.independent?.payerUserId;
        const signer = scope.owner ? payer : actor;
        const [signature] = record
          ? await tx`select id from enrollment_signatures where case_id=${record.id} and packet_digest=${packet.digest} and (${signer || null}::text is null or actor_id=${signer || null}) limit 1`
          : [];
        const documentsComplete = Boolean(
          packet.ready &&
          signature &&
          record?.medical &&
          record?.concussion &&
          waiver.current &&
          waiver.athleteId,
        );
        const missing = [
          !signature && "review and sign the current team packet",
          !record?.medical && "complete emergency and medical information",
          !record?.concussion && "complete the annual concussion acknowledgment",
          waiver.athleteId && !waiver.current && "sign the annual facility waiver",
          !waiver.athleteId &&
            "ask Prospects to verify the roster athlete link; do not add a duplicate athlete or sign again",
        ]
          .filter(Boolean)
          .join("; ");
        const finance = admitted ? await financialState(tx, c, team.id, player.id) : null;
        const accepted = Boolean(finance?.agreementSigned && !fee?.independent?.offer);
        const canceled = Boolean(plan?.independentCancellation || fee?.independent?.cancellation);
        const environment =
          config?.environment || (env.SQUARE_ENVIRONMENT === "sandbox" ? "sandbox" : "production");
        const [payment] = finance
          ? await tx<{ pending: boolean; failed: boolean }>`select
          exists(select 1 from commerce_orders o where o.kind='team-fee' and o.payment_environment=${environment} and o.snapshot->'teamFee'->>'teamId'=${team.id} and o.snapshot->'teamFee'->>'playerId'=${player.id} and o.snapshot->'teamFee'->>'lockedAt'=${financialPlayer?.feeLock?.lockedAt || null} and (o.status='payment_review' or exists(select 1 from square_payment_attempts a where a.order_id=o.id and a.status in ('pending','unknown')))) as pending,
          exists(select 1 from commerce_orders o join square_payment_attempts a on a.order_id=o.id where o.kind='team-fee' and o.payment_environment=${environment} and o.snapshot->'teamFee'->>'teamId'=${team.id} and o.snapshot->'teamFee'->>'playerId'=${player.id} and o.snapshot->'teamFee'->>'lockedAt'=${financialPlayer?.feeLock?.lockedAt || null} and a.status='declined') as failed`
          : [];
        const [authorization] = finance?.agreementSigned
          ? await tx<{
              status: string;
              ready: boolean;
            }>`select status,(authorized_at is not null and primary_card_id is not null and backup_card_id is not null and primary_fingerprint<>backup_fingerprint) as ready from team_collection_authorizations where team_id=${team.id} and player_id=${player.id} and environment=${environment} and locked_at=${financialPlayer?.feeLock?.lockedAt || null} and (${fee?.independent?.version || null}::int is null or (terms->>'agreementVersion')::int=${fee?.independent?.version || null}) order by authorized_at desc nulls last limit 1`
          : [];
        const schedule = fee?.acceptedSchedule || [];
        const monthly = schedule.slice(1).some((r) => r.amountCents > 0);
        const fullyPaid = Boolean(
          finance &&
          finance.verifiedCents + finance.offlineVerifiedCents + finance.creditCents >=
            (fee?.acceptedFeeCents || Infinity),
        );
        const noAutopay =
          canceled ||
          (finance?.agreementSigned && (!fee?.automaticPayments || !monthly || fullyPaid));
        const steps: GuideStep[] = [
          {
            title: "Verify your email and accept your invitation",
            status: "Complete",
            detail: scope.owner
              ? "Administrative status view."
              : "Your verified account has guardian access to this player.",
            href: "/invitations",
          },
          {
            title: "Confirm your player and team",
            status: "Complete",
            detail: `${player.name} is assigned to ${team.name}. Contact Prospects if this assignment is incorrect.`,
            href: url,
          },
          {
            title: "Complete required enrollment documents",
            status: documentsComplete
              ? "Complete"
              : !pilot?.signaturesOpen || !packet.ready
                ? "Waiting for Prospects"
                : "Action needed",
            detail: documentsComplete
              ? "The current packet, annual acknowledgments, medical information and waiver are on file. Optional media consent is separate."
              : !pilot?.signaturesOpen || !packet.ready
                ? "Prospects must open enrollment and publish the required documents. " +
                  packet.blockers.join(" ")
                : missing,
            href: url + "#enrollment-documents",
          },
          {
            title: "Review and accept your player's fee agreement",
            status: accepted
              ? "Complete"
              : !admitted || !plan?.published
                ? "Waiting for Prospects"
                : canceled
                  ? "Not applicable"
                  : "Action needed",
            detail: !admitted
              ? "Prospects must finish linking your player's fee account. Your team access is connected; contact the office to make the correct fees available."
              : accepted
                ? "Your accepted agreement is saved. Download it in Payments to Prospects."
                : canceled
                  ? "Future billing is canceled. Existing balances and accepted history remain available."
                  : !plan?.published
                    ? "Prospects has not published this player's fee offer."
                    : "Sign the current enrollment packet first, then review the published coverage, dates and exact player terms before accepting.",
            href: url + "#enrollment-payments",
          },
          {
            title: "Pay the initial deposit",
            status: finance?.depositSatisfied
              ? "Complete"
              : payment?.pending
                ? "Payment processing"
                : !finance?.agreementSigned
                  ? "Action needed"
                  : !checkoutReady
                    ? "Waiting for Prospects"
                    : payment?.failed
                      ? "Payment unsuccessful"
                      : "Action needed",
            detail: finance?.depositSatisfied
              ? "Verified payments and permitted credits satisfy the initial deposit."
              : payment?.pending
                ? "The existing payment is awaiting verification. Do not submit another payment; contact Prospects if this persists."
                : !finance?.agreementSigned
                  ? "Accept the fee agreement before paying."
                  : !checkoutReady
                    ? "Online checkout is unavailable. Contact Prospects for the approved payment path."
                    : "Pay the remaining initial deposit through Square. A checkout return is not proof of payment; status updates after verification.",
            href: url + "#enrollment-payments",
          },
          {
            title: "Set up monthly automatic payments",
            status: noAutopay
              ? "Not applicable"
              : !accepted
                ? "Action needed"
                : !autopayReady
                  ? "Autopay unavailable"
                  : authorization?.status === "active" && authorization.ready
                    ? "Complete"
                    : "Autopay not authorized",
            detail: noAutopay
              ? "No future automatic installments need setup. Any existing unpaid balance remains due through the manual payment path."
              : !accepted
                ? "Accept the fee agreement first. Fee acceptance does not activate autopay."
                : !autopayReady
                  ? "Scheduled collection is unavailable. Use Payments to Prospects for manual installments and contact the office. Saved cards or prior consent do not mean collections are running."
                  : authorization?.status === "active" && authorization.ready
                    ? "Separate installment consent and two different cards are recorded for this accepted agreement."
                    : payer && payer !== actor && !scope.owner
                      ? "The designated payer must authorize the schedule using their own primary and different backup card."
                      : "Open Automatic installments and backup card, consent to card storage, add two different cards, then authorize the displayed schedule separately.",
            href: url + "#enrollment-payments",
          },
        ];
        const parentComplete = steps.every((s) =>
          ["Complete", "Not applicable"].includes(s.status),
        );
        const participation =
          record?.cleared_at &&
          documentsComplete &&
          finance?.depositSatisfied &&
          finance.collectionReady
            ? "Owner participation clearance is recorded."
            : "Participation clearance requires Prospects review; completing parent steps does not grant approval to participate.";
        steps.push({
          title: "Review your enrollment and payment status",
          status: parentComplete ? "Complete" : "Action needed",
          detail:
            participation +
            " Keep using Payments to Prospects for statements, receipts and future installments.",
          href: url + "#enrollment-payments",
        });
        players.push({
          ...ids,
          name: player.name,
          team: team.name,
          season,
          steps,
          parentComplete,
          participation,
        });
      }
    }
    return {
      owner: scope.owner,
      pendingInvitations: pending.length,
      players,
      checkoutReady,
      autopayReady,
    };
  });
}
