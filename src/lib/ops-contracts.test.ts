import test from "node:test";
import assert from "node:assert/strict";
import { accountInput, serviceInput, staffInput } from "./ops-contracts";

test("office mutations reject malformed amounts, roles, privileges and split assignments", () => {
  const service = {kind:"lesson",name:"Assessment",discipline:"Pitching",price:149,minutes:75,
    purpose:"Assessment",entry:true,group_session:false,requires_assessment:false,credits:0,remote:0,
    expires_days:0,hours:0,featured:false,detail:"",includes:[],unit:"",lanes:"",period:"",hourly:"",
    bestFor:"",savings:"",perks:[],active:true};
  assert.equal(serviceInput.parse(service).price,149);
  assert.equal(serviceInput.parse({...service,price:149.50}).price,149.50);
  for (const price of [-1,149.501,Infinity,"149"]) assert.throws(()=>serviceInput.parse({...service,price}));
  assert.throws(()=>serviceInput.parse({...service,active:"false"}));
  const account={name:"Coach",email:"coach@example.invalid",role:"coach",playerName:""};
  assert.throws(()=>accountInput.parse({...account,emailVerified:true}));
  assert.throws(()=>accountInput.parse({...account,role:"owner"}));
  assert.throws(()=>accountInput.parse({...account,password:"short"}));
  const staff={name:"Coach",email:"coach@example.invalid",phone:"",role:"coach",access_notes:"",active:true};
  for (const profitSplit of [-1,101,60.5]) assert.throws(()=>staffInput.parse({...staff,offerings:[{serviceId:"s1",profitSplit}]}));
  assert.throws(()=>staffInput.parse({...staff,offerings:[{serviceId:"s1",profitSplit:60},{serviceId:"s1",profitSplit:60}]}));
});
