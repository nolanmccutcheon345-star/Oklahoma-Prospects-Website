# Retail shop collections and coming-soon products

The existing product/photo/pricing/import/order tools remain in place. Front Office now has a Shop section; the storefront's owner controls still open the same editor. Owner authorization remains enforced by every server mutation.

## Administration

In **Front Office → Shop → Shop collections & filters**, edit the first group for collection tabs and subsequent groups for combinable dropdown filters. Initial choices include Hats, T-shirts, Long sleeve, Hoodies, Pants, Accessories; Baseball/Softball; Men's/Women's/Unisex; Youth/Adult. These are persisted defaults, not fixed UI categories. Add, rename, reorder or remove groups and choices. Each product's Collections & filters section accepts multiple choices. Product category and team labels remain available for existing catalogs. Removing navigation choices never deletes products or orders; stable IDs retain assignments when labels or order change. Save product edits before changing navigation settings.

To preview a new product, create its draft, upload/approve a photo using the existing studio, add a description, assign collections, and select **Coming soon — show a preview and prevent orders** and **Publish this product**. The public card/detail shows a corner badge and disabled button; unconfigured sizes/prices are omitted. Sample approval, supplier variants, size guide and tax configuration are required by the existing selling workflow when coming soon is turned off. Fulfill Engine's existing launch blocker remains in effect.

## Data and checkout

Append-only migration 0097 adds coming_soon and collection_ids to products plus editable navigation to shop_settings. It preserves existing publication, sample approval, prices, fulfillment data and orders. Exact existing categories are assigned matching initial product collections once; ambiguous categories are left intact. Generated Netlify migration is prepared by the existing build script. No runtime schema writes or new dependencies.

Coming-soon products can expose approved public photos without physical sample approval. Drafts, archives, removed gallery photos and unapproved images remain private. Public projections exclude private buying notes and supplier manufacturing details. Server selection rejects coming-soon cart lines; payment revalidation rejects products changed after a quote. Existing paid-order fulfillment and financial history remain intact. Updating navigation uses the settings revision lock and audit log without repricing products.

## Acceptance evidence

Targeted migrated-database tests cover combined filters, renaming, strict navigation validation, owner scope, stale saves, prices preserved, preview publication without supplier setup, public/private images, sale readiness, removed cover withdrawal, stale cart quotes and pre-payment rejection. The isolated built-app shop walkthrough exercises real owner saves, photo upload, custom labels, multiple product assignments, public filters and empty results, preview detail, disabled purchase controls and mobile reflow. Required release CI and exact-source Netlify preview/production checks remain mandatory. Synthetic tests do not certify real supplier fulfillment or payments; no live orders or test products are created for this release.
