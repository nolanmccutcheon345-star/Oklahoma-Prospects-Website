import assert from "node:assert/strict";
import test from "node:test";
import { scopeForViewer } from "./access";
import { hydrateWorkingFile, mergeScopedFile } from "./file";
import { seedDevelopment } from "./seed";

const seed = seedDevelopment();

test("parent message lands; coach-private note and staff notes stay", () => {
  const parent = scopeForViewer(
    { role: "parent", email: "marisol.navarro@example.com", name: "Marisol Navarro", playerName: "" },
    seed,
  );
  const scoped = {
    ...seed,
    athletes: seed.athletes.filter((row) => row.id === "a-down").map((row) => ({ ...row, notes: "" })),
    messages: [
      {
        id: "msg-new",
        athleteId: "a-down",
        fromName: "Marisol Navarro",
        fromRole: "parent" as const,
        body: "We will rest Thursday.",
        createdAt: "2026-09-14",
        channel: "family" as const,
      },
      ...seed.messages.filter((row) => row.athleteId === "a-down" && row.channel !== "coach"),
    ],
    interventions: [],
    diagnose: [],
    gameIq: [],
  };
  const merged = mergeScopedFile(seed, scoped, parent);
  assert.ok(merged.messages.some((row) => row.id === "msg-new"));
  assert.ok(merged.messages.some((row) => row.channel === "coach" && /UCL/i.test(row.body)));
  assert.ok(merged.athletes.some((row) => row.id === "a-full"));
  assert.ok(merged.interventions.length >= seed.interventions.length);
  const eli = merged.athletes.find((row) => row.id === "a-down");
  assert.ok(eli?.notes);
});

test("parent cannot inject another family's athlete", () => {
  const parent = scopeForViewer(
    { role: "parent", email: "marisol.navarro@example.com", name: "Marisol", playerName: "" },
    seed,
  );
  const incoming = {
    ...seed,
    athletes: [
      ...seed.athletes.filter((row) => row.id === "a-down"),
      { ...seed.athletes.find((row) => row.id === "a-full")!, id: "a-hack", familyId: "f-navarro" },
    ],
    velocity: [{ id: "v-hack", athleteId: "a-full", date: "2026-09-14", mph: 99 }],
  };
  const merged = mergeScopedFile(seed, incoming, parent);
  assert.equal(merged.athletes.some((row) => row.id === "a-hack"), false);
  assert.equal(merged.velocity.some((row) => row.id === "v-hack"), false);
});

test("admin tracking import replaces that athlete's velo and keeps everyone else", () => {
  const admin = scopeForViewer(
    { role: "admin", email: "nolanmccutcheon@icloud.com", name: "Nolan", playerName: "" },
    seed,
  );
  const incoming = {
    ...seed,
    velocity: [{ id: "v-new", athleteId: "a-empty", date: "2026-09-14", mph: 74 }, ...seed.velocity],
  };
  const merged = mergeScopedFile(seed, incoming, admin);
  assert.ok(merged.velocity.some((row) => row.id === "v-new"));
  assert.equal(merged.athletes.length, seed.athletes.length);
});

test("hydrate fills missing keys without resurrecting emptied arrays", () => {
  const hydrated = hydrateWorkingFile({ messages: [] }, seed);
  assert.deepEqual(hydrated.messages, []);
  assert.ok(hydrated.athletes.length > 0);
  assert.ok(Array.isArray(hydrated.calibrationScores));
});

test('v2: every new or changed cohort member must be assigned to the coach',()=>{
 const scope={role:'coach' as const,coachId:'fixture',athleteIds:new Set(['a-down']),familyIds:new Set(['f-navarro']),includeCoachNotes:true,includeCoachOps:true,includeStaffOps:false};
 const full={...seed,cohorts:[{id:'existing',name:'Existing',athleteIds:['a-down']}]};
 assert.throws(()=>mergeScopedFile(full,{...full,cohorts:[{id:'new',name:'New',athleteIds:['a-down','a-full']}]},scope),/assigned athletes/);
 assert.throws(()=>mergeScopedFile(full,{...full,cohorts:[{id:'existing',name:'Edited',athleteIds:['a-down','a-full']}]},scope),/assigned athletes/);
 assert.deepEqual(mergeScopedFile(full,{...full,cohorts:[{id:'new',name:'New',athleteIds:['a-down']}]},scope).cohorts.map(c=>c.id),['new']);
});
