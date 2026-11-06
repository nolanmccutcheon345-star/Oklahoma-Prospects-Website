import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("training plan cards highlight only when the stored featured flag is true", async () => {
  const temp = await mkdtemp("scripts/.lesson-card-");
  try {
    const out = temp + "/card.mjs";
    await build({
      entryPoints: ["src/components/training-catalog.tsx"],
      outfile: out,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      jsx: "automatic",
      plugins: [
        {
          name: "auth-client",
          setup(b) {
            b.onLoad({ filter: /auth\/client\.ts$/ }, () => ({
              loader: "ts",
              contents:
                "export const authEnabled = false; export const authClient = {}; export const GROK_PROVIDERS = []; export function signIn() {}",
            }));
          },
        },
      ],
    });
    const { TrainingPlanCard } = await import(pathToFileURL(process.cwd() + "/" + out));
    const base = {
      name: "Performance",
      price: 100,
      lessons: 4,
      minutes: 60,
      remote: 0,
      detail: "Plan detail",
      includes: ["Four 60-minute sessions"],
      tier: "performance",
    };
    const html = (plan) =>
      renderToStaticMarkup(
        createElement(TrainingPlanCard, {
          plan,
          hasAssessment: false,
          availability: undefined,
          setupFee: 0,
          checkoutStatus: "ready",
        }),
      );
    const off = html({ ...base, id: "m2", featured: false });
    assert.match(off, /data-featured="false"/);
    assert.doesNotMatch(off, /bg-maroon/);
    assert.doesNotMatch(off, />Featured</);
    assert.doesNotMatch(off, /Core monthly plan/);
    const on = html({ ...base, id: "m2", featured: true });
    assert.match(on, /data-featured="true"/);
    assert.match(on, /bg-maroon/);
    assert.match(on, />Featured</);
    const alsoOn = html({
      ...base,
      id: "m1",
      name: "Development",
      tier: "development",
      featured: true,
    });
    assert.match(alsoOn, /data-featured="true"/);
    assert.match(alsoOn, />Featured</);
    const plainOff = html({
      ...base,
      id: "m3",
      name: "Elite",
      tier: "elite",
      featured: false,
    });
    assert.match(plainOff, /data-featured="false"/);
    assert.doesNotMatch(plainOff, /bg-maroon/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
