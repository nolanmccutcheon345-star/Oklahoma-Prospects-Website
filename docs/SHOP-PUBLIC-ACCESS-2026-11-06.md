# Public shop and owner controls separation

The owner requested that public merchandise pages never render Shop Owner Controls, with the full editor retained under `/office?section=shop`. No product, price, publication status, order, Fulfill Engine setting, dependency, migration or deployment setting is changed by this fix.

## Changes

- Remove the editor import, permission lookup, toggle and editor view from the public Shop component used by both merchandise routes. It remains available only in the authenticated, server-authorized Office Shop section.
- Render management UI only after `getShopOffice` authorizes the current signed-in identity. Clear the result on identity/loading changes and remount the Office workspace when accounts change. Existing verified-session and active-owner-grant checks remain authoritative for every read and mutation.
- Reject `/merchandise/draft-*` before querying products. Resolve all other detail URLs against the server's published public projection, returning HTTP 404 for unavailable products.
- Products deliberately published as Coming soon can retain internal draft IDs. Give those products deterministic `product-<hash>` public URLs rather than hiding them or changing their records. Existing cart/product IDs remain unchanged for checkout compatibility; the IDs are not secrets. Aliases do not grant access to unpublished or archived products.

## Acceptance coverage

The isolated shop walkthrough uses synthetic accounts and a disposable database. It checks guest public collection/detail, owner public pages, no owner button/panel/sample-approval wording, raw draft URL 404, published coming-soon alias, archived alias 404, owner Office CRUD/pricing/photo/collections, signed-out Office redirect, and actual compiled HTTP denial of office reads and draft creation for anonymous, parent, coach and ungranted-admin users. The existing pricing and supplier regression suite remains unchanged apart from new URL assertions.

Release requires typecheck, build, built SSR, isolated shop browser walkthrough and the existing GitHub verification gates. Exact preview/production commit and hosted results are recorded on the PR. No live customer account, product edit, provider transaction or payment is used for testing.
