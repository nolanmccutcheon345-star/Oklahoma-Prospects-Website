// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedState } from "./engine/04-seed.js";
import {
  FILL_TARGET,
  alumniPublic,
  analyticsOf,
  applyChaseAgreements,
  applyMakeOffer,
  applyPublishPolicy,
  applySetLeadScores,
  applySetLeadStage,
  agreementsOf,
  scorecardFor,
} from "./program.ts";

function club() {
  return seedState();
}

describe("Tryouts and offers", () => {
  it("moves a prospect through the funnel and an offer creates a team invite", () => {
    const state = club();
    const lead = state.leads.find((l) => l.status === "lead") || state.leads[0];
    applySetLeadStage(state, lead.id, "registered", "admin");
    applySetLeadStage(state, lead.id, "evaluated", "admin");
    applySetLeadScores(
      state,
      lead.id,
      { hit: 55, power: 50, run: 60, arm: 55, field: 50, makeup: 60 },
      "admin",
    );
    assert.equal(lead.scores.hit, 55);
    assert.equal(lead.scores.makeup, 60);
    const team = state.teams.find((t) => t.id === "t14f");
    const before = team.invites.length;
    const offer = applyMakeOffer(state, lead.id, team.id, "admin");
    assert.equal(offer.ok, true);
    assert.equal(lead.status, "offer");
    assert.equal(team.invites.length, before + 1);
    const invite = team.invites.find((i) => i.id === offer.inviteId);
    assert.equal(invite.name, lead.name);
    assert.equal(invite.email, lead.email);
    assert.equal(invite.status, "sent");
  });
});

describe("Alumni, scorecard, analytics", () => {
  it("publishes alumni counts only when they are above zero", () => {
    const state = club();
    const rows = alumniPublic(state.alumni);
    assert.ok(rows.every((r) => r.count > 0));
    assert.ok(!rows.some((r) => r.kind === "pro"));
    assert.ok(rows.some((r) => r.kind === "college" && r.count === 3));
    assert.ok(rows.some((r) => r.kind === "draft" && r.count === 1));
    assert.equal(alumniPublic([]).length, 0);
    assert.equal(alumniPublic([{ kind: "college" }, { kind: "college" }]).length, 1);
  });

  it("flags more than one mid-season withdrawal and collections under 70%", () => {
    const state = club();
    const team = state.teams.find((t) => t.id === "t14f");
    team.roster[1].withdrawn = "2026-09-10";
    team.roster[2].withdrawn = "2026-09-12";
    const card = scorecardFor(state, team);
    assert.equal(card.flagWithdrawals, true);
    assert.ok(card.collection < 0.7);
    assert.equal(card.flagCollections, true);
    assert.equal(FILL_TARGET, 14);
    assert.ok(card.fillPct <= 1);
    const w = card.record.w;
    const l = card.record.l;
    assert.ok(w + l >= 0);
  });

  it("reports fill, margin, funnel conversion, and cost per acquired player", () => {
    const state = club();
    state.settings.acquisitionSpend = 2400;
    const a = analyticsOf(state);
    assert.ok(a.fill >= 0);
    assert.ok(a.margins.length === state.teams.length);
    assert.ok(a.funnel.entered >= 1);
    assert.ok(a.funnel.accepted >= 1);
    assert.equal(a.cpa, 2400 / a.funnel.accepted);
  });
});

describe("Agreements stay on the version that was signed", () => {
  it("publishing a new policy does not rewrite existing signatures", () => {
    const state = club();
    const player = state.teams[0].roster.find((p) => p.agreement);
    const stamped = player.agreement.version;
    const first = state.settings.policy.version;
    applyPublishPolicy(state, state.settings.policy.text + "\n8. Added later.", "admin");
    assert.equal(state.settings.policy.version, first + 1);
    assert.equal(player.agreement.version, stamped);
    const { unsigned } = agreementsOf(state);
    assert.ok(unsigned.length > 0);
    const chased = applyChaseAgreements(state, "admin");
    assert.equal(chased.count, unsigned.length);
  });
});
