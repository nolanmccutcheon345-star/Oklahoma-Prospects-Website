import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { Button } from "../components/ui/button";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string) => { window: Window };
};

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(path) : Promise.resolve(path.endsWith(".tsx") ? [path] : []);
  }));
  return nested.flat();
}

test("form action buttons explicitly submit instead of silently inheriting the safe button default", async () => {
  const failures: string[] = [];
  for (const path of await sourceFiles("src")) {
    const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node: ts.Node, inForm = false) {
      const element = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : undefined;
      const tag = element?.tagName.getText(source);
      const attributes = element?.attributes.properties.map(attribute => ts.isJsxAttribute(attribute) ? attribute.name.getText(source) : "spread") || [];
      if (inForm && tag === "Button" && !attributes.some(name => ["type", "onClick", "asChild", "spread"].includes(name))) {
        failures.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      }
      ts.forEachChild(node, child => visit(child, inForm || tag === "form"));
    }
    visit(source);
  }
  assert.deepEqual(failures, [], "Buttons inside forms need an explicit submit type or a deliberate non-submit action");
});

test("submit buttons dispatch a form submit only after native validation; ordinary buttons stay non-submitting", () => {
  const markup = renderToStaticMarkup(createElement("form", null,
    createElement("input", { name: "requiredValue", required: true }),
    createElement(Button, { type: "submit" }, "Save"),
    createElement(Button, null, "Cancel"),
  ));
  const dom = new JSDOM(markup);
  try {
    const form = dom.window.document.querySelector("form")!;
    let submissions = 0;
    form.addEventListener("submit", event => { event.preventDefault(); submissions += 1; });
    const [save, cancel] = [...form.querySelectorAll("button")];
    save.click();
    assert.equal(submissions, 0, "invalid forms must remain blocked");
    form.querySelector("input")!.value = "Synthetic test value";
    cancel.click();
    assert.equal(submissions, 0, "non-submit actions must stay safe");
    save.click();
    assert.equal(submissions, 1, "clicking Save must reach the submit handler");
  } finally {
    dom.window.close();
  }
});
