import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

test("owner financial identity review requires exact, explicit, fresh admission without adding amounts", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/office" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const user = {
    id: "verified-account",
    name: "Synthetic Instructor",
    email: "synthetic@example.invalid",
  };
  const coach = { id: "saved-coach", name: "Saved Instructor", email: user.email };
  const payee = { id: "coach:saved-coach", name: "Approved Payee", email: user.email };
  const record = { startsAt: "2030-03-02T19:00:00.000Z", endsAt: "2030-03-02T20:00:00.000Z" };
  const fixture = (globalThis.identityAdmissionFixture = {
    options: {
      mode: "basis",
      basisVersion: 7,
      accounts: [user],
      instructors: [
        { coachId: coach.id, name: coach.name, email: coach.email, staffId: "staff-one" },
      ],
    },
    previewInput: [],
    saved: [],
    failSave: false,
    failOptions: false,
    review: {
      basisVersion: 7,
      reviewDigest: "a".repeat(64),
      kind: "instructor",
      user,
      coach,
      payee,
      bookings: [{ id: "existing-booking", ...record }],
      orders: [{ id: "pinned-order", ...record }],
    },
  });
  const out = resolve("scripts/.identity-admission-render.mjs");
  const mock = `
export async function getFinancialIdentityAdmissionOptions() {
  const f=globalThis.identityAdmissionFixture;
  if(f.delayOptions) await f.delayOptions;
  if(f.failOptions) throw new Error('Could not load options');
  return f.options;
}
export async function previewFinancialIdentityAdmission({data}) {
  const f=globalThis.identityAdmissionFixture;
  f.previewInput.push(data);
  return {...f.review,kind:data.kind,...(data.kind==='payroll'?{coach:undefined,bookings:[],orders:[],payrollFromMonth:data.payrollFromMonth}:{})};
}
export async function admitFinancialIdentity({data}) {
  const f=globalThis.identityAdmissionFixture; f.saved.push(data);
  if(f.failSave) throw new Error('Financial basis changed');
  return {version:8};
}`;
  const built = await build({
    entryPoints: ["src/components/finance/financial-identity-admission.tsx"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [
      {
        name: "fixture",
        setup(b) {
          b.onResolve({ filter: /identity-admission-api$/ }, (a) => ({
            path: a.path,
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: mock,
            loader: "js",
          }));
        },
      },
    ],
  });
  await writeFile(out, built.outputFiles[0].text);
  const { FinancialIdentityAdmission } = await import(pathToFileURL(out).href);
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const host = document.getElementById("root");
  const root = createRoot(host);
  let mountKey = 0;
  let admitted = 0;
  const button = (text) =>
    [...host.querySelectorAll("button")].find((node) => node.textContent === text);
  const click = async (text) => {
    assert.ok(button(text), `Button ${text} exists`);
    await act(async () => button(text).click());
  };
  const change = async (node, value) => {
    await act(async () => {
      if (node instanceof dom.window.HTMLSelectElement) {
        node.value = value;
        node.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      } else {
        const prototype =
          node instanceof dom.window.HTMLTextAreaElement
            ? dom.window.HTMLTextAreaElement.prototype
            : dom.window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, value);
        node.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
        node.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      }
    });
  };
  const mount = async (kind = "instructor") => {
    await act(async () =>
      root.render(
        createElement(FinancialIdentityAdmission, {
          key: ++mountKey,
          kind,
          onAdmitted: async () => {
            admitted++;
          },
        }),
      ),
    );
    await click(`Review ${kind} financial access`);
  };
  const selectInstructor = async () => {
    await change(host.querySelectorAll("select")[0], user.id);
    await change(host.querySelectorAll("select")[1], coach.id);
    await click("Preview identity and scope");
  };
  const checkboxes = () => [...host.querySelectorAll("input[type=checkbox]")];
  const submit = async (count = 1) => {
    await act(async () => {
      for (let i = 0; i < count; i++)
        host
          .querySelector("form")
          .dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
  };
  try {
    await t.test(
      "exact preview, unchecked history, explicit reason and confirmation, one write",
      async () => {
        await mount();
        assert.deepEqual(
          [...host.querySelectorAll("select")].map((s) => s.value),
          ["", ""],
        );
        assert.equal(button("Preview identity and scope").disabled, true);
        await selectInstructor();
        assert.deepEqual(fixture.previewInput.at(-1), {
          kind: "instructor",
          userId: user.id,
          coachId: coach.id,
        });
        assert.match(host.textContent, /Verified account: Synthetic Instructor/);
        assert.match(host.textContent, /Instructor: Saved Instructor/);
        assert.match(host.textContent, /Payee: Approved Payee/);
        assert.match(host.textContent, /Booking existing-booking/);
        assert.match(host.textContent, /Pinned order pinned-order/);
        assert.deepEqual(
          checkboxes().map((c) => c.checked),
          [false, false, false],
        );
        assert.equal(button("Confirm financial admission").disabled, true);
        await submit();
        assert.equal(fixture.saved.length, 0);
        await change(host.querySelector("textarea"), "Owner reviewed the exact new instructor.");
        await act(async () => checkboxes().at(-1).click());
        await act(async () => checkboxes()[0].click());
        assert.equal(checkboxes().at(-1).checked, false, "changing scope clears confirmation");
        await act(async () => checkboxes().at(-1).click());
        await submit(2);
        assert.equal(fixture.saved.length, 1, "synchronous duplicate submission has one write");
        assert.deepEqual(fixture.saved[0], {
          kind: "instructor",
          userId: user.id,
          coachId: coach.id,
          expectedBasisVersion: 7,
          reviewDigest: "a".repeat(64),
          bookingIds: ["existing-booking"],
          orderIds: [],
          confirmed: true,
          reason: "Owner reviewed the exact new instructor.",
        });
        assert.equal(admitted, 1);
        assert.match(host.textContent, /admitted in version 8/);
        assert.match(host.textContent, /No payment was made/);
        assert.equal(host.querySelector("textarea"), null);
      },
    );
    await t.test("changed identity, cancel, and close discard reviewed scopes", async () => {
      await mount();
      await selectInstructor();
      await act(async () => checkboxes()[1].click());
      await change(host.querySelectorAll("select")[0], "");
      assert.equal(host.querySelector("textarea"), null);
      await change(host.querySelectorAll("select")[0], user.id);
      await click("Preview identity and scope");
      assert.deepEqual(
        checkboxes().map((c) => c.checked),
        [false, false, false],
      );
      await click("Cancel this review");
      assert.equal(host.querySelector("textarea"), null);
      await click("Preview identity and scope");
      await click("Close financial access review");
      assert.equal(host.querySelector("form"), null);
      await click("Review instructor financial access");
      assert.deepEqual(
        [...host.querySelectorAll("select")].map((s) => s.value),
        ["", ""],
      );
      assert.equal(host.querySelector("textarea"), null);
    });
    await t.test(
      "stale server rejection invalidates review and requires fresh selection",
      async () => {
        await selectInstructor();
        await change(
          host.querySelector("textarea"),
          "Reviewed before another owner made a change.",
        );
        await act(async () => checkboxes()[1].click());
        await act(async () => checkboxes().at(-1).click());
        fixture.failSave = true;
        await submit();
        assert.match(host.textContent, /Financial basis changed/);
        assert.equal(host.querySelector("textarea"), null);
        fixture.failSave = false;
        fixture.review.basisVersion = 8;
        fixture.review.reviewDigest = "b".repeat(64);
        await click("Preview identity and scope");
        assert.match(host.textContent, /Review financial version 8/);
        assert.deepEqual(
          checkboxes().map((c) => c.checked),
          [false, false, false],
        );
      },
    );
    await t.test(
      "payroll only binds an explicit month, without amount/history fields",
      async () => {
        await mount("payroll");
        await change(host.querySelector("select"), user.id);
        await change(host.querySelector("input[type=month]"), "2030-04");
        await click("Preview identity and scope");
        assert.match(host.textContent, /Payroll identity begins in 2030-04/);
        assert.equal(host.querySelector("input[type=number]"), null);
        assert.equal(checkboxes().length, 1);
        await change(host.querySelector("textarea"), "Bind payroll starting in April.");
        await act(async () => checkboxes()[0].click());
        await submit();
        assert.deepEqual(fixture.saved.at(-1), {
          kind: "payroll",
          userId: user.id,
          payrollFromMonth: "2030-04",
          expectedBasisVersion: 8,
          reviewDigest: "b".repeat(64),
          bookingIds: [],
          orderIds: [],
          confirmed: true,
          reason: "Bind payroll starting in April.",
        });
        assert.match(host.textContent, /Set and save any staffing amount separately/);
      },
    );
    await t.test(
      "loading prevents repeated changes and late results are ignored after navigation",
      async () => {
        let release;
        fixture.delayOptions = new Promise((resolve) => {
          release = resolve;
        });
        await mount();
        assert.match(host.textContent, /Loading verified identities/);
        assert.equal(button("Close financial access review").disabled, true);
        await click("Close financial access review");
        assert.match(host.textContent, /Loading verified identities/);
        await act(async () => root.render(null));
        await act(async () => {
          fixture.delayOptions = undefined;
          release();
        });
        assert.equal(host.textContent, "");
        await mount("payroll");
        assert.equal(host.querySelectorAll("select").length, 1);
        assert.equal(host.querySelector("select").value, "");
        assert.equal(host.querySelector("textarea"), null);
      },
    );
    await t.test(
      "load failure retries, no verified account stays pending, legacy makes no admission",
      async () => {
        fixture.failOptions = true;
        await mount();
        assert.match(host.textContent, /Could not load options/);
        fixture.failOptions = false;
        fixture.options.accounts = [];
        await click("Retry loading identities");
        assert.match(host.textContent, /No eligible verified accounts/);
        assert.match(host.textContent, /Self-access remains pending/);
        assert.equal(button("Preview identity and scope").disabled, true);
        fixture.options.mode = "legacy";
        await click("Reload choices");
        assert.match(host.textContent, /existing staff and payroll workflow is unchanged/);
        assert.equal(host.querySelector("form"), null);
        assert.equal(button("Confirm financial admission"), undefined);
      },
    );
  } finally {
    await act(async () => root.unmount());
    await rm(out, { force: true });
    dom.window.close();
    delete globalThis.identityAdmissionFixture;
  }
});
