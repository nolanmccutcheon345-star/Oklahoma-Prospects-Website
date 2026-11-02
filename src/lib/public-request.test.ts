import test from "node:test";
import assert from "node:assert/strict";
import { publicRequest } from "./public-request";

test("a stalled public read reaches recovery instead of waiting forever", async () => {
  await assert.rejects(publicRequest(new Promise(() => {}), 5), /took too long/);
});
test("public read preserves successful values and real failure reasons", async () => {
  assert.deepEqual(await publicRequest(Promise.resolve({ price: 6500 }), 50), { price: 6500 });
  const failure = new Error("Unavailable");
  await assert.rejects(publicRequest(Promise.reject(failure), 50), (e) => e === failure);
});
test("late success cannot turn a timed-out request into a successful checkout check", async () => {
  let finish!: (value: boolean) => void;
  const pending = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const checked = publicRequest(pending, 5);
  await assert.rejects(checked, /took too long/);
  finish(true);
  await assert.rejects(checked, /took too long/);
});
