import assert from "node:assert/strict";
import test from "node:test";
import contactQuery, { config } from "../netlify/edge-functions/contact-query.js";

test("contact edge canonicalizes only blank subjects and preserves real inquiries and writes", () => {
  assert.deepEqual(config.path, ["/contact", "/contact/"]);
  for (const method of ["GET", "HEAD"]) {
    for (const search of ["?subject=", "?subject=%20%20", "?subject=&source=footer"]) {
      const response = contactQuery(
        new Request("https://preview.example.invalid/contact" + search, { method }),
      );
      assert.equal(response.status, 301);
      const target = new URL(response.headers.get("location"));
      assert.equal(target.origin, "https://preview.example.invalid");
      assert.equal(target.pathname, "/contact");
      assert.equal(target.searchParams.has("subject"), false);
      assert.equal(target.searchParams.get("source"), search.includes("source") ? "footer" : null);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(contactQuery(new Request(target)), undefined, "no redirect loop");
    }
  }
  for (const path of [
    "/contact",
    "/contact?subject=Lessons",
    "/book?subject=",
    "/api/auth/callback?subject=",
  ]) {
    assert.equal(contactQuery(new Request("https://preview.example.invalid" + path)), undefined);
  }
  assert.equal(
    contactQuery(
      new Request("https://preview.example.invalid/contact?subject=", {
        method: "POST",
        body: "inquiry",
      }),
    ),
    undefined,
  );
});
