# Oklahoma Prospects — Printify shop setup

The owner selected **Printify's free plan** on October 14, 2026. This supersedes the earlier Printful recommendation. Production stays at https://prospectssports.club/merchandise, with existing Better Auth accounts, PostgreSQL records and embedded Square checkout. Customers do not use a Printify storefront. Historical Printful products/orders retain their supplier identity and fulfillment adapter.

## Product and pricing controls

Sign in with an existing owner account and open **Shop owner controls** on the Shop page.

- **Create product draft** starts a local listing before the supplier is connected. Edit title, description, category, team collection and size guide. Link the actual Printify product ID when its production design is ready.
- **Import product** imports configured supplier variants and production costs. Printify remains the manufacturing design tool: choose the blank, print provider, sizes, colors and exact artwork placements there. Product costs and shipping must be checked for that provider; the earlier Printful catalog estimates are not Printify quotes.
- Default pricing is **90% markup on vendor cost**, rounded up to the nearest cent: $20 cost becomes $38 retail, a 47.37% gross margin before expenses. The owner may change the store default; products following it update together, and outstanding quotes are invalidated by revision checks.
- Each product can use the store default, its own markup, a target gross margin, or fixed retail pricing. Each size can override the pricing cost and/or retail price. An override of pricing cost does not change the real supplier charge. Actual supplier production costs are checked separately, and checkout refuses a merchandise subtotal below that actual cost.
- Previously approved target retail prices remain useful fixed-price choices: hoodie $55, performance tee $32, quarter-zip $49, cap $32, tote $29. They have not been assigned to fictitious supplier products. Validate the actual Printify blank and decorated cost first.
- **Sync supplier costs & variants** refreshes costs and availability while preserving local descriptions, photos and price overrides. Changed manufacturing specifications withdraw sample approval and publication. Same-design cost refresh retains approval and recalculates rule-based prices. New variants inherit the product rule.
- **Remove product from shop → Confirm archive** withdraws an item. Show archived products and choose **Restore as draft** to recover it. Order history is preserved. Removing a supplier product in Printify may affect pending orders; archive the website listing instead when simply stopping sales.
- Product, price, image and archival changes record the owner and timestamp in the shop audit history.

## Consistent retail photography

