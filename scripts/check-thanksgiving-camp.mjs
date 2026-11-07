// Isolated synthetic browser check. Blocks all external network requests.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { THANKSGIVING_CAMP } from "../src/lib/thanksgiving-camp.ts";
const fixture = {
  events: THANKSGIVING_CAMP.groups.map((g) => ({
    id: g.id,
    revision: 1,
    name: `Prospects Thanksgiving Camp — Ages ${g.label}`,
    type: "camp",
    sport: "Both",
    minAge: g.minAge,
    maxAge: g.maxAge,
    description: "Camp updates are posted here.",
    priceCents: 12000,
    dayPriceCents: 4500,
    pricingMode: "both",
    location: THANKSGIVING_CAMP.location,
    sessions: THANKSGIVING_CAMP.dates.map((date) => ({ date, start: g.start, end: g.end })),
    operationalSessions: THANKSGIVING_CAMP.dates.map((date) => ({
      date,
      originalDate: date,
      start: g.start,
      end: g.end,
      sessionKey: date + g.id,
      location: THANKSGIVING_CAMP.location,
      status: "confirmed",
    })),
    additionalSessions: [],
    availability: THANKSGIVING_CAMP.dates.map((date) => ({
      date,
      remainingSeats: 150,
      open: true,
    })),
    packageOpen: true,
    remainingSeats: 150,
    registrationOpen: true,
    coaches: [],
    capacity: 150,
    status: "published",
    policy:
      "Full refund with at least 24 hours’ cancellation notice before the start of the first day selected in this registration. After that, no refund.",
  })),
  paymentsAvailable: true,
};
const mocks = {
  "@tanstack/react-router": `import React from 'react';export const createFileRoute=()=>()=>({});export const Link=({to,children,search,...p})=>React.createElement('a',{href:to,...p},children);`,
  "@/lib/auth/use-current-user": `export const useCurrentUserState=()=>({user:window.fixtureUser,isPending:false});export const useCurrentUser=()=>window.fixtureUser;`,
  "@/lib/thanksgiving-camp-api": `export const getThanksgivingCamp=async()=>window.fixtureCamp;`,
  "@/lib/training-events-api": `export const getTrainingEvents=async()=>window.fixtureCamp.events;export const getEventFamily=async()=>({players:[{id:'synthetic-younger',name:'Synthetic Younger',birthDate:'2018-01-01'},{id:'synthetic-older',name:'Synthetic Older',birthDate:'2014-01-01'}],registrations:[],operationalEnrollments:[]});export const startEventCheckout=async({data})=>{window.checkoutCalls.push(data);return {orderId:'synthetic-order',totalCents:data.option==='package'||data.dates?.length===3?12000:data.dates.length*4500,holdUntil:new Date(Date.now()+600000).toISOString(),square:{environment:'sandbox'}};};`,
  "@/lib/commerce/api": `export const submitSquarePayment=async()=>({url:'',declined:false,message:'Synthetic payment accepted'});`,
  "@/lib/coordinator/organization-events-api": `export const getPublicOperationalEvents=async()=>[];`,
  "@/components/commerce/square-card": `import React from 'react';export const SquareCard=({amountCents,onToken})=>React.createElement('button',{onClick:async()=>{await onToken('synthetic-token','synthetic-attempt');window.paymentCompleted=true;}},'Synthetic secure payment '+amountCents);`,
};
const bundled = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ThanksgivingCampPage} from './src/routes/thanksgiving-camp';createRoot(document.getElementById('root')).render(<ThanksgivingCampPage/>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  format: "iife",
  write: false,
  plugins: [
    {
      name: "camp-fixture",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) =>
          mocks[a.path] ? { path: a.path, namespace: "fixture" } : null,
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
          contents: mocks[a.path],
          loader: "js",
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const assets = await readdir("dist/client/assets");
const css = await readFile(
  "dist/client/assets/" + assets.find((f) => /^styles-.*\.css$/.test(f)),
  "utf8",
);
const html = `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><div id="root"></div><script>window.fixtureCamp=${JSON.stringify(fixture)};window.fixtureUser={id:'synthetic-parent',displayName:'Synthetic Parent',primaryEmail:'parent@example.invalid'};window.checkoutCalls=[];</script><script>${bundled.outputFiles[0].text}</script>`;
const server = createServer((q, r) => {
  r.setHeader("content-type", "text/html");
  r.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'",
  );
  r.end(html);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
if (process.argv.includes("--serve")) {
  console.log(`Isolated synthetic fixture: ${origin} (external requests blocked by CSP)`);
  await new Promise(() => {});
}
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  const page = await browser.newPage();
  let errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) =>
    route.request().url().startsWith(origin) ? route.continue() : route.abort(),
  );
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin);
    await page.getByRole("heading", { name: "Register your player." }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      "No horizontal overflow",
    );
    await mkdir("artifacts/thanksgiving-camp", { recursive: true });
    await page.screenshot({ path: `artifacts/thanksgiving-camp/${width}.png`, fullPage: true });
  }
  await page.getByRole("radio", { name: /Ages 6–9U/ }).check();
  await page.getByLabel("Parent or guardian name").fill("Synthetic Parent");
  await page.getByLabel("Parent phone").fill("9185550100");
  await page.getByLabel("Player sport").selectOption("Softball");
  const playerSelect = page
    .locator("select")
    .filter({ has: page.locator('option[value="synthetic-younger"]') });
  await playerSelect.selectOption("synthetic-younger");
  await page.getByRole("checkbox", { name: /I accept/ }).check();
  assert.match(await page.locator("#register").innerText(), /Sunday, November 22, 2026 at 9:00 AM/);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await page.getByRole("button", { name: "Synthetic secure payment 12000" }).waitFor();
  assert.equal(
    await page.getByRole("radio", { name: /Ages 10U–14U/ }).isDisabled(),
    true,
    "Group locked while checkout active",
  );
  await page.getByRole("button", { name: "Synthetic secure payment 12000" }).click();
  assert.equal(await page.evaluate(() => window.paymentCompleted), true);
  const calls = await page.evaluate(() => window.checkoutCalls);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].thanksgivingDetails.sport, "Softball");
  assert.equal(calls[0].thanksgivingDetails.parentPhone, "9185550100");
  // Interrupted registration resets safely; no automatic submission on back/reload.
  await page.reload();
  assert.equal((await page.evaluate(() => window.checkoutCalls)).length, 0);
  await page.getByRole("radio", { name: /Ages 10U–14U/ }).check();
  await page.getByLabel("Parent phone").fill("9185550100");
  await playerSelect.selectOption("synthetic-older");
  await page.getByRole("radio", { name: /Choose days/ }).check();
  await page.getByRole("checkbox", { name: /2026-11-25/ }).check();
  assert.match(
    await page.locator("#register").innerText(),
    /Tuesday, November 24, 2026 at 1:00 PM/,
  );
  await page.getByRole("checkbox", { name: /I accept/ }).check();
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await page.getByRole("button", { name: "Synthetic secure payment 4500" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: responsive camp page, session selection, required contact, full-camp and selected-day totals, refund cutoffs, locked repeat checkout and reload. Synthetic transport only; no provider transaction or inbox delivery claimed.",
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
