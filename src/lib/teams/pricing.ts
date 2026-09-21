import { processingInclusiveCents } from "../processing-prices.js";
import type { ClubRecord, Player, Settings, Team } from "./types";

export function roundUp(value: number, step: number) {
  return Math.ceil(value / step) * step;
}

export function teamCostBase(team: Team) {
  const events = team.eventBudget;
  const other =
    team.otherCosts.insurance +
    team.otherCosts.balls +
    team.otherCosts.fields +
    team.otherCosts.admin +
    team.otherCosts.travel;
  return events + other;
}

export function protectedBudget(team: Team, settings: Settings) {
  return teamCostBase(team) * (1 + settings.contingencyPct);
}

export function priceComponents(
  team: Team,
  settings: Settings,
  uniformPrice: number,
  roleType: Player["roleType"] = "full",
) {
  const protectedAmt = protectedBudget(team, settings);
  const teamShare = protectedAmt / settings.fundingPlayers;
  const coachShare = (team.coachMonthly * team.months) / settings.fundingPlayers;
  const membership = settings.membershipMonthly * team.months;
  const orgFee = Math.min(
    settings.orgFeeCeiling,
    Math.max(settings.orgFeeFloor, team.orgFee),
  );
  const teamCostPart = roleType === "po" ? teamShare * 0.7 : teamShare;
  const raw = teamCostPart + coachShare + membership + orgFee + uniformPrice;
  const published = processingInclusiveCents(Math.round(roundUp(raw, settings.roundTo) * 100), Math.max(1, Math.round(settings.roundTo * 100)), 13) / 100;
  const deposit = processingInclusiveCents(Math.round((teamCostPart + orgFee / 2) * 100), Math.max(1, Math.round(settings.roundTo * 100))) / 100;
  return {
    teamCost: teamCostPart,
    coaching: coachShare,
    membership,
    orgFee,
    uniform: uniformPrice,
    raw,
    published,
    deposit,
    protectedAmt,
  };
}

export function publishedPrice(club: ClubRecord, team: Team, player: Player) {
  if (player.feeLock) return player.feeLock.amount;
  const pack = club.uniforms.find((item) => item.id === team.uniformPackageId);
  return priceComponents(team, club.settings, pack?.price ?? 0, player.roleType)
    .published;
}

export function balance(player: Player, signed: number) {
  const paid = player.payments.reduce((sum, row) => sum + row.amount, 0);
  const credit = player.credits.reduce((sum, row) => sum + row.amount, 0);
  return Math.max(0, signed - paid - credit);
}

export function fourLineBreakdown(
  team: Team,
  settings: Settings,
  uniformPrice: number,
  roleType: Player["roleType"],
) {
  const c = priceComponents(team, settings, uniformPrice, roleType);
  return {
    teamAndEvents: c.teamCost,
    coaching: c.coaching,
    program: c.membership + c.orgFee,
    uniform: c.uniform,
  };
}

export function restDays(pitches: number) {
  if (pitches >= 66) return 4;
  if (pitches >= 51) return 3;
  if (pitches >= 36) return 2;
  if (pitches >= 21) return 1;
  return 0;
}

export function docsComplete(player: Player) {
  return (
    player.docs.waiver &&
    player.docs.birthCert &&
    player.docs.insurance &&
    player.docs.physical
  );
}

export function cleared(player: Player) {
  return Boolean(player.agreement.signedAt) && player.depositPaid && docsComplete(player);
}

export function fundingCount(team: Team) {
  return team.roster.filter((p) => !p.withdrawn && p.roleType === "full").length;
}
