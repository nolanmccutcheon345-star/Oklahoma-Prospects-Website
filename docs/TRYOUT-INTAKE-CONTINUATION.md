# W3/W4: remove unsupported dates and accept every age group

First focused slice from main 334cf4a. Removed the hard-coded November 14–15 evaluation schedule, November 21 makeup claim and special opening hours from public tryout pages, FAQ and account guidance. No legacy requests are edited or deleted.

Both sports accept individual tryout requests for any age group. Suggested ages are a datalist, not eligibility restrictions. Public form and server use the same explicit individual-request marker; stale pages cannot claim an old scheduled reservation. Sport and player/guardian/contact information still use the existing server input validation, rate limit, UUID retry/idempotency and office queue. The request is not an agreed private appointment. No new response deadline or automatic enrollment promise is published.

Remaining W3/W4 work: admin-managed events with sport/age/season, date/time/location, capacity/status; durable matching and automatic group enrollment with duplicate/capacity protection; notifications; private appointment confirmation. Those features are not implemented by this slice. Their database migrations, roles and notification isolation require focused verification. Existing requests remain in the office queue for staff follow-up.

No Square integration, migration, production data mutation or message to families is included. Existing bot branches remain unchanged.
