# My shop orders sign-in repair

## Demonstrated defect and acceptance criteria

The shop header rendered My shop orders only for signed-in users. Its click handler
waited for the orders request before opening the view, without a loading state.

The repair keeps the control visible to every visitor. Selecting it immediately
opens an orders view that waits for session resolution, prompts a signed-out
visitor to sign in, or loads only the signed-in user's orders. Failed requests
offer a retry and empty accounts receive an explicit empty state. The sign-in
return URL and payment-result link open the orders view directly. Shop, bag and
orders selections use validated URL state so reload and Back/Forward preserve
navigation. Late responses are ignored when the panel is left or the account
changes.

This is a UI and navigation change. Existing server-side order authorization is
unchanged. No product, price, supplier, payment, fulfillment or customer record is
modified by the repair.

## Verification

- TypeScript check: passed.
- Netlify-targeted build (`NETLIFY=true CONTEXT=dev`, Square live disabled): passed.
- Built-server smoke (`npm run verify:build`): passed. The isolated no-database
  smoke reports its existing unavailable database/public-feed messages.
- Lint: passed with 96 warnings and no errors.
- Focused shop, Fulfill Engine and new orders-component tests: 21 passed.
- New component tests cover pending session, guest prompt and return URL, loading,
  empty account, failure/retry, success, disabled repeated requests, and a late
  response after unmount.
- The built-app browser walkthrough now covers the guest prompt, interrupted
  sign-in, successful return, own-order isolation, sign-out, refresh and browser
  Back/Forward using disposable synthetic fixtures. It could not execute here:
  Chromium fails before opening a page because its local singleton socket is
  prohibited by the execution environment, including the approved elevated
  attempt. This remains a required CI/preview verification step, not a pass.
- The full repository regression suite, hosted preview and production behavior
  were not verified during local testing. Production deployment has not occurred.
