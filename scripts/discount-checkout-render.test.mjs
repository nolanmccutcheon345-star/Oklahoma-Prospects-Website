import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

// Render the real checkout component; replace only network/auth/router boundaries.
// All identities, responses and payments in this test are synthetic and local.
test("checkout displays applied savings, rejects stale results, and sends only the reviewed discount", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/pay" });
  const previous = {};
  for (const key of ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"])
    previous[key] = globalThis[key];
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { calculateQuote } = await import("../src/lib/commerce/contracts.ts");
  const { applyDiscount } = await import("../src/lib/commerce/discounts.ts");
  const products = [
    {
      id: "individual",
      price: 50,
      kind: "cage",
      name: "Household cage",
      active: true,
      minutes: 60,
      credits: 0,
      remote: 0,
      expires_days: 0,
      hours: 0,
      discipline: "Cage",
    },
  ];
  const fixture = {
    user: { id: "parent", displayName: "Test parent", primaryEmail: "parent@example.invalid" },
    search: {
      kind: "cage",
      id: "individual",
      date: "2028-06-01",
      time: "16:00",
      cages: "1",
      minutes: 60,
      use: "household",
    },
    payments: [],
    pending: null,
  };
  fixture.context = async () => ({
    products,
    athletes: [],
    coaches: [],
    mode: "test",
    square: {
      environment: "sandbox",
      applicationId: "fixture",
      locationId: "fixture",
      checkoutScope: "cages",
    },
  });
  fixture.quote = async ({ data }) => {
    const quote = calculateQuote(data, products[0], false, products, false);
    const response = {
      quote: data.discountCode
        ? applyDiscount(quote, {
            id: "fixture",
            code: data.discountCode,
            kind: "percentage",
            value: 1000,
            version: 3,
            purchase_types: ["cage"],
            active: true,
            starts_on: null,
            ends_on: null,
          })
        : quote,
      slots: [
        { value: "16:00", label: "4:00 PM" },
        { value: "17:00", label: "5:00 PM" },
      ],
    };
    if (data.discountCode === "SLOW")
      return new Promise((resolve) => {
        fixture.pending = () => resolve(response);
      });
    if (data.discountCode === "INVALID") throw new Error("Discount code not found.");
    return response;
  };
  fixture.start = async ({ data }) => {
    fixture.payments.push(data);
    return {
      orderId: "fixture",
      totalCents: data.discountCode ? 4500 : 5000,
      chargeCents: data.discountCode ? 4500 : 5000,
      holdUntil: "2028-06-01T21:00:00Z",
      recurring: false,
    };
  };
  globalThis.__discountUiFixture = fixture;
  const mocks = {
    "@tanstack/react-router": `import {createElement} from 'react'; export const createFileRoute=()=>options=>({...options,useSearch:()=>globalThis.__discountUiFixture.search}); export const Link=({children,...props})=>createElement('a',null,children);`,
    "@/lib/auth/use-current-user": `export const useCurrentUser=()=>globalThis.__discountUiFixture.user;`,
    "@/lib/commerce/api": `export const getCheckoutContext=(...a)=>globalThis.__discountUiFixture.context(...a); export const getCheckoutQuote=(...a)=>globalThis.__discountUiFixture.quote(...a); export const startCheckout=(...a)=>globalThis.__discountUiFixture.start(...a); export const submitSquarePayment=()=>{throw new Error('No real payments in fixture')};`,
    "@/components/commerce/square-card": `import {createElement} from 'react'; export const SquareCard=({amountCents})=>createElement('p',{'data-payment-cents':amountCents},'Test payment fields');`,
    "@/lib/seo": `export const pageHead=()=>({});`,
  };
  const out = resolve("artifacts/discount-checkout-render.mjs");
  await mkdir("artifacts", { recursive: true });
  const bundle = await build({
    entryPoints: ["src/routes/pay.tsx"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [
      {
        name: "synthetic-boundaries",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) =>
            mocks[args.path] ? { path: args.path, namespace: "fixture" } : null,
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            contents: mocks[args.path],
            loader: "js",
          }));
        },
      },
    ],
  });
  await writeFile(out, bundle.outputFiles[0].text);
  const { Route } = await import(pathToFileURL(out).href);
  const root = createRoot(document.getElementById("root"));
  const button = (text) =>
    [...document.querySelectorAll("button")].find((e) => e.textContent.includes(text));
  const field = (text) =>
    [...document.querySelectorAll("label")]
      .find((e) => e.firstChild?.textContent.trim() === text)
      ?.querySelector("input");
  const type = async (el, value) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(
        el,
        value,
      );
      el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  const click = async (text) =>
    act(async () => {
      assert.ok(button(text), text);
      button(text).click();
    });
  try {
    await act(async () => {
      root.render(createElement(Route.component));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    assert.equal(button("Continue to payment").disabled, false);
    await type(field("Discount code"), "SAVE10");
    assert.equal(button("Continue to payment").disabled, true);
    await click("Apply code");
    assert.match(document.body.textContent, /You save \$5/);
    assert.match(button("Continue to payment").textContent, /45/);
    await click("5:00 PM");
    assert.equal(
      button("Continue to payment").disabled,
      true,
      "basket change invalidates prior discounted quote",
    );
    await click("4:00 PM");
    await type(field("Discount code"), "SLOW");
    await click("Apply code");
    assert.ok(fixture.pending);
    await click("Remove code");
    await act(async () => fixture.pending());
    assert.doesNotMatch(document.body.textContent, /SLOW applied/);
    assert.match(button("Continue to payment").textContent, /50/);
    await type(field("Discount code"), "INVALID");
    await click("Apply code");
    assert.match(document.body.textContent, /Discount code not found/);
    assert.equal(button("Continue to payment").disabled, true);
    await type(field("Discount code"), "SAVE10");
    await click("Apply code");
    await act(async () =>
      document
        .querySelector("form")
        .dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
    );
    assert.equal(fixture.payments.length, 1);
    assert.equal(fixture.payments[0].discountCode, "SAVE10");
    assert.equal(fixture.payments[0].discountVersion, 3);
    assert.equal(
      document.querySelector("[data-payment-cents]").getAttribute("data-payment-cents"),
      "4500",
    );
  } finally {
    await act(async () => root.unmount());
    await rm(out, { force: true });
    dom.window.close();
    delete globalThis.__discountUiFixture;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test("front-office controls create, edit, deactivate and reactivate persistent code definitions", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/office" });
  const previous = {};
  for (const key of ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"])
    previous[key] = globalThis[key];
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const rows = [],
    writes = [];
  globalThis.__discountAdminFixture = {
    load: async () => rows.map((r) => ({ ...r })),
    save: async ({ data }) => {
      writes.push(data);
      const row = {
        id: data.id || "fixture",
        version: (data.version || 0) + 1,
        code: data.code,
        kind: data.kind,
        value: data.value,
        starts_on: data.startsOn,
        ends_on: data.endsOn,
        purchase_types: data.purchaseTypes,
        active: data.active,
      };
      const index = rows.findIndex((r) => r.id === row.id);
      if (index < 0) rows.push(row);
      else rows[index] = row;
      return row;
    },
  };
  const out = resolve("artifacts/discount-admin-render.mjs");
  await mkdir("artifacts", { recursive: true });
  const bundle = await build({
    entryPoints: ["src/components/commerce/discount-office.tsx"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [
      {
        name: "admin-network-fixture",
        setup(b) {
          b.onResolve({ filter: /^@\/lib\/commerce\/discounts-api$/ }, (args) => ({
            path: args.path,
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: `export const getDiscountCodes=()=>globalThis.__discountAdminFixture.load();export const saveDiscountCode=(...a)=>globalThis.__discountAdminFixture.save(...a);`,
            loader: "js",
          }));
        },
      },
    ],
  });
  await writeFile(out, bundle.outputFiles[0].text);
  const { DiscountOffice } = await import(pathToFileURL(out).href);
  const root = createRoot(document.getElementById("root"));
  const field = (text) =>
    [...document.querySelectorAll("label")]
      .find((e) => e.firstChild?.textContent.trim() === text)
      ?.querySelector("input,select");
  const type = async (el, value) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        el.tagName === "SELECT"
          ? dom.window.HTMLSelectElement.prototype
          : dom.window.HTMLInputElement.prototype,
        "value",
      ).set.call(el, value);
      el.dispatchEvent(
        new dom.window.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }),
      );
    });
  const click = async (name) =>
    act(async () => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => (b.getAttribute("aria-label") || b.textContent) === name,
      );
      assert.ok(b, name);
      b.click();
    });
  const submit = async () =>
    act(async () =>
      document
        .querySelector("form")
        .dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
    );
  try {
    await act(async () => root.render(createElement(DiscountOffice)));
    await type(field("Code"), "FAMILY10");
    await type(field("Percent off"), "12.5");
    await type(field("Starts on (optional)"), "2028-01-01");
    await type(field("Valid through (optional)"), "2028-01-31");
    const purchase = (text) =>
      [...document.querySelectorAll("label")]
        .find((e) => e.textContent.trim() === text)
        .querySelector("input");
    await act(async () => purchase("Assessments").click());
    await submit();
    assert.deepEqual(writes[0].purchaseTypes, ["cage", "assessment"]);
    assert.equal(writes[0].value, 1250);
    assert.equal(writes[0].active, false);
    assert.equal(rows[0].ends_on, "2028-01-31");
    await click("Edit FAMILY10");
    assert.equal(purchase("Assessments").checked, true);
    await act(async () => purchase("Cage and fielding rentals").click());
    await act(async () => purchase("Assessments").click());
    assert.equal(
      [...document.querySelectorAll("button")].find((b) => b.textContent === "Save changes")
        .disabled,
      true,
    );
    await act(async () => purchase("Lesson packages").click());
    await type(field("Discount type"), "fixed");
    await type(field("Amount off ($)"), "7.25");
    await submit();
    assert.equal(rows[0].value, 725);
    assert.equal(rows[0].kind, "fixed");
    assert.equal(rows[0].version, 2);
    assert.deepEqual(rows[0].purchase_types, ["package"]);
    await click("Activate FAMILY10");
    assert.equal(rows[0].active, true);
    await click("Deactivate FAMILY10");
    assert.equal(rows[0].active, false);
    await click("Refresh codes");
    assert.match(document.body.textContent, /FAMILY10/);
    assert.match(document.body.textContent, /\$7.25 off/);
  } finally {
    await act(async () => root.unmount());
    await rm(out, { force: true });
    dom.window.close();
    delete globalThis.__discountAdminFixture;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
