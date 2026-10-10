import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

test("uniform photo uploads, captions, removal and selected team gallery refresh", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const originalImage = globalThis.Image,
    originalCreate = URL.createObjectURL,
    originalRevoke = URL.revokeObjectURL;
  const photo =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
  globalThis.Image = class {
    width = 1000;
    height = 800;
    async decode() {}
  };
  URL.createObjectURL = () => "blob:fixture";
  URL.revokeObjectURL = () => {};
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
  dom.window.HTMLCanvasElement.prototype.toDataURL = () => photo;
  globalThis.__uniformFixture = {
    value: {
      name: "Navy package",
      items: "Jersey, hat",
      photos: [{ id: "p", caption: "Navy front", src: photo }],
    },
    fail: false,
  };
  const out = resolve("artifacts/uniform-photos-render.mjs");
  await mkdir("artifacts", { recursive: true });
  const result = await build({
    stdin: {
      contents: "export * from './src/components/teams/uniform-photos';",
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [
      {
        name: "fixture",
        setup(b) {
          b.onResolve({ filter: /^@\/lib\/teams\/fee-api$/ }, () => ({
            path: "api",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              'export const getTeamUniform=async()=>{if(globalThis.__uniformFixture.fail)throw Error("Assigned team access required.");return globalThis.__uniformFixture.value;};',
            loader: "js",
          }));
        },
      },
    ],
  });
  await writeFile(out, result.outputFiles[0].text);
  const { UniformPhotoEditor, SelectedTeamUniform, prepareUniformPhoto } = await import(
    pathToFileURL(out).href
  );
  const { act, createElement: h, useState } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const host = document.getElementById("root"),
    root = createRoot(host);
  let stored = [],
    processing = [];
  function Editor() {
    const [photos, setPhotos] = useState([]);
    return h(UniformPhotoEditor, {
      name: "Navy",
      photos,
      onProcessing: (b) => processing.push(b),
      onChange: (p) => {
        stored = p;
        setPhotos(p);
      },
    });
  }
  try {
    await act(async () => root.render(h(Editor)));
    const file = host.querySelector("input[type=file]");
    Object.defineProperty(file, "files", {
      configurable: true,
      value: [new dom.window.File(["photo"], "uniform.png", { type: "image/png" })],
    });
    await act(async () => file.dispatchEvent(new dom.window.Event("change", { bubbles: true })));
    assert.equal(stored.length, 1);
    assert.deepEqual(processing, [true, false]);
    assert.equal(host.querySelector("img").getAttribute("src"), photo);
    const caption = host.querySelector('input[maxlength="120"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(
        caption,
        "Navy jersey front",
      );
      caption.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(stored[0].caption, "Navy jersey front");
    await act(async () =>
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Remove photo 1").click(),
    );
    assert.equal(stored.length, 0);
    assert.equal(host.querySelector("img"), null);
    await assert.rejects(
      () => prepareUniformPhoto(new dom.window.File(["svg"], "bad.svg", { type: "image/svg+xml" })),
      /JPEG/,
    );
    await act(async () => root.render(h(SelectedTeamUniform, { teamId: "team-1" })));
    assert.match(host.textContent, /Navy package/);
    assert.equal(host.querySelector("img").alt, "Navy front");
    assert.equal(host.querySelector("input[type=file]"), null);
    globalThis.__uniformFixture.value = { name: "Maroon package", items: "Jersey", photos: [] };
    await act(async () =>
      window.dispatchEvent(
        new dom.window.CustomEvent("team-uniform-updated", { detail: "team-1" }),
      ),
    );
    assert.match(host.textContent, /Maroon package/);
    assert.equal(host.querySelector("img"), null);
    globalThis.__uniformFixture.fail = true;
    await act(async () => root.render(h(SelectedTeamUniform, { teamId: "other-team" })));
    assert.match(host.querySelector("[role=alert]").textContent, /Assigned team/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.__uniformFixture;
    globalThis.Image = originalImage;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    await rm(out, { force: true });
  }
});
