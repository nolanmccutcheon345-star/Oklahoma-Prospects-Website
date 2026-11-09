import assert from "node:assert/strict";
import { test } from "node:test";
import { startVisiblePolling } from "./visible-polling";

function fixture(hidden = false) {
  const doc = Object.assign(new EventTarget(), { visibilityState: hidden ? "hidden" : "visible" });
  let tick: (() => void) | undefined;
  let interval = 0;
  const win = Object.assign(new EventTarget(), {
    setInterval(callback: () => void, ms: number) {
      tick = callback;
      interval = ms;
      return 1;
    },
    clearInterval() {
      tick = undefined;
    },
  });
  return {
    browser: { document: doc, window: win } as Parameters<typeof startVisiblePolling>[2],
    tick: () => tick?.(),
    focus: () => win.dispatchEvent(new Event("focus")),
    visibility(hidden: boolean) {
      doc.visibilityState = hidden ? "hidden" : "visible";
      doc.dispatchEvent(new Event("visibilitychange"));
    },
    interval: () => interval,
  };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("preserves visible cadence, skips hidden polls, and refreshes on return", async () => {
  const f = fixture();
  let calls = 0;
  const stop = startVisiblePolling(
    async () => {
      calls++;
    },
    30000,
    f.browser,
  );
  await settle();
  assert.equal(calls, 1);
  assert.equal(f.interval(), 30000);
  f.tick();
  await settle();
  assert.equal(calls, 2);
  f.visibility(true);
  for (let i = 0; i < 120; i++) f.tick();
  f.focus();
  await settle();
  assert.equal(calls, 2);
  f.visibility(false);
  f.focus();
  await settle();
  assert.equal(calls, 3);
  stop();
  f.tick();
  f.focus();
  f.visibility(false);
  await settle();
  assert.equal(calls, 3);
});

test("hidden mounts defer fetches and concurrent events never overlap", async () => {
  const f = fixture(true);
  let calls = 0;
  let resolve!: () => void;
  const stop = startVisiblePolling(
    () => {
      calls++;
      return new Promise<void>((r) => {
        resolve = r;
      });
    },
    60000,
    f.browser,
  );
  assert.equal(calls, 0);
  f.visibility(false);
  f.focus();
  f.tick();
  assert.equal(calls, 1);
  resolve();
  await settle();
  f.tick();
  assert.equal(calls, 2);
  stop();
  resolve();
  await settle();
  f.focus();
  assert.equal(calls, 2);
});

test("rejected refresh can retry at the unchanged interval", async () => {
  const f = fixture();
  let calls = 0;
  const stop = startVisiblePolling(
    async () => {
      calls++;
      throw Error("offline");
    },
    60000,
    f.browser,
  );
  await settle();
  f.tick();
  await settle();
  assert.equal(calls, 2);
  stop();
});
