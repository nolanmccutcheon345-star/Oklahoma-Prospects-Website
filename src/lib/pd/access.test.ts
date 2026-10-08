import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAthleteAccess,
  authorizeMessage,
  canAccessAthlete,
  filterDevelopmentData,
  scopeForViewer,
  type PdViewer,
} from "./access";
import { seedDevelopment } from "./seed";

const data = seedDevelopment();

test("training coach directory omits private contacts except the coach's own record", () => {
  const full = seedDevelopment();
  Object.assign(full.coaches[0], { privateContactToken: "private-directory-token" });
  for (const role of ["parent", "player"] as const) {
    const filtered = filterDevelopmentData(full, scopeForViewer(viewer({role,email:"marisol.navarro@example.com"}), full));
    assert.ok(filtered.coaches.every(c => c.email === ""));
    assert.doesNotMatch(JSON.stringify(filtered.coaches), /private-directory-token/);
    assert.deepEqual(filtered.coaches.map(c => c.name), full.coaches.map(c => c.name));
  }
  const own = full.coaches[0];
  const filtered = filterDevelopmentData(full, scopeForViewer(viewer({role:"coach",email:own.email}), full));
  assert.equal(filtered.coaches.find(c=>c.id===own.id)?.email, own.email);
  assert.ok(filtered.coaches.filter(c=>c.id!==own.id).every(c=>c.email===""));
  assert.doesNotMatch(JSON.stringify(filtered.coaches), /private-directory-token/);
  const admin = filterDevelopmentData(full, scopeForViewer(viewer({role:"admin",email:"owner@example.invalid"}), full));
  assert.deepEqual(admin.coaches, full.coaches);
  own.active = false;
  const inactive = filterDevelopmentData(full, scopeForViewer(viewer({role:"coach",email:own.email}), full));
  assert.equal(inactive.coaches.find(c=>c.id===own.id)?.email, own.email);
  assert.equal(canAccessAthlete(scopeForViewer(viewer({role:"coach",email:own.email}), full), "a-down"), false);
});

function viewer(partial: Partial<PdViewer> & Pick<PdViewer, "role" | "email">): PdViewer {
  return { name: "", playerName: "", ...partial };
}

test("parent of Eli cannot fetch Ryder even by id", () => {
  const scope = scopeForViewer(
    viewer({ role: "parent", email: "marisol.navarro@example.com", name: "Marisol Navarro" }),
    data,
  );
  assert.equal(canAccessAthlete(scope, "a-down"), true);
  assert.equal(canAccessAthlete(scope, "a-full"), false);
  assert.throws(() => assertAthleteAccess(scope, "a-full"), /Forbidden/);
  const filtered = filterDevelopmentData(data, scope);
  assert.deepEqual(
    filtered.athletes.map((row) => row.id),
    ["a-down"],
  );
  assert.equal(
    filtered.athletes.some((row) => row.id === "a-full"),
    false,
  );
});

test("coach-private notes never reach a parent payload", () => {
  const scope = scopeForViewer(
    viewer({ role: "parent", email: "marisol.navarro@example.com" }),
    data,
  );
  const filtered = filterDevelopmentData(data, scope);
  assert.equal(
    filtered.messages.some((row) => row.channel === "coach"),
    false,
  );
  assert.equal(
    filtered.messages.some((row) => /UCL/i.test(row.body)),
    false,
  );
  assert.ok(filtered.messages.some((row) => /recover/i.test(row.body)));
  assert.equal(filtered.athletes[0]?.notes, "");
});

test("staff still receive the UCL private note", () => {
  const scope = scopeForViewer(
    viewer({ role: "coach", email: "stevemccutcheon89@gmail.com", name: "Coach Steve" }),
    data,
  );
  const filtered = filterDevelopmentData(data, scope);
  assert.ok(filtered.messages.some((row) => row.channel === "coach" && /UCL/i.test(row.body)));
  assert.ok(filtered.athletes.some((row) => row.id === "a-full"));
});

test("unmatched parent fails closed — no family's file", () => {
  const scope = scopeForViewer(
    viewer({ role: "parent", email: "stranger@example.com", playerName: "Ryder McCabe" }),
    data,
  );
  assert.equal(canAccessAthlete(scope, "a-full"), false);
  const filtered = filterDevelopmentData(data, scope);
  assert.equal(filtered.athletes.length, 0);
  assert.equal(filtered.messages.length, 0);
});

test("player name is not an access key for another family's athlete", () => {
  const scope = scopeForViewer(
    viewer({
      role: "player",
      email: "stranger@example.com",
      playerName: "Ryder McCabe",
    }),
    data,
  );
  assert.equal(canAccessAthlete(scope, "a-full"), false);
});

