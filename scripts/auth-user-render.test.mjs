import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useAppUser } from "../src/lib/auth/use-app-user.ts";

test("completed requests and session refreshes do not restart user-dependent effects", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://test.invalid" });
  const previous = { window: globalThis.window, document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById("root"));
  let requests = 0;
  let currentUser;
  function Screen({ sessionUser, unrelatedUpdate }) {
    const user = useAppUser(sessionUser);
    currentUser = user;
    const [result, setResult] = useState(null);
    useEffect(() => {
      if (!user) return;
      requests++;
      // A cap makes a regression fail promptly instead of hanging the test runner.
      if (requests <= 5) void Promise.resolve({ loaded: true }).then(setResult);
    }, [user]);
    return createElement("p", null, `${result ? "Loaded" : "Loading"} ${unrelatedUpdate}`);
  }
  const sessionUser = { id: "owner-a", name: "Owner", email: "owner@example.test" };
  async function render(user, update = 0) {
    await act(async () => {
      root.render(createElement(Screen, { sessionUser: user, unrelatedUpdate: update }));
    });
  }
  try {
    await render(sessionUser);
    assert.equal(requests, 1, "updating state after a request must not fetch again");
    assert.match(document.body.textContent, /Loaded/);
    const firstUser = currentUser;
    await render({ ...sessionUser }, 1);
    assert.equal(currentUser, firstUser, "an unchanged session refresh keeps the same identity");
    assert.equal(requests, 1);
    await render({ ...sessionUser, name: "Updated owner" }, 2);
    assert.equal(currentUser.displayName, "Updated owner");
    assert.equal(requests, 2, "actual profile changes remain observable");
    await render(null);
    assert.equal(currentUser, null, "signing out must clear the user");
    await render({ ...sessionUser, id: "owner-b" });
    assert.equal(currentUser.id, "owner-b");
    assert.equal(requests, 3, "switching accounts must refresh account-dependent data");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});
