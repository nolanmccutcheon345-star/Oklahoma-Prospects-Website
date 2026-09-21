import assert from "node:assert/strict";
import test from "node:test";
import { PRICES, NET_PRICES, FIRST_MONTH_SETUP_CENTS } from "./pricing";
import { processingInclusiveCents } from "./processing-prices.js";
import { buildPublicCatalog } from "./ops";
import { quoteCages } from "./pay";
import { serviceInput } from "./ops-contracts";
const netAfterBudget = (cents: number) => cents - Math.round(cents * .029) - 30;
test("all posted products cover their net target at the documented card budget",()=>{
 for(const [id,base] of Object.entries(NET_PRICES)){
  const price=PRICES[id as keyof typeof PRICES];
  const units=["individual","team","field"].includes(id)?2:1;
  assert.ok(netAfterBudget(price/units)>=base/units,id);
 }
 assert.equal(FIRST_MONTH_SETUP_CENTS,5200);
 assert.ok(netAfterBudget(FIRST_MONTH_SETUP_CENTS)>=5000);
 assert.equal(processingInclusiveCents(0),0);
});
test("rental displays and totals retain cents for minimum and combined purchases",()=>{
 const catalog=buildPublicCatalog([]);
 assert.equal(quoteCages(catalog,{rate:"individual",laneIds:["1"],minutes:30})?.price,26.25);
 assert.equal(quoteCages(catalog,{rate:"team",laneIds:["1","2"],minutes:60,use:"team"})?.price,125);
 assert.equal(serviceInput.shape.price.parse(52.5),52.5);
 assert.throws(()=>serviceInput.shape.price.parse(52.501));
});
