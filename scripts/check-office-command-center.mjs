import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

test("command center opens existing modules, searches and recovers without external app links", async () => {
  const output = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {OfficeCommandCenter} from './src/components/office-command-center'; import {OFFICE_TOOL_GROUPS} from './src/lib/office-tools'; globalThis.__tools = OFFICE_TOOL_GROUPS; createRoot(document.getElementById('root')).render(React.createElement(OfficeCommandCenter,{onSection:(section)=>globalThis.__selected=section}));`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) => route.abort());
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: output.outputFiles[0].text });
    await page.getByRole("heading", { name: "Your academy, one workspace" }).waitFor();
    const sections = await page.evaluate(() =>
      globalThis.__tools
        .flatMap((g) => g.tools)
        .map((t) => t.section)
        .filter(Boolean),
    );
    assert.equal(sections.length, 14);
    assert.equal(new Set(sections).size, 14);
    const shell = await readFile("src/components/front-office-shell.tsx", "utf8");
    for (const section of sections) assert.ok(shell.includes(`["${section}",`));
    for (const size of [
      { width: 390, height: 844 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(size);
      for (const group of await page.evaluate(() => globalThis.__tools))
        for (const tool of group.tools) {
          if (tool.section) {
            await page
              .getByRole("button", { name: tool.label })
              .click();
            assert.equal(await page.evaluate(() => globalThis.__selected), tool.section);
          } else
            assert.equal(
              await page
                .getByRole("link", { name: tool.label })
                .getAttribute("href"),
              tool.href,
            );
        }
      await page.getByRole("searchbox", { name: "Find a tool" }).fill("  ROSTERS  ");
      await page.getByRole("button", { name: /Teams & players/ }).click();
      assert.equal(await page.evaluate(() => globalThis.__selected), "teams");
      assert.equal(await page.getByRole("status").textContent(), "1 tools found");
      await page.getByRole("searchbox").fill("not-a-real-tool");
      await page.getByText("No matching tools.", { exact: false }).waitFor();
      await page.getByRole("button", { name: "Clear search" }).click();
      assert.equal(await page.getByRole("searchbox").inputValue(), "");
      assert.equal(await page.getByRole("link").count(), 3);
    }
    const links = await page
      .getByRole("link")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    assert.deepEqual(links, ["/player-profiles", "/handbooks", "/enrollment"]);
    assert.ok(
      !JSON.stringify(await page.evaluate(() => globalThis.__tools)).includes("fundraising"),
    );
  } finally {
    await browser.close();
  }
});