The product photo studio prepares a **1000 × 1000 PNG**, a shared light background (#f4f6f8), centered product and consistent padding. Use the same product angle and lighting for each cover image. Transparent PNG/WebP cutouts give the cleanest result. JPG/PNG/WebP flat-background photos can use the local background removal option; inspect white garments, edges and logo colors before saving. Complex scenes need a prepared cutout; this is not an AI scene-removal service.

Choose product scale, enter an image description, optionally associate the photo with variants, then **Use prepared photo**. Up to eight photos per product are supported. Set the cover image or remove gallery photos. Individual `/merchandise/{productId}` pages show larger photos, gallery controls, size selection, description and size guide. All cards and product pages share the existing Prospects styling. Original upload files are processed in the browser; the prepared PNG is stored in the existing database. Draft/archived images require owner access and are not publicly cached.

A studio photo, real supplier variants, approved physical sample/artwork, description, size guide and tax category are required before publishing a new Printify product. Publication and payment activation are separate: checkout remains closed until live acceptance is complete.

## Account connection

1. Complete free signup at https://printify.com/app/auth/register. Account creation requires the user to choose credentials and accept Printify's terms. No paid plan was purchased and no account was created by this release.
2. Add a dedicated **Printify API** store called **Oklahoma Prospects**. Do not choose a Pop-Up Store or connect a marketplace store for this integration.
3. In the store's Order settings choose **Manual** approval, disable automatic **Order Routing**, and verify the shipping origin/return details. New stores default to 24-hour automatic approval; that default is unsuitable for the site's guarded submission workflow.
4. Set billing currency to **USD** and add the funded card or wallet that Printify will charge. Square customer payments and Printify supplier charges are separate transactions. No payment card or funding was added here.
5. In Printify Connections, provide the developer contact and generate a personal API token with `shops.read`, `products.read`, `orders.read`, and `orders.write`. Additional write scopes for products/uploads are not needed: production artwork is configured in Printify, while website photos and retail prices are managed here. Tokens currently expire after one year. Never paste the token into chat, product fields, a PR or source code.
6. Add production-only Netlify function environment variables: `PRINTIFY_ACCESS_TOKEN`, `PRINTIFY_SHOP_ID`, `PRINTIFY_MANUAL_APPROVAL_CONFIRMED=true`, `PRINTIFY_USD_CONFIRMED=true`, and `PRINTIFY_ROUTING_DISABLED_CONFIRMED=true`. Set confirmation flags only after verifying those settings. The current API exposes shop identity but not these store settings; the flags are operator attestations, not automatic verification.
7. Reuse the existing production Square configuration. Configure `SHOP_STRIPE_TAX_SECRET_KEY`, `SHOP_TAX_CONFIGURED=true`, and a unique `SHOP_WORKER_SECRET` as described in the original shop report. Stripe Tax is used only for calculations; it does not receive the Square payment and does not automatically file/remit taxes. Keep live credentials out of previews.
8. Redeploy through the existing GitHub/Netlify workflow and use **Check Printify connection**. It confirms access to the selected shop using the authenticated API and displays its reported sales channel, without returning secrets. Verify the dedicated API store and approval settings in Printify; this check does not certify them automatically.
9. Import actual products, approve samples/photos, and complete an explicitly authorized controlled real order. Verify quantity-specific supplier costs, shipping, supplier tax, customer tax, Square receipt, production and tracking. Then enable `MERCH_LIVE_ACCEPTED=true` and `MERCH_CHECKOUT_ENABLED=true` in production and redeploy. Neither flag was enabled in this release.

## Shipping and fulfillment behavior

- Initial scope is US delivery using Standard shipping. Printify's `/orders/shipping.json` quotes the actual cart/address; that exact integer-cent shipping charge goes to checkout with **zero markup**. Sales tax is a separate line.
- Supplier variants and manufacturing fingerprints are checked before quoting and before order submission. Customers cannot submit their own totals, vendor costs or artwork IDs.
- A paid order is created in the manually approved Printify store, checked against the saved supplier cost cap and exact shipping quote, then sent to production. Changed production cost, supplier tax or shipping puts the order into owner review without automatically charging extra or approving manufacture. Supplier tax is not silently assumed to be zero; a nonzero supplier tax can cause a review hold against the initial product-plus-shipping cap. Resolve the supplier tax/resale setup during the controlled acceptance order.
- A durable create-attempt marker and remote-order recovery prevent blind duplicate creation following a timeout. Recovery checks up to 30 recent orders; if an ambiguous create cannot be identified, the order goes to owner review instead of creating another. Inspect Printify before any manual intervention.
- Tracking is read through the authenticated API and displayed in the customer's existing account. Supplier shipping notifications are disabled; the existing site payment receipt system remains in use. Real inbox delivery is not certified by synthetic tests.
- Square refunds stop queued fulfillment and flag owner review. A customer refund does not cancel an already submitted supplier order. Cancel an eligible unsubmitted Printify order separately; production may be irreversible.
- The worker processes one operation per five-minute tick, with tracking polls every 30 minutes. Higher order volume needs a bounded batch/cadence change.

## Verification and limits

Isolated tests cover markup/margin arithmetic, overrides, global repricing, owner authorization, product archival/restoration, private photo access, PNG validation, exact shipping pass-through, manufacturing changes, duplicate/ambiguous supplier requests, cost changes, shipment tracking and the existing Square payment rules. The built-app browser walkthrough exercises product detail navigation, cart persistence, owner forms, product creation/archive/restore, photo preparation/upload, price editing and 320/390/768/1280 layouts.

This release does not prove a real Printify account connection, live Square merchandise payment, manufactured sample, shipment or inbox delivery. The exact release/CI/production receipt is recorded in the GitHub PR. Sales remain closed pending the connection and acceptance steps above.

## Official references

- Printify API: https://developers.printify.com/
- Free plan: https://printify.com/pricing/
- API token: https://help.printify.com/hc/en-us/articles/4483626447249-How-can-I-generate-an-API-token
- Manual order approval: https://help.printify.com/hc/en-us/articles/4483625253265-How-do-I-set-up-store-details-and-order-approval-settings
- Currency settings: https://help.printify.com/hc/en-us/articles/12203640151953-How-do-I-change-the-currency-on-Printify
- Returns and defects: https://help.printify.com/hc/en-us/articles/4483630299025-How-does-Printify-handle-refunds-and-returns
