import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "./render-component-support.mjs";
test("front office sidebar and mobile More navigate to every workspace and preserve existing content", async () => {
  const selected = [];
  await withRendered(
    "src/components/front-office-shell.tsx",
    "FrontOfficeShell",
    {
      section: "dashboard",
      name: "Synthetic Admin",
      preview: true,
      onSection: (id) => selected.push(id),
      children: "Existing workspace tools",
    },
    { "@/lib/auth/gates": "export const UserButton=()=>null;" },
    async ({ host, act }) => {
      const nav = host.querySelector('nav[aria-label="Front Office"]');
      const expected = [
        "Dashboard",
        "Requests",
        "Teams & Players",
        "Tournament Finder",
        "Evaluations",
        "Bookings",
        "Camps & Clinics",
        "Payments",
        "Finance",
        "Services & Pricing",
        "Shop",
        "Staff & Access",
        "Reports",
      ];
      assert.deepEqual(
        [...nav.querySelectorAll("button")].map((b) => b.textContent),
        expected,
      );
      assert.equal(nav.querySelector('[aria-current="page"]').textContent, "Dashboard");
      for (const b of nav.querySelectorAll("button")) await act(async () => b.click());
      assert.equal(new Set(selected).size, expected.length);
      assert.match(host.textContent, /Existing workspace tools/);
      const mobile = host.querySelector('nav[aria-label="Front Office mobile"]');
      await act(async () =>
        [...mobile.querySelectorAll("button")]
          .find((b) => b.textContent.startsWith("More"))
          .click(),
      );
      assert.ok(host.querySelector("#office-more"));
      await act(async () =>
        [...host.querySelectorAll("#office-more button")]
          .find((b) => b.textContent === "Tournament Finder")
          .click(),
      );
      assert.equal(selected.at(-1), "tournaments");
      assert.equal(host.querySelector("#office-more"), null);
    },
  );
});
