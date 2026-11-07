import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { withRendered } from "./render-component-support.mjs";

const mocks = {
  "@/lib/auth/use-current-user":
    "export const useCurrentUserState=()=>({user:null,isPending:false});",
  "@/lib/shop/api":
    "export const getShop=async()=>({products:[]}); export const quoteShop=async()=>{}; export const myShopOrders=()=>globalThis.__shopOrdersRequest();",
  "@/lib/commerce/api": "export const submitSquarePayment=async()=>{};",
  "./commerce/square-card": "export const SquareCard=()=>null;",
  "@tanstack/react-router": `export const Link=({to,search,children,...props})=>globalThis.__shopOrdersCreateElement('a',{...props,href:to+(search?'?'+new URLSearchParams(search):'')},children);`,
};
async function render(props, work) {
  globalThis.__shopOrdersCreateElement = createElement;
  try {
    await withRendered("src/components/shop.tsx", "ShopOrdersPanel", props, mocks, work);
  } finally {
    delete globalThis.__shopOrdersCreateElement;
  }
}

test("shop orders wait for session and give guests a sign-in return path without fetching orders", async () => {
  let calls = 0;
  globalThis.__shopOrdersRequest = async () => {
    calls++;
    return [];
  };
  try {
    await render({ isPending: true }, async ({ host }) => {
      assert.match(host.querySelector('[role="status"]').textContent, /Checking your account/);
      assert.equal(host.querySelector("a"), null);
      assert.equal(calls, 0);
    });
    await render({ isPending: false }, async ({ host }) => {
      assert.match(host.textContent, /Sign in to view your shop orders and delivery updates/);
      const link = new URL(host.querySelector("a").href);
      assert.equal(link.pathname, "/login");
      assert.equal(link.searchParams.get("next"), "/merchandise?view=orders");
      assert.equal(calls, 0);
    });
  } finally {
    delete globalThis.__shopOrdersRequest;
  }
});

test("shop orders show loading, empty, retry and success states; repeated clicks cannot duplicate a request", async () => {
  const requests = [];
  globalThis.__shopOrdersRequest = () =>
    new Promise((resolve, reject) => requests.push({ resolve, reject }));
  try {
    await render({ userId: "synthetic-parent", isPending: false }, async ({ host, act }) => {
      assert.equal(requests.length, 1);
      assert.match(host.querySelector('[role="status"]').textContent, /Loading your shop orders/);
      assert.doesNotMatch(host.textContent, /No shop orders yet/);
      assert.equal(host.querySelector("button").disabled, true);
      await act(async () => {
        host.querySelector("button").click();
        host.querySelector("button").click();
      });
      assert.equal(requests.length, 1);
      await act(async () => requests[0].resolve([]));
      assert.match(host.textContent, /No shop orders yet/);
      await act(async () => host.querySelector("button").click());
      assert.equal(requests.length, 2);
      assert.equal(host.querySelector("button").disabled, true);
      await act(async () => requests[1].reject(new Error("Synthetic failure")));
      assert.match(host.querySelector('[role="alert"]').textContent, /could not load/);
      assert.doesNotMatch(host.textContent, /No shop orders yet/);
      assert.equal(host.querySelector("button").textContent, "Try again");
      await act(async () => host.querySelector("button").click());
      await act(async () =>
        requests[2].resolve([
          {
            id: "synthetic-order",
            created_at: "2026-11-06T12:00:00Z",
            total_cents: 1200,
            status: "pending",
            fulfillment_status: "awaiting-payment",
            shipments: [],
            snapshot: { lines: [{ label: "SYNTHETIC order item", cents: 1200 }] },
          },
        ]),
      );
      assert.match(host.textContent, /SYNTHETIC order item/);
      assert.equal(host.querySelector('[role="alert"]'), null);
    });
  } finally {
    delete globalThis.__shopOrdersRequest;
  }
});

test("leaving orders discards a late response before a different visitor opens the panel", async () => {
  let finish;
  globalThis.__shopOrdersRequest = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  try {
    await render({ userId: "synthetic-parent", isPending: false }, async ({ host }) => {
      assert.match(host.textContent, /Loading your shop orders/);
    });
    await render({ isPending: false }, async ({ host, act }) => {
      await act(async () => finish([{ id: "late-private-order" }]));
      assert.match(host.textContent, /Sign in to view your shop orders/);
      assert.doesNotMatch(host.textContent, /late-private-order|No shop orders yet/);
    });
  } finally {
    delete globalThis.__shopOrdersRequest;
  }
});
