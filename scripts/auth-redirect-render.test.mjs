import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

if (!process.execArgv.includes("--conditions=development")) {
  test("signed-out redirect with browser-compatible module conditions", () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ["--conditions=development", "--import", "tsx", "--test", fileURLToPath(import.meta.url)], { encoding: "utf8", timeout: 10000, env });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  });
} else test("signed-out office navigation reaches login once and preserves the original return URL", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://test.invalid/office?tab=payments", pretendToBeVisual: true });
  const keys = ["window", "document", "self", "HTMLElement", "scrollTo", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    self: dom.window, HTMLElement: dom.window.HTMLElement, scrollTo: () => {}, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.scrollTo = () => {};
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { createRouter, createMemoryHistory, createRootRoute, createRoute, RouterProvider, Outlet } = await import("@tanstack/react-router");
  const { RedirectToSignIn } = await import("../src/lib/auth/sign-in-redirect.tsx");
  const rootRoute = createRootRoute({ component: Outlet });
  const office = createRoute({ getParentRoute: () => rootRoute, path: "/office", component: RedirectToSignIn });
  const login = createRoute({ getParentRoute: () => rootRoute, path: "/login",
    validateSearch: search => ({ next: search.next }),
    component: () => createElement("h1", null, "Sign in") });
  const history = createMemoryHistory({ initialEntries: ["/office?tab=payments"] });
  const router = createRouter({ routeTree: rootRoute.addChildren([office, login]), history });
  const originalNavigate = router.navigate.bind(router);
  const redirects = [];
  router.navigate = options => {
    redirects.push(options);
    // Catch regressions before a navigation microtask loop can starve test timeouts.
    if (redirects.length > 3) return Promise.resolve();
    return originalNavigate(options);
  };
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => {
      await router.load();
      root.render(createElement(RouterProvider, { router }));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    assert.equal(redirects.length, 1, "pending router updates must not issue another redirect");
    assert.equal(router.state.location.pathname, "/login");
    assert.equal(router.state.location.search.next, "/office?tab=payments");
    assert.equal(history.length, 1, "back must not return to the rejected route");
    assert.match(document.body.textContent, /Sign in/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of keys) { if (previous[key] === undefined) delete globalThis[key]; else globalThis[key] = previous[key]; }
  }
});
