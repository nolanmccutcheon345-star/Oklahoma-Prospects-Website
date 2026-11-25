import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { auditHarness } from "./audit-support.mjs";
import { writeFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
// Real parser and persistence, synthetic identity, no hosted/auth claim.
test("isolated browser availability save survives reload and rejects invalid input", async () => {
  const h = await auditHarness();
  let browser;
  const temp = "scripts/.availability-runtime.mjs";
  try {
    await h.sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values('qa-availability','qa@example.invalid','QA',true,now(),now())`;
    await h.sql`insert into profiles(user_id,email,name,role,family_id) values('qa-availability','qa@example.invalid','QA','coach','qa-family')`;
    const file = h.api.emptyDevelopment();
    file.coaches = [
      { id: "qa-coach", name: "QA", email: "qa@example.invalid", active: true, specialties: [] },
    ];
    await h.sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(file)},1)`;
    const back = await build({
      stdin: {
        contents:
          "export {myCoach,saveAvailability} from './src/lib/coaching.server';export {coachAvailabilityFields,submittedCoachAvailability} from './src/lib/coach-availability-form';",
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      packages: "external",
      plugins: [
        {
          name: "fixture",
          setup(b) {
            b.onResolve({ filter: /(^|\/)db$/ }, (a) =>
              a.path.startsWith(".") || a.path.startsWith("@/")
                ? { path: "db", namespace: "fixture" }
                : undefined,
            );
            b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents:
                "export const getSql=async()=>globalThis.__prospectsAudit.sql;export const ensureDbReady=async()=>{};export const getPglite=async()=>globalThis.__prospectsAudit.db;",
              loader: "js",
            }));
          },
        },
      ],
    });
    await writeFile(temp, back.outputFiles[0].text);
    const api = await import(pathToFileURL(process.cwd() + "/" + temp));
    const front = await build({
      stdin: {
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {TimeInput} from './src/components/time-input';const f=window.fields.find(x=>x.weekday==='Mon');createRoot(document.getElementById('root')).render(<form onSubmit={async e=>{e.preventDefault();await window.saveFields(Object.fromEntries(new FormData(e.currentTarget)));document.getElementById('status').textContent='Saved';}}><input type="checkbox" name={f.id} aria-label="Available" defaultChecked={f.available}/><label>Start<TimeInput name={f.id+'-start'} defaultValue={f.start} required/></label><label>End<TimeInput name={f.id+'-end'} defaultValue={f.end} required/></label><button>Save</button></form>);`,
        resolveDir: process.cwd(),
        loader: "tsx",
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      define: { "process.env.NODE_ENV": '"development"' },
    });
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route("**/*", (r) => r.abort());
    let saves = 0;
    await page.exposeFunction("saveFields", async (entries) => {
      const form = new FormData();
      for (const [k, v] of Object.entries(entries)) form.set(k, v);
      const fields = api.coachAvailabilityFields(
        (await api.myCoach("qa-availability")).availability,
      );
      await api.saveAvailability("qa-availability", {
        windows: api.submittedCoachAvailability(form, fields),
      });
      saves++;
    });
    async function reopen() {
      await page.goto("about:blank");
      await page.setContent('<div id="root"></div><div role="status" id="status"></div>');
      await page.evaluate(
        (fields) => (window.fields = fields),
        api.coachAvailabilityFields((await api.myCoach("qa-availability")).availability),
      );
      await page.addScriptTag({ content: front.outputFiles[0].text });
      await page.getByLabel("Start", { exact: true }).waitFor();
    }
    await reopen();
    await page.getByLabel("Available").check();
    await page.getByLabel("Start", { exact: true }).fill("5:00 PM");
    await page.getByLabel("End", { exact: true }).fill("8:00pm");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
    assert.equal(saves, 1);
    const saved = (await api.myCoach("qa-availability")).availability;
    assert.deepEqual(
      saved.map((x) => [x.weekday, x.window]),
      [["Mon", "17:00–20:00"]],
    );
    await reopen();
    assert.equal(await page.getByLabel("Start", { exact: true }).inputValue(), "5:00pm");
    assert.equal(await page.getByLabel("Available").isChecked(), true);
    for (const value of ["13:00pm", "5:75pm", "not a time", ""]) {
      await page.getByLabel("Start", { exact: true }).fill(value);
      await page.getByRole("button", { name: "Save" }).click();
      assert.equal(
        await page.getByLabel("Start", { exact: true }).evaluate((e) => e.checkValidity()),
        false,
      );
      assert.equal(saves, 1);
      assert.deepEqual((await api.myCoach("qa-availability")).availability, saved);
    }
    await assert.rejects(() =>
      api.saveAvailability("qa-availability", {
        windows: [{ weekday: "Mon", start: "99:00", end: "20:00" }],
      }),
    );
    assert.deepEqual((await api.myCoach("qa-availability")).availability, saved);
    await page.getByLabel("Start", { exact: true }).fill("6:00pm");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
    assert.equal(saves, 2);
    await reopen();
    assert.equal(await page.getByLabel("Start", { exact: true }).inputValue(), "6:00pm");
    assert.equal((await api.myCoach("qa-availability")).availability[0].window, "18:00–20:00");
  } finally {
    await browser?.close();
    await rm(temp, { force: true });
    await h.close();
  }
});
