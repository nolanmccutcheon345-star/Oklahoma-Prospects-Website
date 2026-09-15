/* Prospects Team Management OS — paste block 4 of 5: permissions, documents and pitch-count rules
   Use verbatim. Who may see what, the four required documents, and MLB Pitch Smart rest days. */

import { TODAY, addDays, d, iso, money, uid } from "./00-helpers.js";
import { buildPlan, payoffDeadline, playerBalance } from "./02-pricing.js";

function perms(role) {
 return {
  admin: role === "admin",
  coach: role === "coach",
  parent: role === "parent",
  player: role === "player",
  seeMargin: role === "admin",
  /* Team-level dollars — budgets, entry fees, published fees, other families'
   balances — belong to admin alone. Coaches and families see only what is
   personally theirs: a coach's own pay, a family's own invoice.          */
  seeTeamMoney: role === "admin",
  seeOwnMoney: role === "admin" || role === "coach" || role === "parent",
  seeAnyPrice: role === "admin" || role === "parent",
  seeOtherFamilies: role === "admin",
 };
}

/* ---------------------- pitch counts ---------------------- */


const PITCH_LIMIT = { "12U": 85, "13U": 95, "14U": 95, "15U": 105, "16U": 105, "17U": 105, "18U": 105 };


function restDays(p) {
 if (p >= 66) return 4;
 if (p >= 51) return 3;
 if (p >= 36) return 2;
 if (p >= 21) return 1;
 return 0;
}


function pitcherStatus(team, playerId) {
 const log = (team.pitchLog || [])
  .filter((l) => l.playerId === playerId)
  .sort((a, b) => b.date.localeCompare(a.date));
 if (!log.length) return { available: true, last: null, need: 0, readyOn: null };
 const last = log[0];
 const need = restDays(last.pitches);
 const ready = addDays(d(last.date), need);
 const today = new Date(TODAY);
 today.setHours(0, 0, 0, 0);
 return { available: today >= ready, last, need, readyOn: iso(ready) };
}


const DOC_LABELS = { waiver: "Liability waiver", birthCert: "Birth certificate", insurance: "Insurance card", physical: "Sports physical" };


function missingDocs(player) {
 const docs = player.docs || {};
 return Object.keys(DOC_LABELS).filter((k) => !docs[k]);
}


function attention(state) {
 const items = [];
 state.teams.forEach((t) => {
  const dl = payoffDeadline(state, t);
  t.roster.forEach((pl) => {
   const plan = buildPlan(state, t, pl);
   const paid = pl.payments.reduce((a, x) => a + x.amount, 0);
   if (!pl.depositPaid) items.push({ kind: "Money", teamId: t.id, text: `${pl.name} on ${t.name} has not paid the deposit` });
   else if (dl && playerBalance(state, t, pl) > 0 && TODAY > dl) items.push({ kind: "Money", teamId: t.id, text: `${pl.name} on ${t.name} is ${money(playerBalance(state, t, pl))} past due` });
   if (!pl.agreement) items.push({ kind: "Agreement", teamId: t.id, text: `${pl.name} on ${t.name} has not signed the team agreement` });
  });
  const miss = t.roster.filter((pl) => missingDocs(pl).length > 0).length;
  if (miss) items.push({ kind: "Docs", teamId: t.id, text: `${miss} player${miss > 1 ? "s" : ""} on ${t.name} missing paperwork` });
  const sizes = t.roster.filter((pl) => !pl.order.submitted).length;
  if (sizes) items.push({ kind: "Uniforms", teamId: t.id, text: `${sizes} uniform order${sizes > 1 ? "s" : ""} outstanding on ${t.name}` });
  if (t.tournamentIds.length === 0) items.push({ kind: "Schedule", teamId: t.id, text: `${t.name} has no events on the schedule` });
  if (t.roster.length < 10) items.push({ kind: "Roster", teamId: t.id, text: `${t.name} is under the ten-player funding line at ${t.roster.length}` });
 });
 return items;
}


function gcUrl(team) {
 return team.gameChanger.connected ? `https://web.gc.com/teams/${team.gameChanger.teamId}` : null;
}

/* ---------------------- cage credits ---------------------- */


function creditsUsed(state, scope, id, wk) {
 return state.bookings
  .filter((b) => b.scope === scope && b.ownerId === id && b.week === wk && !b.overage)
  .reduce((a, b) => a + b.hours, 0);
}


function overageHours(state, scope, id, wk) {
 return state.bookings
  .filter((b) => b.scope === scope && b.ownerId === id && b.week === wk && b.overage)
  .reduce((a, b) => a + b.hours, 0);
}

/* ---------------------- styles ---------------------- */


function logAudit(st, actor, action, detail) {
 if (!st.audit) st.audit = [];
 st.audit.unshift({ id: uid(), ts: Date.now(), actor, action, detail });
 if (st.audit.length > 300) st.audit.length = 300;
}


function notify(st, teamId, title, body, kind, audience) {
 const m = st.settings.messaging || {};
 const channels = [m.email && "email", m.sms && "text"].filter(Boolean);
 st.notifications.unshift({
  id: uid(), ts: Date.now(), teamId, kind: kind || "info", title,
  body,
  audience: audience || "admin",
  channels,
  delivered: false,
 });
}

/* ---------------------- permissions ----------------------
 Players never see money. Parents see only their own player's
 fees — never team budgets, event fees or other families.      */


function visibleNotes(state, audience) {
 return (state.notifications || []).filter((n) => {
  const a = n.audience || "admin";
  return audience === "admin" || a === "all" || a === audience;
 });
}

/* ---------------------- permissions ----------------------
 Players never see money. Parents see only their own player's
 fees — never team budgets, event fees or other families.      */

export { DOC_LABELS, PITCH_LIMIT, attention, creditsUsed, gcUrl, logAudit, missingDocs, notify, overageHours, perms, pitcherStatus, restDays, visibleNotes };
