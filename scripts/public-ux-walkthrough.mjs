// Real built application, disposable database and synthetic requests only.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { auditHarness } from './audit-support.mjs';
const h = await auditHarness();
const output = process.env.PUBLIC_UX_SCREENSHOTS || '/workspace/screenshots/public-audit';
await mkdir(output,{recursive:true});
let browser, socket;
const errors=[];
try {
 socket=new PGLiteSocketServer({db:h.db,host:'127.0.0.1',port:0,maxConnections:20});
 await socket.start();
 process.env.DATABASE_URL='postgresql://postgres@'+socket.getServerConn()+'/postgres';
 const handler=(await import('../.netlify/v1/functions/server.mjs')).default;
 browser=await chromium.launch({executablePath:process.env.LESSON_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote']});
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&/\.(js|css|woff2)(\?|$)/.test(r.url()))errors.push(`Asset ${r.status()} ${new URL(r.url()).pathname}`);});
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==h.base)return route.abort();
  const root=resolve('dist/client'),path=resolve(root,'.'+url.pathname);
  if(path.startsWith(root+'/'))try {
    const body=await readFile(path);
    return route.fulfill({body,contentType:({'.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'})[extname(path)]||'application/octet-stream'});
  }catch{ /* Non-static paths are handled by the real application below. */ }
  const response=await handler(new Request(req.url(),{method:req.method(),headers:{...(await req.allHeaders()),'x-nf-client-connection-ip':'192.0.2.90'},...(!['GET','HEAD'].includes(req.method())?{body:req.postDataBuffer()}:{})}));
  const headers=Object.fromEntries(response.headers);
  if(response.headers.getSetCookie().length)headers['set-cookie']=response.headers.getSetCookie().join('\n');
  return route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
 });
 for(const width of [320,390,430,768,1280]) {
  await page.setViewportSize({width,height:900});
  await page.goto(h.base+'/');
  // The SSR menu is visible before React attaches its click handler. The
  // signed-out account link appears after the shared hydration/session gate.
  await page.getByRole('link',{name:'Sign in',exact:true}).waitFor();
  await page.getByRole('button',{name:'Train',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
  assert.equal(await dialog.getByRole('link',{name:'All training',exact:true}).count(),1);
  for(let i=0;i<10;i++)await page.keyboard.press('Tab');
  assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true,'focus stays in section navigation');
  await page.screenshot({path:`${output}/navigation-${width}.png`});
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  assert.equal(await page.getByRole('button',{name:'Train',exact:true}).evaluate(el=>el===document.activeElement),true,'Escape restores trigger focus');
  await page.getByRole('button',{name:'Teams',exact:true}).click();
  await dialog.getByRole('link',{name:'Browse all teams',exact:true}).click();
  await page.waitForURL('**/teams');await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`);
  if(width===1280)await page.screenshot({path:output+'/teams-desktop.png'});
 }
 await page.setViewportSize({width:390,height:844});
 await page.goto(h.base+'/training');
 await page.waitForLoadState('networkidle');
 await page.getByRole('heading',{name:'Find my training',exact:true}).waitFor();
 await page.getByLabel('Age on lesson date',{exact:true}).selectOption('youth');
 await page.locator('#assessments').waitFor({state:'hidden'});
 assert.match(await page.getByRole('status').allTextContents().then(x=>x.join(' ')),/do not require an assessment/);
 await page.getByLabel('Sport',{exact:true}).selectOption('softball');
 await page.getByText('No lessons match these choices.',{exact:false}).waitFor();
 await page.screenshot({path:output+'/training-mobile.png'});
 await page.goto(h.base+'/tryouts');
 await page.waitForLoadState('networkidle');
 await page.getByRole('button',{name:'Continue to player details',exact:true}).click();
 assert.equal(await page.getByRole('heading',{name:/Step 1 of 3/}).count(),1);
 await page.getByLabel(/^Age group/).selectOption('12U');
 await page.getByLabel(/^Player name/).fill('Synthetic Audit Player');
 await page.getByLabel(/^Parent \/ Guardian/).fill('Synthetic Audit Guardian');
 await page.locator('form').filter({has:page.getByRole('heading',{name:/Step 1 of 3/})}).getByLabel(/^Phone/).fill('9185550123');
 await page.locator('form').filter({has:page.getByRole('heading',{name:/Step 1 of 3/})}).getByLabel(/^Email/).fill('guardian@audit.example.invalid');
 await page.getByRole('button',{name:'Continue to player details',exact:true}).click();
 await page.getByRole('heading',{name:/Step 2 of 3/}).waitFor();
 await page.getByRole('button',{name:'Continue to review',exact:true}).click();
 assert.equal(await page.getByRole('heading',{name:/Step 2 of 3/}).count(),1,'required details cannot be skipped');
 await page.getByLabel(/^Player positions/).fill('New player / still learning');
 await page.getByLabel(/^Player notes/).fill('Synthetic request for isolated release acceptance.');
 await page.getByLabel(/^USSSA Player ID status/).selectOption('unknown');
 await page.getByRole('button',{name:'Continue to review',exact:true}).click();
 await page.getByRole('heading',{name:/Step 3 of 3/}).waitFor();
 await page.getByRole('button',{name:'Back',exact:true}).click();
 assert.match(await page.getByLabel(/^Player positions/).inputValue(),/New player/);
 await page.getByRole('button',{name:'Continue to review',exact:true}).click();
 await page.getByLabel(/I agree to be contacted/).check();
 await page.screenshot({path:output+'/tryout-review-mobile.png'});
 await page.getByRole('button',{name:'Submit tryout request',exact:true}).click();
 await page.getByRole('heading',{name:'Request received',exact:true}).waitFor();
 const rows=await h.sql`select id from club_requests where kind='tryout'`;
 assert.equal(rows.length,1,'request persisted exactly once');
 await page.reload();
 assert.equal((await h.sql`select id from club_requests where kind='tryout'`).length,1,'reload does not resubmit');
 await page.goto(h.base+'/book');
 await page.getByText('1. Choose your spaces',{exact:true}).waitFor();
 await page.getByLabel('Lane 7 · Baseball / Softball',{exact:true}).check();
 await page.getByRole('button',{name:'Continue to date & time',exact:true}).click();
 assert.equal(await page.getByLabel('Date',{exact:true}).isVisible(),true);
 await page.waitForFunction(()=>document.activeElement?.textContent==='2. Pick your date & time');
 await page.screenshot({path:output+'/booking-mobile.png'});
 // 200% root text-size check at a narrow viewport. This is not a real iOS/VoiceOver certification.
 for (const routePath of ['/training','/tryouts','/book']) {
  await page.goto(h.base+routePath); await page.waitForLoadState('networkidle');
  await page.addStyleTag({content:'html { font-size: 200% !important; }'});
  await page.screenshot({path:output+'/text-resize-'+routePath.slice(1)+'.png'});
  const overflow = await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1 || e.scrollWidth>e.clientWidth+1).map(e=>({tag:e.tagName,class:e.className,text:e.textContent?.slice(0,80),right:e.getBoundingClientRect().right})).slice(-25));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`200% text overflow on ${routePath}: ${JSON.stringify(overflow)}`);
 }
 assert.deepEqual(errors,[]);
 await writeFile(output+'/verification.json',JSON.stringify({viewports:[320,390,430,768,1280],navigation:'focus, Escape, return focus and links passed',training:'age and sport filters passed',tryouts:'required fields, back navigation and persisted submission passed',booking:'space-to-time progression passed',textResize:'200% root text at 390px on training, tryouts and booking; no horizontal overflow',browserErrors:errors},null,2));
 console.log('PASS public UX: five viewports, keyboard navigation, training filters, persisted tryout and booking progression; no browser errors');
} catch(e) { console.error(e); throw e; } finally {
 if(browser)await browser.close();
 if(socket){const deadline=Date.now()+15000;while(socket.getStats().activeConnections&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));await socket.stop();}
 delete process.env.DATABASE_URL;
 await h.close();
}
