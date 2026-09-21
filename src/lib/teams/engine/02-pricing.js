import { processingInclusiveCents } from "../../processing-prices.js";
/* Prospects Team Management OS — paste block 3 of 5: the pricing engine
   Use verbatim. This bills real families. Use exactly as written — do not rewrite or simplify. */

import { TODAY, addDays, clamp, d, fmtDate, iso, monthsBetween, roundTo, uid } from "./00-helpers.js";

function eventById(state, id) {
 return state.catalog.find((e) => e.id === id);
}


function membershipMonths(team, player) {
 const total = Math.max(1, monthsBetween(team.seasonStart, team.seasonEnd));
 if (!player || !player.joinedOn || player.joinedOn <= team.seasonStart) return total;
 if (player.joinedOn > team.seasonEnd) return 1;
 return Math.max(1, monthsBetween(player.joinedOn, team.seasonEnd));
}

/* One pure function decides what a single player owes, so the team
 roll-up and the individual invoice can never drift apart.        */


function seasonPrice(net, step) { return processingInclusiveCents(Math.round(roundTo(net, step) * 100), Math.max(1, Math.round((Number(step) || 1) * 100)), 13) / 100; }

function computedFee(s, p, team, player) {
 if (!player) return seasonPrice(p.perPlayerTeam + p.coachPerPlayer + s.membershipMonthly * p.months + p.orgFee + p.uniformCost, s.roundStep);
 const teamPart = player.roleType === "po" ? p.perPlayerTeam * (s.poTeamCostPct / 100) : p.perPlayerTeam;
 const org = p.orgFee;
 const membership = s.membershipMonthly * membershipMonths(team, player);
 const uniform = player.uniformWaived ? 0 : p.uniformCost;
 return seasonPrice(teamPart + p.coachPerPlayer + membership + org + uniform, s.roundStep);
}

/* What the family actually owes. Once they sign, the number is frozen at the
 figure they agreed to. Later price changes surface as amendments they have
 to accept — they never move a signed fee on their own.                    */


function feeFromPricing(s, p, team, player) {
 if (!player) return computedFee(s, p, team, player);
 if (player.feeLock) return player.feeLock.amount;
 return computedFee(s, p, team, player);
}


function feeDrift(state, team, player) {
 if (!player || !player.feeLock) return 0;
 const now = computedFee(state.settings, priceTeam(state, team), team, player);
 return now - player.feeLock.amount;
}


function lockFee(state, team, player, policyVersion) {
 const p = priceTeam(state, team);
 const s = state.settings;
 return {
  amount: computedFee(s, p, team, player),
  lockedAt: iso(TODAY),
  policyVersion,
  components: {
   team: Math.round(p.perPlayerTeam * (player.roleType === "po" ? s.poTeamCostPct / 100 : 1)),
   coaching: Math.round(p.coachPerPlayer),
   membership: s.membershipMonthly * membershipMonths(team, player),
   program: Math.round(p.orgFee),
   uniform: player.uniformWaived ? 0 : p.uniformCost,
  },
 };
}


const COACH_CREDIT = "Coaching pay applied to season fees";


function seasonLen(team) {
 return Math.max(1, monthsBetween(team.seasonStart, team.seasonEnd));
}


function staffSeasonPay(team, m) {
 return (Number(m.monthly) || 0) * seasonLen(team);
}


function staffChild(team, m) {
 return m.childId ? team.roster.find((pl) => pl.id === m.childId && !pl.withdrawn) || null : null;
}
/* Contractor compensation applied to fees cannot exceed the outstanding fee. */


function maxDivert(state, team, m) {
 const s = state.settings;
 const pay = staffSeasonPay(team, m);
 const kid = staffChild(team, m);
 if (!kid) return 0;
 const owed = Math.max(0, playerFee(state, team, kid) -
  (kid.credits || []).filter((c) => c.note !== COACH_CREDIT).reduce((a, c) => a + c.amount, 0));
 return Math.max(0, Math.min(owed, pay));
}
/* Rebuilds every pay-offset credit from the staff elections so fees, balances
 and cash payouts can never disagree with each other.                       */


function syncStaffOffsets(t) {
 t.roster.forEach((pl) => {
  pl.credits = (pl.credits || []).filter((c) => c.note !== COACH_CREDIT);
  pl.coachChild = null;
 });
 (t.staff || []).forEach((m) => {
  const kid = m.childId ? t.roster.find((pl) => pl.id === m.childId) : null;
  if (!kid) { m.applyAmount = 0; return; }
  kid.coachChild = m.role === "Head coach" ? "head" : "assistant";
  const amt = Math.max(0, Math.round(m.applyAmount || 0));
  if (amt > 0) {
   kid.credits = [...(kid.credits || []), {
    id: uid(), type: "coach pay", amount: amt, note: COACH_CREDIT, date: iso(TODAY),
   }];
  }
 });
}


