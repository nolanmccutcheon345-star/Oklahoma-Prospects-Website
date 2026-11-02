import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MembershipCard } from "@/components/pricing-cards";
import { buildPublicCatalog, type ClubService } from "./ops";
import { defaultServicePresentation } from "./service-presentation";
import { membershipFeatureAppearance } from "./membership-display";

function service(id: string, name: string, featured: boolean, badge = ""): ClubService {
  return {
    id,
    kind: "cage_plan",
    name,
    discipline: "",
    price: id === "elite-family" ? 185 : id === "all-star" ? 125 : 65,
    minutes: 120,
    purpose: "Household cage membership",
    entry: false,
    group_session: false,
    requires_assessment: false,
    credits: 2,
    remote: 0,
    expires_days: 0,
    hours: 2,
    featured,
    detail: "",
    includes: [],
    unit: "",
    lanes: "",
    period: "/ month",
    hourly: "",
    bestFor: "",
    savings: "",
    perks: ["Included cage time"],
    active: true,
    sort_order: 1,
    presentationRevision: 1,
    presentation: { ...defaultServicePresentation, status: "published", badge },
  };
}

function signals(html: string) {
  return {
    featured: html.includes('data-featured="true"'),
    maroon: html.includes("bg-maroon"),
    navy: html.includes("bg-navy"),
    ring: html.includes("ring-maroon"),
    featuredBadge: html.includes(">Featured<"),
    bestValue: html.includes("Best value"),
  };
}

test("the featured flag alone controls the badge and highlight", () => {
  assert.deepEqual(membershipFeatureAppearance({ featured: false }), {
    featured: false,
    badge: "",
  });
  assert.deepEqual(membershipFeatureAppearance({ featured: true }), {
    featured: true,
    badge: "Featured",
  });
  assert.deepEqual(membershipFeatureAppearance({ featured: true, badge: "  House favorite  " }), {
    featured: true,
    badge: "House favorite",
  });
  assert.deepEqual(membershipFeatureAppearance({ featured: false, badge: "House favorite" }), {
    featured: false,
    badge: "",
  });
});

test("multiple stored flags highlight only the checked plans, with no All-Star fallback", () => {
  const rows = [
    service("prospect", "Prospect", false),
    service("all-star", "All-Star", false),
    service("elite-family", "Elite Family", true, "Family pick"),
  ];
  const catalog = buildPublicCatalog(rows);
  assert.deepEqual(
    catalog.cagePlans.map((plan) => [plan.id, plan.featured, plan.presentation?.badge ?? ""]),
    [
      ["prospect", false, ""],
      ["all-star", false, ""],
      ["elite-family", true, "Family pick"],
    ],
  );
  const appearances = catalog.cagePlans.map((plan) =>
    membershipFeatureAppearance({
      featured: plan.featured,
      badge: plan.presentation?.badge ?? "",
    }),
  );
  assert.deepEqual(appearances, [
    { featured: false, badge: "" },
    { featured: false, badge: "" },
    { featured: true, badge: "Family pick" },
  ]);
});

test("the admin preview card uses the same featured treatment as the public card", () => {
  const stored = [
    service("prospect", "Prospect", true),
    service("all-star", "All-Star", true, "Most asked"),
    service("elite-family", "Elite Family", false),
  ];
  const editing = stored[1];
  const presentation = editing.presentation!;
  const preview = buildPublicCatalog([
    ...stored.filter((row) => row.id !== editing.id),
    {
      ...editing,
      active: true,
      presentationRevision: 1,
      presentation: { ...presentation, status: "published" },
      sort_order: editing.sort_order || 0,
    },
  ]).cagePlans.find((plan) => plan.id === editing.id);
  const published = buildPublicCatalog(stored).cagePlans.find((plan) => plan.id === editing.id);
  assert.ok(preview && published);
  assert.equal(preview.featured, published.featured);
  assert.equal(preview.presentation?.badge ?? "", published.presentation?.badge ?? "");

  for (const plan of [preview, published, ...buildPublicCatalog(stored).cagePlans]) {
    const previewHtml = renderToStaticMarkup(
      createElement(MembershipCard, { plan, preview: true }),
    );
    const publicHtml = renderToStaticMarkup(
      createElement(MembershipCard, { plan, checkoutStatus: "ready" }),
    );
    const previewSignals = signals(previewHtml);
    const publicSignals = signals(publicHtml);
    assert.deepEqual(previewSignals, publicSignals);
    assert.equal(previewSignals.featured, plan.featured);
    assert.equal(previewSignals.maroon, plan.featured);
    assert.equal(previewSignals.ring, plan.featured);
    assert.equal(previewSignals.navy, !plan.featured);
    assert.equal(previewSignals.bestValue, false);
    const badge = plan.presentation?.badge ?? "";
    if (badge) {
      assert.match(previewHtml, new RegExp(`>${badge}<`));
      assert.equal(previewSignals.featuredBadge, false);
    } else {
      assert.equal(previewSignals.featuredBadge, plan.featured);
    }
  }
});
