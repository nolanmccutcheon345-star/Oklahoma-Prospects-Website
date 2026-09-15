// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedState } from "./engine/04-seed.js";
import {
  applyAdvancePo,
  applyCreatePo,
  applySubmitSizes,
  applyUploadPhoto,
  exportPoCsv,
  incompleteSizeSheets,
  nextPoNumber,
  PO_FLOW,
} from "./uniforms.ts";

describe("Uniforms and purchase orders", () => {
  it("warns when a season PO is opened with size sheets still out", () => {
    const state = seedState();
    const team = state.teams[0];
    const pkg = state.uniforms.find((u) => u.id === team.uniformPackageId);
    const missing = incompleteSizeSheets(team, pkg);
    assert.ok(missing.length > 0);
    const blocked = applyCreatePo(state, {
      teamId: team.id,
      supplier: "EvoShield Team Store",
      expectedDelivery: "2026-10-20",
      kind: "season",
      billTo: "club",
      actor: "admin",
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.warn, true);
    assert.ok(blocked.missing.length > 0);
  });

  it("creates a numbered PO when forced and notifies on each status change", () => {
    const state = seedState();
    const team = state.teams[0];
    const first = applyCreatePo(state, {
      teamId: team.id,
      supplier: "EvoShield Team Store",
      expectedDelivery: "2026-10-20",
      kind: "season",
      billTo: "club",
      force: true,
      actor: "admin",
    });
    assert.equal(first.ok, true);
    assert.match(first.po.number, /^PO-\d+$/);
    assert.equal(first.po.status, "draft");
    const before = state.notifications.length;
    const next = applyAdvancePo(state, first.po.id, "admin");
    assert.equal(next.ok, true);
    assert.equal(next.status, "submitted");
    assert.ok(state.notifications.length > before);
    assert.ok(state.notifications.some((n) => /submitted/i.test(n.title) && n.audience === "all"));
    applyAdvancePo(state, first.po.id, "admin");
    applyAdvancePo(state, first.po.id, "admin");
    applyAdvancePo(state, first.po.id, "admin");
    assert.equal(first.po.status, "delivered");
    assert.equal(applyAdvancePo(state, first.po.id, "admin").ok, false);
    assert.equal(PO_FLOW[PO_FLOW.length - 1], "delivered");
  });

  it("rejects a jersey number that is already taken and exports a supplier CSV", () => {
    const state = seedState();
    const team = state.teams[0];
    const player = team.roster.find((p) => !p.order.submitted);
    const taken = String(team.roster.find((p) => p.id !== player.id).number);
    const clash = applySubmitSizes(state, team.id, player.id, taken, { Jersey: "M" });
    assert.equal(clash.ok, false);
    assert.equal(clash.reason, "number");
    const ok = applySubmitSizes(state, team.id, player.id, 99, { Jersey: "M", Pants: "L", Cap: "7", Belt: "Adult S/M" });
    assert.equal(ok.ok, true);
    assert.equal(String(player.number), "99");
    assert.equal(player.order.submitted, true);
    const po = applyCreatePo(state, {
      teamId: team.id,
      supplier: "EvoShield Team Store",
      expectedDelivery: "2026-10-20",
      kind: "reorder",
      reorderReason: "growth",
      billTo: "family",
      playerIds: [player.id],
      actor: "admin",
    });
    assert.equal(po.ok, true);
    const csv = exportPoCsv(state, po.po);
    assert.match(csv, /PO,/);
    assert.match(csv, /99/);
    assert.match(csv, /family/);
    assert.equal(nextPoNumber(state).startsWith("PO-"), true);
  });

  it("stores kit photos off the team record and notifies on a status change", () => {
    const state = seedState();
    const team = state.teams[0];
    applyUploadPhoto(state, team.uniformPackageId, "Helmet", "data:image/svg+xml,test", "admin");
    assert.ok(state.uniformPhotos.some((p) => p.slot === "Helmet" && p.packageId === team.uniformPackageId));
    assert.equal(Object.prototype.hasOwnProperty.call(team, "uniformPhotos"), false);
    const po = applyCreatePo(state, {
      teamId: team.id,
      supplier: "EvoShield Team Store",
      expectedDelivery: "2026-10-20",
      kind: "season",
      billTo: "club",
      force: true,
      actor: "admin",
    });
    applyAdvancePo(state, po.po.id, "admin");
    const ping = state.notifications.find((n) => /submitted/i.test(n.title));
    assert.ok(ping);
    assert.equal(ping.audience, "all");
  });
});