function staffCash(team, m) {
 return Math.max(0, staffSeasonPay(team, m) - (m.applyAmount || 0));
}


function coachPoolUsed(team) {
 return (team.staff || []).reduce((a, m) => a + (Number(m.monthly) || 0), 0);
}


function pendingAmendment(player) {
 return (player.amendments || []).find((a) => a.status === "pending") || null;
}


function creditTotal(player) {
 return (player.credits || []).reduce((a, c) => a + c.amount, 0);
}


function priceTeam(state, team) {
 const s = state.settings;
 const evs = team.tournamentIds.map((id) => eventById(state, id)).filter(Boolean);
 const entryFees = evs.reduce((a, e) => a + e.fee, 0);
 const other = Object.values(team.otherCosts).reduce((a, b) => a + b, 0);
 const direct = entryFees + other;
 const contingency = direct * (s.contingencyPct / 100);
 const protectedBudget = direct + contingency;
 const months = Math.max(1, monthsBetween(team.seasonStart, team.seasonEnd));
 const perPlayerTeam = protectedBudget / s.fundingPlayers;
 const coachTotal = team.coachMonthly * months;
 const coachPerPlayer = coachTotal / s.fundingPlayers;
 const membershipPerPlayer = s.membershipMonthly * months;
 const pkg = state.uniforms.find((u) => u.id === team.uniformPackageId);
 const uniformCost = pkg ? pkg.price : 0;
 const orgFee = clamp(team.orgFee, s.orgFeeMin, s.orgFeeMax);
 const raw = perPlayerTeam + coachPerPlayer + membershipPerPlayer + orgFee + uniformCost;
 const published = seasonPrice(raw, s.roundStep);
 const publishedNoUniform = seasonPrice(raw - uniformCost, s.roundStep);

 const base = { perPlayerTeam, coachPerPlayer, months, orgFee, uniformCost, published };
 const active = team.roster.filter((pl) => !pl.withdrawn);
 const revenue = active.reduce((a, pl) => a + feeFromPricing(s, base, team, pl), 0);
 const creditsGiven = active.reduce((a, pl) => a + creditTotal(pl), 0);
 const sponsorIncome = (team.sponsors || []).reduce((a, x) => a + x.amount, 0);
 const uniformActual = uniformCost * active.filter((pl) => !pl.uniformWaived).length;
 const facility = s.facilityPerTeamMonth * months;
 const fundedPlayers = active.filter((pl) => pl.coachChild !== "head").length;

 /* forecast until the season is reconciled, then the real number */
 const forecastMargin = revenue + sponsorIncome - creditsGiven - protectedBudget - coachTotal - facility - uniformActual;
 const closed = team.closed;
 const actualSpend = team.actuals
  ? Object.values(team.actuals).reduce((a, b) => a + (Number(b) || 0), 0)
  : null;
 const realizedMargin = closed ? closed.realizedMargin : null;

 return {
  evs, entryFees, other, direct, contingency, protectedBudget, months,
  perPlayerTeam, coachTotal, coachPerPlayer, membershipPerPlayer, uniformCost,
  orgFee, raw, published, publishedNoUniform, roster: active.length, fundedPlayers,
  revenue, creditsGiven, sponsorIncome, uniformActual, facility,
  margin: forecastMargin, forecastMargin, realizedMargin, actualSpend, closed, pkg,
 };
}


function playerFee(state, team, player) {
 return feeFromPricing(state.settings, priceTeam(state, team), team, player);
}


function playerBalance(state, team, player) {
 const fee = playerFee(state, team, player);
 const paid = player.payments.reduce((a, x) => a + x.amount, 0);
 return Math.max(0, fee - creditTotal(player) - paid);
}


function depositFor(state, team, player) {
 if (player?.planLock) return player.planLock.dep;
 const p = priceTeam(state, team);
 const net = roundTo(p.perPlayerTeam + p.orgFee * 0.5, 25);
 return player?.feeLock ? net : processingInclusiveCents(Math.round(net * 100), 2500) / 100;
}


function firstEventDate(state, team) {
 const evs = team.tournamentIds.map((id) => eventById(state, id)).filter(Boolean);
 if (!evs.length) return null;
 return evs.map((e) => e.start).sort()[0];
}


function payoffDeadline(state, team) {
 const f = firstEventDate(state, team);
 if (!f) return null;
 return addDays(d(f), -7 * state.settings.paidInFullWeeks);
}


function lockPlan(state, team, player) {
 const built = computePlan(state, team, player);
 return { dep: built.dep, deadline: built.deadline ? iso(built.deadline) : null, planType: player.planType,
  rows: built.rows.map((r) => ({ label: r.label, due: r.due, amount: r.amount })), createdAt: iso(TODAY) };
}

