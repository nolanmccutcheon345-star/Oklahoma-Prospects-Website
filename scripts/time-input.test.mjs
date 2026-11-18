// Isolated browser regression: no accounts, scheduling API or live data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

test('time editor permits valid availability submission and rejects invalid times', async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {TimeInput} from './src/components/time-input';
        createRoot(document.getElementById('root')).render(<form onSubmit={e=>{
          e.preventDefault(); window.submissions.push(Object.fromEntries(new FormData(e.currentTarget)));
        }}><label>Start<TimeInput name="start" defaultValue="17:00" required /></label>
        <label>End<TimeInput name="end" defaultValue="20:00" required /></label>
        <button>Save</button></form>);`,
      resolveDir: process.cwd(), loader: 'tsx', sourcefile: 'synthetic-time-input.tsx',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  const browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
  try {
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    await page.route('**/*', route => route.abort());
    await page.setContent('<div id="root"></div>');
    await page.evaluate(() => { window.submissions = []; });
    await page.addScriptTag({content: bundle.outputFiles[0].text});
    const start = page.getByLabel('Start');
    await start.waitFor();
    assert.equal(await start.inputValue(), '5:00pm');
    await page.getByRole('button', {name: 'Save'}).click();
    assert.deepEqual(await page.evaluate(() => window.submissions), [{start:'17:00',end:'20:00'}]);
    for (const [typed, canonical] of [['5:00pm','17:00'],['5:00 PM','17:00'],['12:00am','00:00'],['12:00pm','12:00']]) {
      await start.fill(typed);
      await start.blur();
      assert.equal(await start.evaluate(input => input.checkValidity()), true, typed);
      await page.getByRole('button', {name: 'Save'}).click();
      assert.equal(await page.evaluate(() => window.submissions.at(-1).start), canonical);
    }
    const count = await page.evaluate(() => window.submissions.length);
    for (const typed of ['13:00pm','5:75pm','17:00','not a time','']) {
      await start.fill(typed);
      await page.getByRole('button', {name: 'Save'}).click();
      assert.equal(await start.evaluate(input => input.checkValidity()), false, typed);
      assert.equal(await page.evaluate(() => window.submissions.length), count);
    }
    await start.fill('5:00pm');
    await page.getByRole('button', {name: 'Save'}).click();
    assert.equal(await page.evaluate(() => window.submissions.length), count+1);
    assert.deepEqual(await page.evaluate(() => window.submissions.at(-1)), {start:'17:00',end:'20:00'});
  } finally { await browser.close(); }
});
