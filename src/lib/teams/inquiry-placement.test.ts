import assert from "node:assert/strict";
import test from "node:test";
import { assertTeamInquiryPlacement } from "./inquiry-placement";
import type { Team } from "./types";
const team = { id:"team-12", sport:"softball", age:"12U",closed:false,seasonEnd:"2027-08-01" } as Team;
const inquiry = {sport:"Softball",age:"12U",preferredTeamId:"team-12",preferredCoachId:"coach-2"};

test("same sport and age with the requested team can advance", () => {
  assert.doesNotThrow(()=>assertTeamInquiryPlacement(inquiry,team,false,"2026-10-08"));
  assert.doesNotThrow(()=>assertTeamInquiryPlacement({...inquiry,preferredTeamId:""},team,false,"2026-10-08"));
});
test("owner stages cannot silently change team sport, age or assign closed/expired seasons", () => {
  for(const request of [
    {...inquiry,sport:"Baseball"},
    {...inquiry,sport:""},
    {...inquiry,age:"14U"},
    {...inquiry,age:""},
  ]) assert.throws(()=>assertTeamInquiryPlacement(request,team,false,"2026-10-08"),/sport and age/);
  for(const option of [
    {...team, closed:true},
    {...team,seasonEnd:"2025-08-01"},
    {...team,seasonEnd:"not-a-date"},
  ]) assert.throws(()=>assertTeamInquiryPlacement(inquiry,option,false,"2026-10-08"),/active team/);
});
test("owner must explicitly acknowledge a family team preference override",()=>{
  const other={...team,id:"team-12-b"};
  assert.throws(()=>assertTeamInquiryPlacement(inquiry,other,false,"2026-10-08"),/requested another team/);
  assert.doesNotThrow(()=>assertTeamInquiryPlacement(inquiry,other,true,"2026-10-08"));
  assert.throws(()=>assertTeamInquiryPlacement({...inquiry,sport:"Baseball"},other,true,"2026-10-08"),/sport and age/);
});
