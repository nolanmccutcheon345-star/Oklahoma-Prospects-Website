import { poRosterLimit } from "./po-roster";
import { assertRosterAssignment, assertRosterCapacity } from "./po-roster.server";
import { linkedPODraft } from "./budget-matrix";
import { feeHealth, offersPO, pendingGas } from "./fee-health";
import { teamSeasonOverhead } from "./facility-overhead";
import { loadBudgetMaster } from "./budget-matrix.server";
import { budgetFromMatrix, rowKey } from "./budget-matrix";
import type { TeamActivity } from "./activity-contracts";
import { seasonHotelNights, seasonEntryCosts, withScheduledHotels } from "./travel-budget";
import type { Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import type { ClubRecord, Team, Player } from "./types";
import { feeAction, businessSchema, type FeePlan, type FeeBusiness } from "./fee-contracts";
import {
  budgetSchema,
  defaultBudget,
  calculateFees,
  project,
  deadline,
  installments,
  scheduleRows,
  money,
  paymentStatus,
  membershipRecognition,
  sum,
} from "./fee-model";
import type { z } from "zod";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const norm = (s: string) => s.trim().toLowerCase();
const coaching = (t: Team, email: string) =>
  norm(t.coachEmail) === email ||
  t.staff.some((s) => norm(s.email) === email && /coach/i.test(s.role));
type Identity = Awaited<ReturnType<typeof resolveIdentity>>;
function guardian(p: Player, me: Identity) {
  return (
    (me.role !== "player" && p.parents.some((g) => norm(g.email) === me.email)) ||
    (me.role === "player" ? me.guardianHouseholdIds : me.familyIds).includes(p.familyId)
  );
}
async function clubFor(sql: Sql, lock = false) {
  const [row] = lock
    ? await sql<{
        payload: ClubRecord;
        rev: number;
      }>`select payload,rev from club_state where id='oklahoma-prospects' for update`
    : await sql<{
        payload: ClubRecord;
        rev: number;
      }>`select payload,rev from club_state where id='oklahoma-prospects'`;
  if (!row) throw Error("Team records are unavailable.");
  return row;
}
function initial(t: Team): FeePlan {
  return {
    budget: { ...defaultBudget(), start: t.seasonStart, end: t.seasonEnd, months: t.months || 3 },
    uniforms: [],
    status: "draft",
    revision: 0,
    expenses: [],
    players: {},
    history: [],
  };
}
function checkBudget(p: FeePlan) {
  const b = budgetSchema.parse(p.budget);
  if (!b.start || !b.end || b.end < b.start) throw Error("Set a valid season date range.");
  if (b.holdDays <= b.graceDays || b.removalDays < b.holdDays)
    throw Error("Roster hold must follow the grace period; removal must follow hold.");
  if (
    new Set(b.costs.map((c) => c.id)).size !== b.costs.length ||
    new Set(p.uniforms.map((u) => u.id)).size !== p.uniforms.length ||
    new Set(p.expenses.map((e) => e.id)).size !== p.expenses.length
  )
    throw Error("Duplicate record identifiers.");
  const uniform = p.uniforms.find((u) => u.id === b.uniformId && u.active);
  if (b.uniformId && !uniform) throw Error("Select an active uniform package.");
  b.uniformCost = uniform?.cost || 0;
  p.budget = b;
  return p;
}
function paid(p: Player) {
  return Math.round(sum((p.payments || []).map((x) => x.amount)) * 100);
}
function credit(p: Player) {
  return Math.round(sum((p.credits || []).map((x) => x.amount)) * 100);
}
function playerView(t: Team, p: Player, plan: FeePlan) {
  const offer = plan.published;
  const total = p.feeLock
    ? Math.round(p.feeLock.amount * 100)
    : offer
      ? p.roleType === "po"
        ? offer.po
        : offer.full
      : 0;
  const terms = plan.players[p.id]?.latePolicy;
  const policy = terms
    ? {
        ...plan.budget,
        graceDays: terms.grace,
        holdDays: terms.hold,
        removalDays: terms.removal,
        lateFee: terms.fee,
      }
    : plan.budget;
  const agreedBudget = plan.publishedBudget || plan.budget;
  const previewSchedule =
    offer &&
    !p.feeLock &&
    !agreedBudget.paymentSchedule &&
    !agreedBudget.secondDue &&
    today() <= offer.finalDue
      ? scheduleRows(
          agreedBudget,
          total,
          p.roleType === "po" ? "po" : "full",
          offer.finalDue,
          today(),
        )
      : offer?.schedules?.[p.roleType === "po" ? "po" : "full"];
  const rows = p.planLock?.rows,
    accepted = p.agreement.signedAt?.slice(0, 10) || "",
    final = rows?.[rows.length - 1]?.date || p.planLock?.deadline || offer?.finalDue || "",
    second = rows?.[1]?.date || offer?.secondDue || "";
  const status =
    plan.players[p.id]?.status || (p.withdrawn ? "Removed" : accepted ? "Confirmed" : "Invited");
  return {
    id: p.id,
    name: p.name,
    role: p.roleType,
    rosterStatus: status,
    note: plan.players[p.id]?.note || "",
    acceptedPolicy: plan.players[p.id]?.acceptedPolicy || "",
    uniformReleasedAt: plan.players[p.id]?.uniformReleasedAt || "",
    agreedLateFee: plan.players[p.id]?.latePolicy?.fee || 0,
    lateFeeApplied: plan.players[p.id]?.lateFeeApplied || 0,
    accepted,
    total,
    paid: paid(p),
    credit: credit(p),
    signed: Boolean(p.feeLock),
    ...paymentStatus(
      total,
      paid(p) + credit(p),
      accepted,
      second,
      final,
      today(),
      policy,
      status,
      rows?.length
        ? rows.map((r, i) => ({
            amount: Math.round(r.amount * 100),
            due: r.date,
            label:
              i === 0 ? "Deposit" : i === rows.length - 1 ? "Final payment" : `Payment ${i + 1}`,
          }))
        : previewSchedule,
    ),
    ...(!p.feeLock && !offer
      ? { status: "Awaiting published fee", rows: [], uniformReady: false }
      : {}),
    uniformCutoff: plan.budget.uniformCutoff,
  };
}
export async function feeWorkspace(sql: Sql, userId: string) {
  const me = await resolveIdentity(sql, userId),
    { payload: club } = await clubFor(sql);
  const rows = await sql<{
    team_id: string;
    revision: number;
    payload: FeePlan;
  }>`select team_id,revision,payload from team_fee_plans`;
  const activities = await sql<{
    team_id: string;
    payload: TeamActivity;
  }>`select team_id,payload from team_activities`;
  for (const row of rows)
    if (row.payload.status !== "closed")
      row.payload.budget = {
        ...row.payload.budget,
        tournament: row.payload.budget.scheduleCostsAutomatic
          ? seasonEntryCosts(
              activities.filter((a) => a.team_id === row.team_id).map((a) => a.payload),
              row.payload.budget,
              club.catalog,
              club.teams.find((t) => t.id === row.team_id)?.tournamentIds || [],
            )
          : row.payload.budget.tournament,
        hotelNightly: row.payload.budget.hotelNightly || 0,
        hotelNights: seasonHotelNights(
          activities.filter((a) => a.team_id === row.team_id).map((a) => a.payload),
          row.payload.budget,
        ),
      };
  const overheadMaster = (await loadBudgetMaster(sql)).value;
  const admin = me.role === "admin";
  const teams = club.teams
    .filter((t) => admin || coaching(t, me.email) || t.roster.some((p) => guardian(p, me)))
    .map((t) => {
      const row = rows.find((r) => r.team_id === t.id),
        p = row ? { ...row.payload, revision: row.revision } : initial(t),
        coach = coaching(t, me.email);
      if (p.published && !p.publishedBudget) p.publishedBudget = structuredClone(p.budget);
      if (p.status !== "closed")
        p.budget = teamSeasonOverhead(
          pendingGas(linkedPODraft(p.budget, overheadMaster, t)),
          overheadMaster,
        );
      const players = t.roster
        .filter((x) => admin || coach || guardian(x, me))
        .map((x) => ({
          ...playerView(t, x, p),
          canAccept:
            guardian(x, me) &&
            (x.roleType !== "po" || offersPO(p.publishedBudget || p.budget, t.sport)),
        }));
      const events = club.catalog
        .filter((e) => t.tournamentIds.includes(e.id))
        .map((e) => ({ id: e.id, name: e.name, start: e.start }));
      const active = t.roster.filter(
        (x) =>
          p.players[x.id]?.status === "Roster Hold" ||
          (!x.withdrawn && p.players[x.id]?.status !== "Removed"),
      );
      const forecast = project(
        p.budget,
        active.filter((x) => x.roleType === "full").length,
        active.filter((x) => x.roleType === "po").length,
        p.expenses,
        p.status === "closed",
      );
      const totalCollected = sum(t.roster.map(paid)),
        totalCredits = sum(t.roster.map(credit)),
        expensesPaid = sum(p.expenses.filter((e) => e.paid).map((e) => e.cents)),
        expensesUnpaid = sum(p.expenses.filter((e) => !e.paid).map((e) => e.cents));
      const recognition = Object.values(p.players).reduce(
        (r, x) => {
          if (!x.serviceStart || !x.serviceEnd) return r;
          const a = membershipRecognition(
            x.membershipAllocation || 0,
            x.serviceStart,
            x.serviceEnd,
            today(),
          );
          return { earned: r.earned + a.earned, deferred: r.deferred + a.deferred };
        },
        { earned: 0, deferred: 0 },
      );
      const realized =
        totalCollected -
        expensesPaid -
        expensesUnpaid -
        p.budget.overhead -
        p.budget.reserve -
        recognition.deferred;
      const actualDistributable =
        p.status === "closed" && expensesUnpaid === 0 ? Math.max(0, realized) : 0;
      const contingencyFunded = Math.min(
        forecast.reserve,
        sum(
          t.roster.map((x) => {
            const allocation = p.players[x.id]?.contingencyAllocation || 0;
            const total = Math.round((x.feeLock?.amount || 0) * 100);
            return total ? Math.floor(allocation * Math.min(1, paid(x) / total)) : 0;
          }),
        ),
      );
      return {
        id: t.id,
        poEnabled: offersPO(p.budget, t.sport),
        seasonLabel: t.seasonLabel,
        name: t.name,
        closed: t.closed,
        access: admin ? ("admin" as const) : coach ? ("coach" as const) : ("family" as const),
        revision: p.revision,
        status: p.status,
        publication: p.published || null,
        players,
        events,
        choices:
          admin || coach
            ? {
                poRosterLimit: offersPO(p.budget, t.sport)
                  ? (p.budget.poRosterLimit ?? poRosterLimit(t.age))
                  : 0,
                hotelNightly: p.budget.hotelNightly || 0,
                hotelNights: p.budget.hotelNights || 0,
                tournament: p.budget.tournament,
                uniformId: p.budget.uniformId,
                canTournament: p.budget.coachTournament && !p.budget.scheduleCostsAutomatic,
                canUniform: p.budget.coachUniform,
                uniforms: p.uniforms
                  .filter((u) => u.active)
                  .map((u) => ({
                    id: u.id,
                    name: u.name,
                    items: u.items,
                    price: u.price,
                    photos: u.photos || [],
                  })),
                full: calculateFees(p.budget).full,
                po: offersPO(p.budget, t.sport) ? calculateFees(p.budget).po : 0,
              }
            : null,
        private: admin
          ? {
              plan: p,
              feeHealth: feeHealth(p.budget, {
                key: p.defaults?.key,
                seasonLabel: t.seasonLabel,
                overheadReviewed: overheadMaster.overheadReviewed,
                finalDue: deadline(p.budget, events),
                today: today(),
              }),
              forecast,
              actual: {
                totalCollected,
                totalCredits,
                expensesPaid,
                expensesUnpaid,
                ...recognition,
                actualDistributable,
                contingencyFunded,
                fundedContingencyRemaining: Math.max(0, contingencyFunded - forecast.used),
                nolan: Math.floor((actualDistributable * p.budget.nolanBps) / 10000),
                steve:
                  actualDistributable -
                  Math.floor((actualDistributable * p.budget.nolanBps) / 10000),
              },
            }
          : null,
      };
    });
  const [business] = admin
    ? await sql<{
        revision: number;
        payload: FeeBusiness;
      }>`select revision,payload from team_fee_business where id='business'`
    : [];
  return {
    admin,
    teams,
    business: admin
      ? {
          revision: business?.revision || 0,
          value: business?.payload || {
            overhead: 0,
            reserve: 0,
            nolanBps: 5000,
            period: "",
            teamIds: [],
          },
        }
      : null,
  };
}
export async function mutateFeePlan(sql: Sql, userId: string, raw: z.infer<typeof feeAction>) {
  const input = feeAction.parse(raw),
    me = await resolveIdentity(sql, userId);
  await sql.transaction(async (tx) => {
    const { payload: club, rev } = await clubFor(tx, true),
      t = club.teams.find((t) => t.id === input.teamId);
    if (!t) throw Error("Team not found.");
    const [row] = await tx<{
      payload: FeePlan;
      revision: number;
    }>`select payload,revision from team_fee_plans where team_id=${t.id} for update`;
    let p = row ? { ...row.payload, revision: row.revision } : initial(t);
    if (p.revision !== input.revision) throw Error("This plan changed. Reload before saving.");
    const admin = me.role === "admin";
    if (!admin && input.action !== "propose" && input.action !== "accept")
      throw Error("Admin access required.");
    if (p.status === "closed") throw Error("This season is financially closed.");
    if (p.published && !p.publishedBudget) p.publishedBudget = structuredClone(p.budget);
    p.budget = await withScheduledHotels(tx, t.id, p.budget);
    let clubChanged = false;
    if (input.action === "applyDefaults") {
      if (p.published)
        throw Error(
          "Apply defaults only to an unpublished draft. Published fees require individual admin edits.",
        );
      const master = await loadBudgetMaster(tx),
        row = master.value.rows.find((r) => rowKey(r) === input.key && r.sport === t.sport);
      if (!row) throw Error("Choose a matching sport's matrix row.");
      const defaults = budgetFromMatrix(t, master.value, row);
      p.budget = {
        ...p.budget,
        ...defaults,
        start: p.budget.start || t.seasonStart,
        end: p.budget.end || t.seasonEnd,
        uniformId: p.budget.uniformId,
        uniformCost: p.budget.uniformCost,
        paymentSchedule: p.budget.paymentSchedule,
        policy: p.budget.policy,
        reinstatement: p.budget.reinstatement,
      };
      p.budget = await withScheduledHotels(tx, t.id, p.budget);
      p.defaults = {
        key: rowKey(row),
        revision: master.revision,
        appliedAt: new Date().toISOString(),
      };
      const year = p.budget.start.slice(0, 4) || t.seasonLabel.match(/20\d{2}/)?.[0];
      if (year) {
        t.seasons = (
          row.season === "springSummer"
            ? ["Spring", "Summer"]
            : [row.season[0].toUpperCase() + row.season.slice(1)]
        ).map((s) => s + " " + year);
        t.seasonLabel = t.seasons.join(" & ");
        t.months = p.budget.months;
        clubChanged = true;
      }
      p.status = "draft";
    }
    if (input.action === "save") {
      p = checkBudget({
        ...p,
        budget: await withScheduledHotels(tx, t.id, pendingGas(input.budget)),
        uniforms: input.uniforms,
        expenses: input.expenses,
        status: "draft",
      });
    }
    if (input.action === "propose") {
      if (!admin && !coaching(t, me.email)) throw Error("Assigned team coach access required.");
      if (
        !admin &&
        ((!p.budget.coachTournament && input.tournament !== p.budget.tournament) ||
          (!p.budget.coachUniform && input.uniformId !== p.budget.uniformId))
      )
        throw Error("This selection is controlled by Front Office.");
      p = checkBudget({
        ...p,
        budget: {
          ...p.budget,
          tournament: p.budget.scheduleCostsAutomatic ? p.budget.tournament : input.tournament,
          uniformId: input.uniformId,
        },
        status: "pending",
      });
    }
    const currentMaster = (await loadBudgetMaster(tx)).value;
    if (input.action !== "accept") p.budget = linkedPODraft(p.budget, currentMaster, t);
    p.budget = teamSeasonOverhead(p.budget, currentMaster);
    if (
      (input.action === "save" && p.budget.poRosterLimit !== row?.payload.budget.poRosterLimit) ||
      input.action === "publish"
    )
      await assertRosterCapacity(tx, t, p.budget);
    if (input.action === "publish") {
      checkBudget(p);
      const health = feeHealth(p.budget, {
        key: p.defaults?.key,
        seasonLabel: t.seasonLabel,
        overheadReviewed: (await loadBudgetMaster(tx)).value.overheadReviewed,
        finalDue: deadline(
          p.budget,
          club.catalog.filter((e) => t.tournamentIds.includes(e.id)),
        ),
        today: today(),
      });
      if (!health.ready)
        throw Error(
          "Fee health: " +
            (health.pending.join(" ") || "Projected fees do not fully fund costs and targets."),
        );
      const poEnabled = offersPO(p.budget, t.sport);
      if (!poEnabled && t.roster.some((x) => !x.withdrawn && x.roleType === "po" && !x.feeLock))
        throw Error(
          "Resolve unaccepted pitcher-only roster assignments before publishing full-player-only fees.",
        );
      p.budget.poEnabled = poEnabled;
      const final = deadline(
          p.budget,
          club.catalog.filter((e) => t.tournamentIds.includes(e.id)),
        ),
        b = p.budget;
      if (!final || (!b.paymentSchedule && b.secondDue && b.secondDue > final) || final < today())
        throw Error("Set a future final deadline and a second payment date no later than it.");
      if (!b.policy.trim() || !b.reinstatement.trim())
        throw Error(
          "Enter the approved payment/refund policy and reinstatement rules before publishing.",
        );
      const f = calculateFees(b);
      const schedules = {
        full: scheduleRows(b, f.full, "full", final, today()).map((r, i) =>
          i ? r : { ...r, due: "" },
        ),
        po: poEnabled
          ? scheduleRows(b, f.po, "po", final, today()).map((r, i) => (i ? r : { ...r, due: "" }))
          : [],
      };
      for (const rows of Object.values(schedules)) {
        let previous = today();
        for (const row of rows.slice(1)) {
          if (!row.due || row.due < previous || row.due > final)
            throw Error(
              "Payment dates must be in order, no earlier than today and no later than the final deadline.",
            );
          previous = row.due;
        }
      }
      p.published = {
        schedules,
        full: f.full,
        po: poEnabled ? f.po : 0,
        secondDue: b.secondDue,
        finalDue: final,
        policy:
          b.policy +
          "\n\nFull player schedule: " +
          schedules.full
            .map(
              (r, i) =>
                `${r.label}: ${money(r.amount)} ${i === 1 && !b.paymentSchedule && !b.secondDue ? "at the acceptance midpoint" : r.due ? "by " + r.due : "at acceptance"}`,
            )
            .join("; ") +
          (poEnabled
            ? "\nPitcher-only schedule: " +
              schedules.po
                .map(
                  (r) =>
                    `${r.label}: ${money(r.amount)} ${r.due ? "by " + r.due : "at acceptance"}`,
                )
                .join("; ")
            : "") +
          (!b.paymentSchedule && !b.secondDue
            ? "\nSecond payment is due midway between acceptance and the final deadline; the exact date is confirmed when you accept."
            : "") +
          ". Grace period: " +
          b.graceDays +
          " days. One-time late fee after grace: $" +
          (b.lateFee / 100).toFixed(2) +
          ", subject to admin review. Roster hold review after " +
          b.holdDays +
          " days; removal review after " +
          b.removalDays +
          " days.\n\nReinstatement: " +
          b.reinstatement,
        at: new Date().toISOString(),
        revision: p.revision + 1,
      };
      p.status = "published";
      p.publishedBudget = structuredClone(b);
      const uniform = p.uniforms.find((u) => u.id === b.uniformId);
      if (uniform) {
        const prior = club.uniforms.find((u) => u.id === uniform.id);
        const publishedUniform = {
          id: uniform.id,
          name: uniform.name,
          sport: t.sport,
          price: uniform.price / 100,
          items: uniform.items
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          colourways: prior?.colourways || [],
          sizeFields: prior?.sizeFields || ["Jersey", "Pants", "Hat"],
        };
        club.uniforms = [...club.uniforms.filter((u) => u.id !== uniform.id), publishedUniform];
        t.uniformPackageId = uniform.id;
      }
      t.uniformDeadline = b.uniformCutoff;
      clubChanged = true;
    }
    if (input.action === "roster") {
      const player = t.roster.find((x) => x.id === input.playerId);
      if (!player) throw Error("Player not found.");
      const view = playerView(t, player, p);
      if (input.status === "Roster Hold" && !view.holdEligible)
        throw Error("Roster hold threshold has not been reached.");
      if (input.status === "Removed" && !view.removalEligible)
        throw Error("Removal threshold has not been reached.");
      if (
        input.status === "Confirmed" &&
        ["Roster Hold", "Removed"].includes(view.rosterStatus) &&
        view.balance > 0
      )
        throw Error("Settle the outstanding balance before reinstatement.");
      if (input.status === "Confirmed" && player.withdrawn)
        await assertRosterAssignment(tx, t, player.roleType, player.id);
      p.players[player.id] = { ...p.players[player.id], status: input.status, note: input.note };
      player.withdrawn = input.status === "Removed" || input.status === "Roster Hold";
      clubChanged = true;
    }
    if (input.action === "playerRole") {
      const player = t.roster.find((x) => x.id === input.playerId);
      if (!player) throw Error("Player not found.");
      if (player.feeLock)
        throw Error(
          "This player has an agreed fee. A role change requires separate agreement review.",
        );
      if (input.role === "po" && !offersPO(p.budget, t.sport))
        throw Error("This team does not offer pitcher-only roster spots.");
      await assertRosterAssignment(tx, t, input.role, player.id);
      player.roleType = input.role;
      clubChanged = true;
    }
    if (input.action === "accept") {
      const player = t.roster.find((x) => x.id === input.playerId);
      if (!player || !guardian(player, me))
        throw Error("Only this player’s guardian can accept the fee.");
      if (!p.published) throw Error("Front Office has not published fees.");
      if (player.feeLock)
        throw Error(
          "An agreed fee already exists. Front Office must review amendments separately.",
        );
      if (player.roleType === "po" && !offersPO(p.publishedBudget || p.budget, t.sport))
        throw Error("This team does not offer pitcher-only roster spots.");
      if (today() > p.published.finalDue)
        throw Error(
          "The final payment deadline has passed. Contact Front Office before accepting.",
        );
      const amount = player.roleType === "po" ? p.published.po : p.published.full,
        schedule =
          p.published.schedules?.[player.roleType === "po" ? "po" : "full"] ||
          scheduleRows(
            p.publishedBudget || p.budget,
            amount,
            player.roleType === "po" ? "po" : "full",
            p.published.finalDue,
          ),
        parts = schedule.map((r) => r.amount),
        date = today();
      const agreedForDates = p.publishedBudget || p.budget;
      const acceptedSchedule =
        !agreedForDates.paymentSchedule && !agreedForDates.secondDue
          ? scheduleRows(
              agreedForDates,
              amount,
              player.roleType === "po" ? "po" : "full",
              p.published.finalDue,
              date,
            )
          : schedule;
      player.feeLock = {
        amount: amount / 100,
        lockedAt: new Date().toISOString(),
        policyVersion: "fee-plan-" + p.published.revision,
        components: { season: amount / 100 },
      };
      player.planLock = {
        dep: parts[0] / 100,
        deadline: p.published.finalDue,
        planType: "custom",
        rows: acceptedSchedule.map((r) => ({
          date: !r.due || r.due < date ? date : r.due,
          amount: r.amount / 100,
        })),
      };
      const agreed = p.publishedBudget || p.budget;
      player.depositPaid = paid(player) >= parts[0];
      player.agreement = {
        version: "fee-plan-" + p.published.revision,
        signedBy: input.name,
        signedAt: new Date().toISOString(),
      };
      p.players[player.id] = {
        status: "Confirmed",
        note: "Guardian accepted the published fee and policy.",
        acceptedPolicy: p.published.policy,
        membershipAllocation:
          player.roleType === "po" ? calculateFees(agreed).poMember : calculateFees(agreed).member,
        contingencyAllocation:
          player.roleType === "po"
            ? calculateFees(agreed).poContingency
            : Math.ceil(calculateFees(agreed).contingency / agreed.baseline),
        serviceStart: agreed.start,
        serviceEnd: agreed.end,
        latePolicy: {
          fee: agreed.lateFee,
          grace: agreed.graceDays,
          hold: agreed.holdDays,
          removal: agreed.removalDays,
        },
      };
      clubChanged = true;
    }
    if (input.action === "lateFee") {
      const player = t.roster.find((x) => x.id === input.playerId),
        record = p.players[input.playerId];
      if (!player?.feeLock || !player.planLock || !record?.latePolicy || !record.latePolicy.fee)
        throw Error("No agreed late fee is available.");
      if (record.lateFeeApplied) throw Error("The one-time late fee has already been applied.");
      if (playerView(t, player, p).days <= record.latePolicy.grace)
        throw Error("The agreed grace period has not elapsed.");
      const fee = record.latePolicy.fee;
      player.feeLock.amount = (Math.round(player.feeLock.amount * 100) + fee) / 100;
      const last = player.planLock.rows.at(-1);
      if (!last) throw Error("Payment schedule missing.");
      last.amount = (Math.round(last.amount * 100) + fee) / 100;
      record.lateFeeApplied = fee;
      clubChanged = true;
    }
    if (input.action === "releaseUniform") {
      const player = t.roster.find((x) => x.id === input.playerId);
      if (!player) throw Error("Player not found.");
      const view = playerView(t, player, p);
      if (!player.feeLock || !view.uniformReady)
        throw Error("Uniform release requires the full deposit and a confirmed roster spot.");
      if (p.budget.uniformCutoff && today() > p.budget.uniformCutoff)
        throw Error(
          "The uniform cutoff has passed. Review vendor lead time and update the cutoff first.",
        );
      p.players[player.id] = {
        ...p.players[player.id],
        status: "Confirmed",
        note: p.players[player.id]?.note || "",
        uniformReleasedAt: new Date().toISOString(),
      };
    }
    if (input.action === "close") {
      if (!(await loadBudgetMaster(tx)).value.overheadReviewed)
        throw Error(
          "Review actual facility costs and staffing before closing the season financially.",
        );
      if (
        !p.published ||
        today() <= p.budget.end ||
        p.expenses.some((e) => !e.paid) ||
        t.roster.some((x) => x.feeLock && Math.round(x.feeLock.amount * 100) > paid(x) + credit(x))
      )
        throw Error(
          "Close only after the season ends, expenses are paid, and player balances are reconciled.",
        );
      p.status = "closed";
    }
    p.revision++;
    p.history = [
      ...p.history,
      { at: new Date().toISOString(), actor: me.name, action: input.action },
    ].slice(-500);
    await tx`insert into team_fee_plans(team_id,revision,payload) values(${t.id},${p.revision},${JSON.stringify(p)}::jsonb) on conflict(team_id) do update set revision=excluded.revision,payload=excluded.payload,updated_at=now()`;
    if (clubChanged) {
      club._rev = rev + 1;
      club._savedAt = new Date().toISOString();
      await tx`update club_state set payload=${JSON.stringify(club)}::jsonb,rev=${rev + 1},updated_at=now() where id='oklahoma-prospects'`;
    }
    await tx`insert into club_audit(user_id,action,detail) values(${userId},${"team-fee-" + input.action},${t.id})`;
  });
  return { ok: true };
}
export async function setFeeBusiness(
  sql: Sql,
  userId: string,
  input: { revision: number; value: FeeBusiness },
) {
  const me = await resolveIdentity(sql, userId);
  if (me.role !== "admin") throw Error("Admin access required.");
  const value = businessSchema.parse(input.value);
  await sql.transaction(async (tx) => {
    await clubFor(tx, true);
    const [row] = await tx<{
      revision: number;
    }>`select revision from team_fee_business where id='business' for update`;
    if ((row?.revision || 0) !== input.revision)
      throw Error("Business assumptions changed. Reload.");
    await tx`insert into team_fee_business(id,revision,payload) values('business',${input.revision + 1},${JSON.stringify(value)}::jsonb) on conflict(id) do update set revision=excluded.revision,payload=excluded.payload`;
  });
  return { ok: true };
}

/** Uniform presentation only: never exposes fee budgets or other players. */
export async function teamUniform(sql: Sql, userId: string, teamId: string) {
  const me = await resolveIdentity(sql, userId);
  const { payload: club } = await clubFor(sql);
  const team = club.teams.find((t) => t.id === teamId);
  if (
    !team ||
    !(
      me.role === "admin" ||
      coaching(team, me.email) ||
      team.roster.some(
        (p) =>
          !p.withdrawn &&
          (guardian(p, me) ||
            me.playerIds.includes(p.id) ||
            (me.email && norm(p.email) === me.email)),
      )
    )
  )
    throw Error("Assigned team access required.");
  const [row] = await sql<{
    payload: FeePlan;
  }>`select payload from team_fee_plans where team_id=${teamId}`;
  if (row) {
    const u = row.payload.uniforms.find((u) => u.id === row.payload.budget.uniformId);
    return u ? { name: u.name, items: u.items, photos: u.photos || [] } : null;
  }
  const u = club.uniforms.find((u) => u.id === team.uniformPackageId);
  return u ? { name: u.name, items: u.items.join(", "), photos: [] } : null;
}

/** Aggregate payment status only; never expose families, amounts or budget detail. */
export async function teamFundingStatus(sql: Sql, userId: string, teamId: string) {
  const me = await resolveIdentity(sql, userId);
  const { payload: club } = await clubFor(sql);
  const t = club.teams.find((t) => t.id === teamId);
  if (
    !t ||
    !(
      me.role === "admin" ||
      coaching(t, me.email) ||
      (me.role !== "player" && t.roster.some((p) => !p.withdrawn && guardian(p, me)))
    )
  )
    return null;
  const [row] = await sql<{
    payload: FeePlan;
  }>`select payload from team_fee_plans where team_id=${teamId}`;
  if (!row) return { overduePlayers: 0, tracking: false };
  const players = t.roster.filter(
    (p) =>
      p.feeLock &&
      row.payload.players[p.id]?.status !== "Removed" &&
      (!p.withdrawn || row.payload.players[p.id]?.status === "Roster Hold"),
  );
  const overduePlayers = players.filter((p) => {
    const v = playerView(t, p, row.payload);
    return v.rows.some(
      (r, i) =>
        r.remaining > 0 &&
        (r.due || (i === 0 ? v.accepted : "")) &&
        (r.due || v.accepted) < today(),
    );
  }).length;
  return { overduePlayers, tracking: players.length > 0 };
}