test("parent cannot write a coach-channel note", () => {
  const scope = scopeForViewer(
    viewer({ role: "parent", email: "marisol.navarro@example.com" }),
    data,
  );
  assert.throws(
    () => authorizeMessage(scope, { athleteId: "a-down", body: "secret", channel: "coach" }),
    /Forbidden/,
  );
  const family = authorizeMessage(scope, {
    athleteId: "a-down",
    body: "We will rest Thursday.",
    channel: "family",
  });
  assert.equal(family.channel, "family");
});
test("player training payload keeps own schedule and programs without household finances", () => {
  const full = seedDevelopment();
  const self = full.athletes.find((row) => row.id === "a-down")!;
  const family = full.families.find((row) => row.id === self.familyId)!;
  family.plan = { type: "performance", lessonCredits: 987, lessons: 25 };
  family.athleteIds.push("unrelated-sibling");
  full.plans.push({
    id: "assigned-player-plan",
    athleteId: self.id,
    focus: "Mechanics",
    constraint: "Balance",
    status: "active",
  });
  full.throwingAssignments.push({
    id: "assigned-throwing-plan",
    athleteId: self.id,
    templateId: "synthetic-template",
    dayType: "Recovery",
  });
  Object.assign(family, { billingAccount: "private-billing-token" });
  full.bookings.push({
    id: "private-appointment",
    athleteId: self.id,
    serviceId: full.services[0].id,
    date: "2030-05-01",
    time: "16:00",
    status: "paid",
    price: 54321,
    coachId: self.coachIds[0],
    payout: "paid",
    rescheduledMonth: "2030-05",
  });
  Object.assign(full.bookings.at(-1)!, { providerPaymentId: "private-payment-token" });
  const scope = scopeForViewer(
    viewer({
      role: "player",
      email: family.email,
      playerName: `${self.firstName} ${self.lastName}`,
    }),
    full,
  );
  const filtered = filterDevelopmentData(full, scope);
  assert.deepEqual(
    filtered.athletes.map((row) => row.id),
    [self.id],
  );
  const appointment = filtered.bookings.find((row) => row.id === "private-appointment")!;
  assert.equal(appointment.date, "2030-05-01");
  assert.equal(appointment.time, "16:00");
  assert.equal(appointment.coachId, self.coachIds[0]);
  assert.equal(appointment.price, 0);
  assert.equal(appointment.payout, undefined);
  assert.equal(appointment.rescheduledMonth, undefined);
  assert.equal(filtered.families[0].plan?.lessonCredits, 0);
  assert.equal(filtered.families[0].plan?.type, "none");
  assert.equal(filtered.families[0].plan?.lessons, undefined);
  assert.deepEqual(filtered.families[0].athleteIds, [self.id]);
  assert.equal(filtered.packages.length, 0);
  assert.equal(filtered.memberships.length, 0);
  assert.equal(filtered.waitlist.length, 0);
  assert.ok(filtered.services.every((row) => row.price === 0));
  assert.deepEqual(
    filtered.plans,
    full.plans.filter((row) => row.athleteId === self.id),
  );
  assert.deepEqual(
    filtered.throwingAssignments,
    full.throwingAssignments.filter((row) => row.athleteId === self.id),
  );
  assert.doesNotMatch(
    JSON.stringify(filtered),
    /private-billing-token|private-payment-token|54321|unrelated-sibling/,
  );
  const parent = filterDevelopmentData(
    full,
    scopeForViewer(viewer({ role: "parent", email: family.email }), full),
  );
  assert.equal(parent.families.find((row) => row.id === family.id)?.plan?.lessonCredits, 987);
  assert.equal(parent.bookings.find((row) => row.id === "private-appointment")?.price, 54321);
  assert.equal(full.bookings.at(-1)?.price, 54321);
});

test("linked player family projection omits guardian contacts while retaining client self lookup", () => {
  const full = seedDevelopment();
  const self = full.athletes.find(a=>a.id==="a-down")!;
  const home = full.families.find(f=>f.id===self.familyId)!;
  home.phone = "private-parent-phone";
  home.parentName = "private-parent-name";
  home.plan = {type:"performance", tier:"performance", lessonCredits:99};
  const me = viewer({role:"player",email:"player@example.invalid", householdEmails:[home.email],playerName:`${self.firstName} ${self.lastName}`});
  const scoped = filterDevelopmentData(full, scopeForViewer(me, full));
  const projected = scoped.families[0];
  assert.equal(projected.email, me.email);
  assert.equal(projected.parentName, "");
  assert.equal(projected.phone, "");
  assert.equal(projected.plan?.tier, undefined);
  assert.equal(canAccessAthlete(scopeForViewer(me, scoped), self.id), true);
  assert.doesNotMatch(JSON.stringify(projected), /private-parent/);
  assert.equal(home.phone, "private-parent-phone");
});
