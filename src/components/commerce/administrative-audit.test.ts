import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdministrativeAuditEvents } from "./administrative-audit";

test("administrative audit renders identity, exact target and escaped removal reason", () => {
  const html = renderToStaticMarkup(
    createElement(AdministrativeAuditEvents, {
      events: [
        {
          id: 1,
          actor_id: "owner-id",
          actor_name: "Synthetic owner",
          action: "message.remove",
          target_table: "team_chat_messages",
          target_id: "message-id",
          created_at: "2026-11-09T00:00:00Z",
          reason: "Remove <test> message",
          message_author: "Author <unsafe>",
          message_excerpt: "First <script>words</script>",
        },
      ],
    }),
  );
  assert.match(html, /Synthetic owner/);
  assert.match(html, /owner-id/);
  assert.match(html, /message-id/);
  assert.match(html, /Reason: Remove &lt;test&gt; message/);
  assert.match(html, /Author &lt;unsafe&gt;/);
  assert.match(html, /First &lt;script&gt;words&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<test>|<unsafe>|<script>/);
});
