// Authenticated Chromium walkthrough: actual React lesson component, Better Auth and
// migrated disposable PostgreSQL. Only HTTP/server-function transport is bridged.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import {resolve,extname} from "node:path";
import { randomBytes } from "node:crypto";
import { auditHarness } from "./audit-support.mjs";

test("authenticated instructor walkthrough: both sports, 30/60/75, durable drafts and completion", async () => {
  const h = await auditHarness(),
    { api, sql, state, base } = h;
  let browser, page;
  const fullApp=process.env.LESSON_FULL_APP==="true";
  const previousDb={sql:globalThis.__pgSqlPromise__,pg:globalThis.__pgliteInstance__};
  let appHandler;
  const password = randomBytes(24).toString("base64url");
  const screenshots = process.env.LESSON_SCREENSHOT_DIR || "/workspace/screenshots/guided-lessons";
  await mkdir(screenshots, { recursive: true });
  try {
    const signup = await api.handleAuthRequest(
      new Request(base + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { origin: base, "content-type": "application/json" },
        body: JSON.stringify({
          name: "Synthetic Instructor",
          email: "instructor@audit.example.invalid",
          password,
        }),
      }),
    );
    const signed = await signup.json();
    assert.equal(signup.status, 200);
    const userId = signed.user.id;
    // Explicit test provisioning, never a production identity or bypass of login.
    await sql`update "user" set "emailVerified"=true where id=${userId}`;
    await sql`insert into profiles(user_id,email,name,role) values(${userId},'instructor@audit.example.invalid','Synthetic Instructor','coach') on conflict(user_id) do update set role='coach'`;
    await sql`insert into club_athletes(id,user_id,household_email,name,birth_date,profile) values('test-player',${userId},'guardian@audit.example.invalid','Synthetic Two-Sport Player','2013-04-01','{"sports":["baseball","softball"],"sport":"baseball"}')`;
    const file = api.emptyDevelopment();
    file.coaches = [
      {
        id: "test-instructor",
        name: "Synthetic Instructor",
        email: "instructor@audit.example.invalid",
        active: true,
        specialties: ["Pitching", "Hitting", "Catching", "Fielding"],
      },
    ];
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(file)},0)`;
    await sql`insert into club_staff(id,name,email,role,active) values('test-staff','Synthetic Instructor','instructor@audit.example.invalid','coach',true)`;
    const cases = [
      ["baseball", "s7", "Hitting", 30],
      ["softball", "s10", "Catching", 30],
      ["baseball", "s12", "Fielding", 60],
      ["softball", "s3", "Pitching", 60],
      ["baseball", "s1", "Pitching", 75],
      ["softball", "s1", "Pitching", 75],
    ];
    for (const [sport, service, discipline, minutes] of cases) {
      const id = sport + minutes;
      await sql`insert into club_staff_services(staff_id,service_id,profit_split) values('test-staff',${service},60) on conflict do nothing`;
      await sql`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,status) values(${id},${id},${userId},'guardian@audit.example.invalid','test-player',${service},'lesson',${JSON.stringify({ discipline, regularCents: 10000, kind: "lesson", credits: 1 })},10000,'paid')`;
      await sql`insert into booking_records(id,order_id,user_id,athlete_id,coach_id,product_id,starts_at,ends_at,status,resources,lesson_sport) values(${id},${id},${userId},'test-player','test-instructor',${service},'2026-01-01T18:00:00Z',${new Date(Date.UTC(2026, 0, 1, 18, minutes)).toISOString()},'confirmed','[]',${sport})`;
    }
    const bundle = await build({
      stdin: {
        contents: `import React from 'react';import{createRoot}from'react-dom/client';import{BookedGuidedLesson}from'./src/components/pd/booked-guided-lesson';const id=new URLSearchParams(location.search).get('booking');function App(){const[ready,setReady]=React.useState(false),[err,setErr]=React.useState('');React.useEffect(()=>{fetch('/api/auth/get-session').then(r=>r.json()).then(s=>{if(s?.user)setReady(true)})},[]);return ready?<BookedGuidedLesson bookingId={id} onClose={()=>setReady(false)}/>:<form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const r=await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:f.get('email'),password:f.get('password')})});if(r.ok)setReady(true);else setErr(await r.text())}}><h1>Isolated instructor workflow test</h1><label>Email<input name="email" type="email"/></label><label>Password<input name="password" type="password"/></label><button>Sign in</button><p>{err}</p></form>}createRoot(document.getElementById('root')).render(<App/>);`,
        resolveDir: process.cwd(),
        loader: "tsx",
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [
        {
          name: "transport",
          setup(b) {
            b.onResolve({ filter: /lesson-session-api$|recruiting-api$/ }, (a) => ({
              path: a.path,
              namespace: "transport",
            }));
            b.onLoad({ filter: /.*/, namespace: "transport" }, (a) => ({
              loader: "js",
              contents: a.path.endsWith("recruiting-api")
                ? `export const getLessonMetrics=async()=>{throw Error('Separate recruiting verification is outside this walkthrough')};export const saveLessonMetric=getLessonMetrics;`
                : `const call=async(name,input)=>{const r=await fetch('/test-api/'+name,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input?.data||{})});const d=await r.json();if(!r.ok)throw Error(d.error);return d;};${["openBookedLesson", "saveBookedLesson", "reviewBookedLesson", "getBookedLessonHistory", "getLessonExceptions"].map((n) => `export const ${n}=input=>call('${n}',input);`).join("")}`,
            }));
          },
        },
      ],
    });
    if(fullApp){
      await sql`insert into person_profiles(user_id,instructor,profile) values(${userId},true,'{}')`;
      globalThis.__pgSqlPromise__=Promise.resolve(sql);globalThis.__pgliteInstance__=Promise.resolve(h.db);
      appHandler=(await import('../.netlify/v1/functions/server.mjs')).default;
    }
    const assets = process.env.NETLIFY ? "dist/client/assets" : ".vercel/output/static/assets";
    const css = (
      await Promise.all(
        (await readdir(assets))
          .filter((f) => f.endsWith(".css"))
          .map((f) => readFile(assets + "/" + f, "utf8")),
      )
    ).join("\n");
    browser = await chromium.launch({
      executablePath: process.env.LESSON_BROWSER_EXECUTABLE || undefined,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--single-process",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
      testPage = await context.newPage(),
      errors = [];
    page = testPage;
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (url.origin !== base) return route.abort();
      if(fullApp){
        const root=resolve('dist/client'),path=resolve(root,'.'+url.pathname);
        if(path.startsWith(root+'/')){try{const body=await readFile(path);const mime={'.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'}[extname(path)]||'application/octet-stream';return route.fulfill({contentType:mime,body});}catch{/* The actual application handles non-static routes. */}}
        const request=new Request(req.url(),{method:req.method(),headers:await req.allHeaders(),...(!['GET','HEAD'].includes(req.method())?{body:req.postDataBuffer()}: {})});
        const response=await appHandler(request);
        const headers=Object.fromEntries(response.headers);if(response.headers.getSetCookie().length)headers['set-cookie']=response.headers.getSetCookie().join('\n');
        return route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
      }
      if (url.pathname === "/app.js")
        return route.fulfill({
          contentType: "application/javascript",
          body: bundle.outputFiles[0].text,
        });
      if (url.pathname === "/style.css")
        return route.fulfill({ contentType: "text/css", body: css });
      if (url.pathname.startsWith("/api/auth/")) {
        const response = await api.handleAuthRequest(
          new Request(req.url(), {
            method: req.method(),
            headers: { ...(await req.allHeaders()), origin: base },
            ...(req.postData() ? { body: req.postData() } : {}),
          }),
        );
        return route.fulfill({
          status: response.status,
          headers: {
            "content-type": "application/json",
            "set-cookie": response.headers.getSetCookie().join("\n"),
          },
          body: await response.text(),
        });
      }
      if (url.pathname.startsWith("/test-api/")) {
        try {
          state.request = new Request(req.url(), {
            method: "POST",
            headers: { ...(await req.allHeaders()), origin: base, "sec-fetch-site": "same-origin" },
          });
          const uid = await api.requireUserId(),
            data = req.postDataJSON();
          const name = url.pathname.split("/").at(-1);
          let result;
          if (name === "openBookedLesson")
            result = await api.openLessonSession(uid, data.bookingId);
          else if (name === "saveBookedLesson") result = await api.saveLessonSession(uid, data);
          else if (name === "getBookedLessonHistory")
            result = await api.lessonHistory(uid, data.athleteId);
          else throw Error("Not exposed by this walkthrough");
          return route.fulfill({ json: result });
        } catch (e) {
          return route.fulfill({ status: 400, json: { error: e.message } });
        }
      }
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
      });
    });
    let authenticated = false;
    for (const [sport, , discipline, minutes] of cases) {
      const id = sport + minutes;
      await page.goto(fullApp?base+"/login?next=%2Finstructor":base + "/?booking=" + id);
      if (!authenticated) {
        await page.getByLabel(/^Email/).first().fill("instructor@audit.example.invalid");
        await page.getByLabel(/^Password/).first().fill(password);
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        if(fullApp)await page.getByRole("heading",{name:"Instructor workspace",exact:true}).waitFor();
        authenticated = true;
      }
      if(fullApp){await page.goto(base+'/instructor');await page.locator(`[data-booking-id="${id}"]`).getByRole('button',{name:'Open guided lesson',exact:true}).click();}
      await page.getByRole("heading", { name: "Guided lesson", exact: true }).waitFor();
      await page.getByLabel(/^Attendance/).selectOption("present");
      await page.getByLabel(/^Readiness/).selectOption("ready");
      for (let i = 0; i < 8; i++) {
        await page
          .getByRole("navigation", { name: "Lesson stages" })
          .getByRole("button")
          .nth(i)
          .click();
        await page
          .getByLabel("Stage notes")
          .fill("Completed " + api.stageNames[i] + " with readiness and quality review.");
        await page.getByLabel("Actual minutes spent").fill("3");
        if (i === 3 && sport === "softball" && discipline === "Pitching")
          assert.match(await page.locator("body").innerText(), /underhand|Underhand/);
        if (i === 5) {
          assert.equal(
            await page.getByRole("heading", { name: discipline + " practice tracker" }).count(),
            1,
          );
          if (discipline !== "Pitching")
            assert.equal(await page.getByText("Command TCI:", { exact: false }).count(), 0);
          await page
            .getByLabel("Drill / task", { exact: true })
            .fill("Synthetic controlled practice");
          if (discipline === "Hitting")
            await page.getByLabel("Contact quality", { exact: true }).fill("Barrel");
          if (discipline === "Catching")
            await page
              .getByLabel("Receiving / blocking / throwing", { exact: true })
              .fill("Receiving");
          if (discipline === "Fielding")
            await page.getByLabel("Fielded-ball type", { exact: true }).fill("Ground ball");
          if (discipline === "Pitching") {
            await page.getByLabel("Pitch type", { exact: true }).fill("Fastball");
            await page.getByLabel("Velocity (mph)", { exact: true }).fill("50");
          }
          await page.getByRole("button", { name: "Add practice record", exact: true }).click();
          await page.getByRole("button", { name: "Save Draft", exact: true }).click();
          await page.getByRole("status").filter({ hasText: "Draft saved" }).waitFor();
          assert.equal((await api.openLessonSession(userId, id)).session.document.logs.length, 1);
          await page
            .getByRole("heading", { name: discipline + " practice tracker" })
            .scrollIntoViewIfNeeded();
          await page.screenshot({ path: screenshots + "/" + id + "-tracking.png", fullPage: true });
        }
        if (i === 7) {
          await page
            .getByLabel("Family recap", { exact: true })
            .fill("Synthetic player improved execution with one consistent cue.");
          await page
            .getByLabel("Homework and dose")
            .fill("Reviewed controlled practice only; stop for discomfort.");
          await page
            .getByLabel("Next steps", { exact: true })
            .fill("Recheck execution next lesson.");
        }
      }
      await page.getByRole("button", { name: "Save Draft", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Draft saved" }).waitFor();
      await page.reload();
      if(fullApp)await page.locator(`[data-booking-id="${id}"]`).getByRole('button',{name:'Open guided lesson',exact:true}).click();
      await page.getByLabel("Family recap", { exact: true }).waitFor();
      assert.match(await page.getByLabel("Family recap", { exact: true }).inputValue(), /improved/);
      await page.getByRole("button", { name: "Publish & Complete Session", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Session completed" }).waitFor();
      assert.equal(
        (await sql`select status from booking_records where id=${id}`)[0].status,
        "completed",
      );
      assert.equal((await sql`select * from contractor_earnings where booking_id=${id}`).length, 1);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      );
      await page.getByRole("dialog").evaluate((el) => (el.scrollTop = 0));
      await page.screenshot({ path: screenshots + "/" + id + "-completed.png", fullPage: true });
    }
    assert.deepEqual(errors, []);
    assert.equal((await sql`select * from recruiting_metrics`).length, 0);
    await writeFile(
      screenshots + "/walkthrough.json",
      JSON.stringify(
        {
          cases: cases.map(([sport, service, discipline, minutes]) => ({
            sport,
            service,
            discipline,
            minutes,
            result: "pass",
          })),
          browserErrors: errors,
          scope: fullApp ? "Built Netlify application: real login route, instructor desk, TanStack server-function transport and middleware, booking lesson UI, injected disposable migrated PostgreSQL. No external providers or production records." :
            "Actual lesson React component + Better Auth + disposable migrated DB. HTTP server-function transport bridged; recruiting action not exercised.",
        },
        null,
        2,
      ),
    );
  } catch (e) {
    if (page) {
      console.error((await page.locator("body").innerText()).slice(0, 2500));
      await page.screenshot({ path: screenshots + "/failure.png", fullPage: true });
    }
    throw e;
  } finally {
    await browser?.close();
    globalThis.__pgSqlPromise__=previousDb.sql;globalThis.__pgliteInstance__=previousDb.pg;
    await h.close();
  }
});
