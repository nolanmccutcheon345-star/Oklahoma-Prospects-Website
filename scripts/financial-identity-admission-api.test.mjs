import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

test("financial identity endpoints authenticate and strictly bind explicit reviewed scope", async () => {
  const out = resolve("scripts/.identity-admission-api.mjs");
  const built = await build({
    entryPoints: ["src/lib/finance/identity-admission-api.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["zod", "../db", "./identity-admission.server"],
    plugins: [
      {
        name: "fixture",
        setup(b) {
          b.onResolve({ filter: /^@tanstack\/react-start$/ }, () => ({
            path: "start",
            namespace: "fixture",
          }));
          b.onResolve({ filter: /auth\/middleware$/ }, () => ({
            path: "auth",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            contents:
              path === "auth"
                ? "export const authMiddleware = {authenticated:true};"
                : `export const createServerFn = (options) => {
              const call={options,middleware(value){this.auth=value;return this},validator(value){this.schema=value;return this},handler(value){this.run=value;return this}};
              return call;
            };`,
            loader: "js",
          }));
        },
      },
    ],
  });
  await writeFile(out, built.outputFiles[0].text);
  try {
    const api = await import(pathToFileURL(out).href);
    const { identityAdmissionPreviewSchema: preview, identityAdmissionSchema: save } = api;
    for (const [name, method] of [
      ["getFinancialIdentityAdmissionOptions", "GET"],
      ["previewFinancialIdentityAdmission", "POST"],
      ["admitFinancialIdentity", "POST"],
    ]) {
      assert.equal(api[name].options.method, method);
      assert.deepEqual(api[name].auth, [{ authenticated: true }]);
    }
    assert.equal(api.previewFinancialIdentityAdmission.schema, preview);
    assert.equal(api.admitFinancialIdentity.schema, save);
    const instructor = { kind: "instructor", userId: "verified-account", coachId: "saved-coach" };
    const payroll = { kind: "payroll", userId: "verified-account", payrollFromMonth: "2030-04" };
    const reviewed = {
      expectedBasisVersion: 7,
      reviewDigest: "a".repeat(64),
      bookingIds: [],
      orderIds: [],
      confirmed: true,
      reason: "Verified exact identity and scope.",
    };
    assert.equal(preview.safeParse(instructor).success, true);
    assert.equal(preview.safeParse(payroll).success, true);
    assert.equal(save.safeParse({ ...instructor, ...reviewed }).success, true);
    assert.equal(save.safeParse({ ...payroll, ...reviewed }).success, true);
    for (const value of [
      { ...instructor, actorId: "spoofed-owner" },
      { ...instructor, coachId: "" },
      { ...instructor, payrollFromMonth: "2030-04" },
      { ...payroll, coachId: "saved-coach" },
      { ...payroll, payrollFromMonth: "2030-13" },
      { ...payroll, payrollFromMonth: "2030-4" },
      { ...payroll, userId: " " },
    ])
      assert.equal(preview.safeParse(value).success, false, JSON.stringify(value));
    for (const patch of [
      { confirmed: false },
      { confirmed: undefined },
      { reason: " " },
      { reason: "four" },
      { bookingIds: Array.from({ length: 1001 }, (_, index) => `booking-${index}`) },
      { expectedBasisVersion: 0 },
      { expectedBasisVersion: 7.1 },
      { reviewDigest: "unverified" },
      { reviewDigest: undefined },
      { bookingIds: ["one", "one"] },
      { orderIds: ["one", "one"] },
      { bookingIds: [""] },
      { orderIds: undefined },
      { payeeId: "arbitrary-payee" },
      { monthly: 900000 },
      { owner: true },
    ])
      assert.equal(
        save.safeParse({ ...instructor, ...reviewed, ...patch }).success,
        false,
        JSON.stringify(patch),
      );
    assert.equal(
      save.safeParse({ ...payroll, ...reviewed, bookingIds: ["existing"] }).success,
      false,
    );
    assert.equal(save.safeParse({ ...payroll, ...reviewed, orderIds: ["pinned"] }).success, false);
    assert.equal(save.safeParse({ ...payroll, ...reviewed, monthly: 900000 }).success, false);
  } finally {
    await rm(out, { force: true });
  }
});