function buildPlan(state, team, player) {
 const fee = playerFee(state, team, player);
 const credits = creditTotal(player);
 const net = Math.max(0, fee - credits);
 const dep = Math.min(net, depositFor(state, team, player));
 const deadline = payoffDeadline(state, team);
 const paid = player.payments.reduce((a, x) => a + x.amount, 0);
 const rows = [];
 rows.push({
  label: "Roster deposit",
  due: "On invite acceptance",
  amount: dep,
  status: player.depositPaid ? "paid" : "due",
 });
 const remaining = net - dep;
 if (remaining <= 0) return { fee, credits, net, dep, rows, deadline, paid, remaining: 0 };
 if (!deadline) {
  rows.push({ label: "Balance", due: "Set after schedule is published", amount: remaining, status: "pending" });
  return { fee, credits, net, dep, rows, deadline, paid, remaining };
 }
 if (player.planType === "full") {
  rows.push({
   label: "Balance in full",
   due: fmtDate(iso(addDays(deadline, -14))),
   amount: remaining,
   status: paid >= net ? "paid" : "scheduled",
  });
  return { fee, credits, net, dep, rows, deadline, paid, remaining };
 }
 const dates = [];
 let cur = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 1);
 while (cur <= deadline && dates.length < 12) {
  dates.push(new Date(cur));
  cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
 }
 if (!dates.length) {
  rows.push({ label: "Balance due now", due: "Immediately — inside the payoff window", amount: remaining, status: "urgent" });
  return { fee, credits, net, dep, rows, deadline, paid, remaining };
 }
 const each = Math.floor((remaining / dates.length) * 100) / 100;
 dates.forEach((dt, i) => {
  const amt = i === dates.length - 1 ? +(remaining - each * (dates.length - 1)).toFixed(2) : each;
  rows.push({ label: `Installment ${i + 1} of ${dates.length}`, due: fmtDate(iso(dt)), amount: amt, status: "scheduled" });
 });
 return { fee, credits, net, dep, rows, deadline, paid, remaining };
}

/* ---------------------- calendar, payouts, audit ---------------------- */


function computePlan(state, team, player) {
 const fee = playerFee(state, team, player);
 const credits = creditTotal(player);
 const net = Math.max(0, fee - credits);
 const dep = Math.min(net, depositFor(state, team, player));
 const deadline = payoffDeadline(state, team);
 const paid = player.payments.reduce((a, x) => a + x.amount, 0);
 const rows = [];
 rows.push({
  label: "Roster deposit",
  due: "On invite acceptance",
  amount: dep,
  status: player.depositPaid ? "paid" : "due",
 });
 const remaining = net - dep;
 if (remaining <= 0) return { fee, credits, net, dep, rows, deadline, paid, remaining: 0 };
 if (!deadline) {
  rows.push({ label: "Balance", due: "Set after schedule is published", amount: remaining, status: "pending" });
  return { fee, credits, net, dep, rows, deadline, paid, remaining };
 }
 if (player.planType === "full") {
  rows.push({
   label: "Balance in full",
   due: fmtDate(iso(addDays(deadline, -14))),
   amount: remaining,
   status: paid >= net ? "paid" : "scheduled",
  });
  return { fee, credits, net, dep, rows, deadline, paid, remaining };
 }
 const dates = [];
 let cur = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 1);
 while (cur <= deadline && dates.length < 12) {
  dates.push(new Date(cur));
  cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
 }
 if (!dates.length) {
  rows.push({ label: "Balance due now", due: "Immediately — inside the payoff window", amount: remaining, status: "urgent" });
  return { fee, credits, net, dep, rows, deadline, paid, remaining };
 }
 const each = Math.floor((remaining / dates.length) * 100) / 100;
 dates.forEach((dt, i) => {
  const amt = i === dates.length - 1 ? +(remaining - each * (dates.length - 1)).toFixed(2) : each;
  rows.push({ label: `Installment ${i + 1} of ${dates.length}`, due: fmtDate(iso(dt)), amount: amt, status: "scheduled" });
 });
 return { fee, credits, net, dep, rows, deadline, paid, remaining };
}

/* ---------------------- calendar, payouts, audit ---------------------- */

export { COACH_CREDIT, buildPlan, coachPoolUsed, computePlan, computedFee, creditTotal, depositFor, eventById, feeDrift, feeFromPricing, firstEventDate, lockFee, lockPlan, maxDivert, membershipMonths, payoffDeadline, pendingAmendment, playerBalance, playerFee, priceTeam, seasonLen, staffCash, staffChild, staffSeasonPay, syncStaffOffsets };
