import test from "node:test";
import assert from "node:assert/strict";
import {
  expandAgeBands,
  mapAppliesToContext,
  normalizeCeilingRefs,
  normalizeSeedRecord,
  resolveSeedSuggestions,
} from "./seed-normalize";

test("seed import always preserves DRAFT/ESTIMATE and nulls blocked values",()=>{
  const row=normalizeSeedRecord({
    id:"THR-X",
    version:1,
    status:"ACTIVE",
    data_label:"VERIFIED",
    age_band:"AB11+",
    throws:"REQUIRES APPROVED AGE-BAND CEILING BEFORE ACTIVATION",
    nested:{rest:"REQUIRES APPROVED AGE-BAND CEILING BEFORE ACTIVATION"},
  });
  assert.equal(row.status,"DRAFT");
  assert.equal(row.data_label,"ESTIMATE");
  assert.equal(row.throws,null);
  assert.deepEqual(row.nested,{rest:null});
  assert.deepEqual(row.blocked_fields,["nested.rest","throws"]);
});

test("age shorthand and ceiling placeholders normalize deterministically",()=>{
  assert.deepEqual(expandAgeBands("AB13+"),["agp_13u-14u","agp_15u-17u"]);
  assert.deepEqual(
    normalizeCeilingRefs(["cap_ba-nonpitch-throws-day-<band>"],"agp_15u-17u"),
    ["cap_ba-nonpitch-throws-day-15u-17u"],
  );
});

const ctx=(ageBand:TeamDevAgeBand,level:TeamDevLevel,sport:TeamDevSuggestionContext["sport"]="baseball",phase:TeamDevSuggestionContext["phase"]="PHS-OFF",position="P"):TeamDevSuggestionContext=>({ageBand,level,sport,phase,position});

test("known cross-band mapping defects are corrected at resolution time",()=>{
  assert.deepEqual(
    resolveSeedSuggestions({id:"MAP-05",suggest:["THR-BB-PIT-01","STR-INT-01","ARM-RTN-01"]},ctx("agp_13u-14u","LVL-DEV")),
    ["THR-BB-PIT-01","ARM-RTN-01","STR-EA-01"],
  );
  assert.deepEqual(
    resolveSeedSuggestions({id:"MAP-09",suggest:["THR-BB-PIT-02","STR-HS-01","ARM-RTN-03"]},ctx("agp_15u-17u","LVL-ADV")),
    ["THR-BB-PIT-02","ARM-RTN-03","STR-HSA-01"],
  );
  assert.deepEqual(
    resolveSeedSuggestions({id:"MAP-12",suggest:["THR-BB-OFF-01","STR-FND-01","ARM-MOB-01"]},ctx("agp_15u-17u","LVL-ELT","baseball","PHS-POST","OF")),
    ["THR-BB-OFF-01","ARM-MOB-01"],
  );
});

test("additional deterministic appendix mismatches are removed",()=>{
  assert.deepEqual(
    resolveSeedSuggestions({id:"MAP-13",suggest:["THR-SB-OVH-01","STR-FND-01","THR-SB-ARM-01","DRL-SB-OT-01"]},ctx("agp_6u-8u","LVL-FND","softball","PHS-OFF","ALL")),
    ["THR-SB-OVH-01","STR-FND-01","DRL-SB-OT-01"],
  );
  assert.deepEqual(
    resolveSeedSuggestions({id:"MAP-17",suggest:["THR-SB-ARM-01","STR-INT-01"]},ctx("agp_15u-17u","LVL-ELT","softball","PHS-OFF","P")),
    ["THR-SB-ARM-01","STR-HSA-01"],
  );
  assert.deepEqual(
    resolveSeedSuggestions({id:"MAP-20",suggest:["THR-BB-REC-01","ARM-RTN-02"]},ctx("agp_13u-14u","LVL-ADV","softball","PHS-COMP","OF")),
    ["ARM-RTN-02"],
  );
  assert.deepEqual(
    resolveSeedSuggestions({id:"MAP-19",suggest:["STR-HSA-01","THR-SB-POS-01"]},ctx("agp_15u-17u","LVL-ELT","softball","PHS-OFF","OF")),
    ["STR-HSA-01"],
  );
});

test("map matching expands ANY and shorthand without hard-coded UI logic",()=>{
  assert.equal(mapAppliesToContext(
    {id:"MAP-X",sport:"both",age_band:["ANY"],level:["ANY"],position:["ALL"],phase:["ANY"]},
    ctx("agp_15u-17u","LVL-ADV","softball","PHS-COMP","C"),
  ),true);
});
