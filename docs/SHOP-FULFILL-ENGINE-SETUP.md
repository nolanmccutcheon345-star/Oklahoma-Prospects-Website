# Oklahoma Prospects premium shop — Fulfill Engine preparation

Decision: October 14, 2026. Production: https://prospectssports.club/merchandise.
This supersedes Printify as the preferred supplier for new products. Existing supplier records and their fulfillment paths are preserved. This release is a **catalog/product preparation integration**, not a complete live fulfillment integration. Purchases of Fulfill Engine products remain blocked on the server even if environment flags or product publication fields are changed.

## Supplier comparison and decision

| Requirement | Fulfill Engine | SunFrog Solutions |
| --- | --- | --- |
| Existing custom website | Public account API; direct platform integration | Advertises direct API and custom integrations; commercial onboarding required |
| Costs publicly available | Platform Connect $0/month, $0.50/item, plus garments, decoration, shipping and applicable taxes | No complete public quote verified |
| Premium brand sourcing | Brikl specifically identifies FE for Nike, Under Armour, adidas and Richardson; exact account styles require verification | Advertises Nike/Under Armour vendor network; exact purchasable styles unverified |
| Inventory and design-product APIs | Public documented account catalog, inventory, campaign designs and account-price endpoints | No comparable public contract verified in this review |
| Warehouse/bulk options | Available through plan/network arrangements; quote required | POD plus warehousing/3PL advertised |
| Shipping required by Prospects | Public API reviewed has no pre-checkout shipping quote endpoint; vendor clarification/rate agreement required | Needs vendor technical/commercial confirmation |

Choose **Fulfill Engine Platform Connect** for the first integration because its published API and costs provide a clearer path for our existing shop. This does not establish cheaper final goods or superior physical quality. Do not choose Seller Essentials hosted checkout, replace Square, or buy a paid plan merely to work around onboarding. The Game, EvoShield, Richardson PTS20/PTS30 and the exact youth/adult styles are not yet confirmed for this account.

Official references reviewed:
- https://fulfillengine.com/pages/pricing
- https://fulfillengine.com/pages/platform-connect-signup
- https://api.fulfillengine.com/openapi/index.html
- https://api.fulfillengine.com/openapi/public/swagger.json
- https://help.fulfillengine.com/en/api-guide/rest-authentication
- https://help.fulfillengine.com/en/api-guide/product-catalog
- https://help.fulfillengine.com/en/api-guide/product-catalog-inventory
- https://brikl.com/sport-apparel (partner's published brand-to-fulfiller mapping)
- https://sunfrogsolutions.com/

## Account request prepared

The Platform Connect signup is a request form, not an instant API account. Prepared organization/name/address: Oklahoma Prospects, Steve McCutcheon, 3804 S. Elm Pl., Suite A, Broken Arrow, Oklahoma 74011, United States. User must supply/confirm affiliation, contact email/phone, billing email/phone, and production-support email. **Not submitted; account and credentials not issued.** No billing method, purchases, terms acceptance or supplier outreach occurred.

After the account is issued, use Account Configuration → API keys. Store these only as production-scoped function environment variables in Netlify:
- `FULFILL_ENGINE_ACCOUNT_ID`
- `FULFILL_ENGINE_API_KEY`
- `FULFILL_ENGINE_CAMPAIGN_ID` — the campaign containing approved Prospects production designs; this is not a customer-facing storefront.

Keep credentials out of chat, source, logs and previews. Account authentication uses the official `X-API-KEY` header and account URL. The owner connection check does not certify billing, permissions, tax, product eligibility or production readiness.

## Implemented preparation workflow

The existing Shop owner controls now lead with Fulfill Engine setup, account-scoped catalog search, and decorated campaign-product import. Search results are blank styles; configure the actual manufacturing artwork in FE before importing a campaign product. The service filters the system catalog against the account's available product IDs. Brand searches return up to 50 matching styles, with an explicit total and invitation to narrow the search.

Import obtains the real saved design, SKU/color/size choices, account price per SKU and inventory. Missing designs/prices/inventory, disabled products and unsupported personalization fail without saving. SKU-derived numeric local IDs remain stable across syncs. Photos, descriptions, private notes, price overrides and archive state remain local. Each sync withdraws sample approval/publication because design IDs may be edited in place remotely. Supplier image URLs are not copied: the API says catalog image access may require a partnership agreement, and URLs may expire. Use authorized supplier photos or original product photography in the existing consistent-background studio.

All imported account prices are preliminary buying inputs: confirm whether decoration, API fees, tax and surcharges are included before setting retail. The existing 90% default markup remains editable; do not mistake it for a 90% margin. Historical target retail prices are not approved quotes for premium brands.

Six private drafts are added without variants, prices, public photos or approvals:
1. Performance Cap — target Richardson PTS20/PTS30; navy or grey/maroon; P front embroidery.
2. Performance Training Tee — target Nike/UA/adidas; navy, white, Columbia blue; P left chest.
3. Dugout Hoodie — premium fleece; navy/heather grey; PROSPECTS chest wordmark; sleeve mark optional after quote.
4. Coach Quarter-Zip — navy/maroon; P left chest.
5. Women's Performance Cap — adjustable fit; grey/maroon or navy; P embroidery.
6. Coach Cage Jacket — target Nike; navy/maroon; P left chest; no shorts.

Each has editable **Private buying & design notes**. Existing approved P/wordmark assets are the design direction; the artwork has not been uploaded or digitized for production. Embroidery requires a supplier-approved DST file, stitch count/thread selection and physical sample. Do not use mockup pixels as print-ready logo art or invent manufacturer colors/sizes.

## Remaining launch blockers — do not enable sales

1. Account approval, credentials, campaign and supplier billing arrangement.
2. Exact brand/style/size/color availability and permission to decorate/sell selected goods; sample and image approval.
3. Complete decorated costs, order fee, supplier tax/resale handling and minimum quantities.
4. A documented, vendor-approved pre-checkout shipping method. The reviewed public OpenAPI provides order validation, not a shipping quotation; post-order financials can be preliminary. Do not guess shipping, call validation a quote, or create billable orders to estimate abandoned carts. A contractual rate table may be acceptable only if FE confirms it equals the charges for our shipments, including splits, packages and surcharges.
5. Implement live order creation/recovery, production controls, cancellation and authenticated shipment tracking against that approved commercial contract. The current FE client deliberately permits read operations only; it does not create even a test order. Legacy Printify/Printful adapters remain for historical orders.
6. Existing merchant tax setup and controlled provider acceptance order, explicitly authorized for any actual charge/sample purchase. Verify customer charge, exact shipping, manufacturing charge, tracking and refunds. No customer test communications.

## Verification

New synthetic tests cover official-origin/header-only credentials, prohibited order writes, account-scoped catalog filtering, stable SKU mapping, missing designs/costs/inventory, owner access, preserved price overrides, private drafts and rejection before any customer payment/order creation. Existing shop and full release checks remain required. Passing these tests cannot certify account access, real product supply, physical quality, provider shipping or live transactions.
