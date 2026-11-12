import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";

test("command center covers every existing section and searches without changing records", async () => {
  const result = await build({
    stdin: {
      contents: `import React, {act} from 'react'; import {createRoot} from 'react-dom/client'; import {OfficeCommandCenter} from './src/components/office-command-center'; import {OFFICE_TOOL_GROUPS} from './src/lib/office-tools'; globalThis.__tools=OFFICE_TOOL_GROUPS; globalThis.__act=act; globalThis.IS_REACT_ACT_ENVIRONMENT=true; act(()=>createRoot(document.getElementById('root')).render(React.createElement(OfficeCommandCenter,{onSection:section=>globalThis.__selected=section})));`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const dom = new JSDOM('<div id="root"></div>', {
    runScripts: "dangerously",
    url: "https://example.invalid/office",
  });
  try {
    const win = dom.window;
    win.eval(result.outputFiles[0].text);
    const tools = win.__tools.flatMap((g) => g.tools);
    const shell = await readFile("src/components/front-office-shell.tsx", "utf8");
    const ids = tools.map((t) => t.section).filter(Boolean);
    assert.equal(ids.length, 14);
    assert.equal(new Set(ids).size, 14);
    for (const tool of tools) {
      if (tool.section) {
        assert.ok(shell.includes(`["${tool.section}",`));
        const button = [...win.document.querySelectorAll("button")].find((b) =>
          b.textContent.startsWith(tool.label),
        );
        win.__act(() => button.click());
        assert.equal(win.__selected, tool.section);
      } else
        assert.ok(
          [...win.document.querySelectorAll("a")].some((a) => a.getAttribute("href") === tool.href),
        );
    }
    const input = win.document.querySelector("input");
    function search(value) {
      win.__act(() => {
        Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set.call(
          input,
          value,
        );
        input.dispatchEvent(new win.Event("input", { bubbles: true }));
      });
    }
    search("  ROSTERS  ");
    assert.equal(win.document.querySelector('[role="status"]').textContent, "1 tools found");
    assert.ok(win.document.body.textContent.includes("Teams & players"));
    search("not-a-tool");
    assert.ok(win.document.body.textContent.includes("No matching tools."));
    for (let i = 0; i < 2; i++) {
      search("finance");
      win.__act(() =>
        [...win.document.querySelectorAll("button")]
          .find((b) => b.textContent === "Clear search")
          .click(),
      );
      assert.equal(input.value, "");
      assert.equal(win.document.querySelectorAll("a").length, 3);
    }
    assert.ok(!JSON.stringify(tools).includes("fundraising"));
    assert.ok(
      [...win.document.querySelectorAll("a")].every((a) => a.origin === "https://example.invalid"),
    );
  } finally {
    dom.window.close();
  }
});
