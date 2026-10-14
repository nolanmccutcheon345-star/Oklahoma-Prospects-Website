# Oklahoma Prospects shop — implementation and launch record

Production project: `nolanmccutcheon345-star/Oklahoma-Prospects-Website`, Netlify `c49ad0ab-1b2c-412e-88d9-1f6ddf490a17`, https://prospectssports.club/merchandise. This extends the existing Better Auth accounts, PostgreSQL database, Square payment ledger, verified webhooks, reconciliation and receipt delivery. No separate customer portal or vendor storefront.

## Vendor decision

Recommend **Printful's free plan and API store** for the first collection, subject to samples. The website owns browsing, variants, cart, checkout and order history. Printful receives approved manufacturing instructions and ships directly to the customer. Neutral packaging is supported; custom packing slips can vary by fulfillment location. Printful bills Prospects separately from the Square customer payment: maintain a funded fulfillment card/wallet and allow for Square settlement delays.

| Vendor | Fit | Tradeoff |
| --- | --- | --- |
| Printful | Custom API, direct fulfillment, apparel/embroidery/accessories in one catalog | Base prices can exceed Printify; extra placements, digitization and large sizes raise costs |
| Printify | Custom API; free plan; useful price competition and broad catalog | Choose and sample a specific print provider; price, stock, shipping and quality depend on provider |
| Apliiq | Custom API and premium apparel/private labels; no setup/monthly fee for dropshipping | $1 per-item fulfillment fee plus shipping; obtain quotes for this exact assortment |

Printful Growth is optional, advertised at $24.99/month with product-dependent savings. Printify Premium is advertised at $39/month or $24.99/month billed annually. Neither subscription is required or purchased. Start free and compare actual savings against volume. A production sample, wash test and cap embroidery inspection decide quality; a vendor catalog does not prove that the mockup is manufacturable.

## Candidate blanks and illustrative unit economics

Public catalog observations on October 14, 2026; these are starting prices, **not final product quotes**. One standard decoration is included. Shipping below is the product page's advertised starting amount, not a cart guarantee; mixed products and destinations change it. No prices have been published for sale.

| Candidate | Base cost | Suggested retail | Starting shipping | Illustrative contribution |
| --- | ---: | ---: | ---: | ---: |
| Cotton Heritage M2580 hoodie | $27.84 | $55 | $8.79 | $25.01 |
| A4 N3142 performance tee | $17.64 | $32 | $4.95 | $12.99 |
| Sport-Tek ST357 quarter-zip | $23.74 | $49 | $4.95 | $23.40 |
| Richardson 112 embroidered cap | $18.25 | $32 | $4.69 | $12.39 |
| Econscious EC8000 tote | $15.87 | $29 | $4.69 | $11.85 |

Contribution = retail − base product cost − 2.9% of (retail + shipping) − $0.30, assuming the customer pays the exact shipping cost. This is before extra decoration, embroidery digitization, supplier tax, processing fees on sales tax, tax API usage, subscriptions, returns, discounts, marketing and overhead. It is not net profit. Verify the existing Square merchant's actual contract. Stripe Tax calculations currently cost $0.05 per calculation; abandoned/repeated quotes also incur usage. Calculations-only does not include tax filing or transaction reporting.

The navy hoodie includes both chest and sleeve artwork; price both placements before adopting $55. Embroidery digitization can add $6.50 per file under the vendor's applicable terms. The Richardson 112 is a candidate casual trucker, not a promise of the exact structured performance cap, mesh pattern or Columbia/navy combination in the concept. Verify current variants and youth sizing individually. A lower-cost cotton tee alternative is Bella+Canvas 3001, advertised from $11.92 at Printful; it is not the same as a polyester performance shirt.

## Implemented behavior

- Existing `/merchandise` route: responsive first-collection lookbook using the user's original concept board, clearly labeled previews; real product/color-size selectors, size guides, collection/team filters, persistent cart and own-order history.
- Owner controls on that same route: import a configured Printful sync product, review retail prices and available variants, edit description/size guide/team/category/tax code, certify physical sample/artwork approval and publish. Reimport withdraws publication and approval until reviewed. Existing server-verified owner grants control administration; coach accounts are unchanged.
- Signed-in adult/guardian checkout uses existing identity rules. Product prices, availability and revision are authoritative on the server. Shipping comes from Printful order estimation for the cart/address. Stripe Tax calculates exclusive sales tax using configured registrations and product categories. Ten-minute quote displays items, shipping, tax and total before the existing embedded Square card form.
- Provider costs include a 20% merchandise margin floor before processing/operating costs. No automatic price increase or substituted product. Changed supplier cost after payment holds the draft for owner review.
- Payment success requires the existing verified Square outcome, never a browser redirect. Idempotent requests, payment events and vendor external IDs protect against duplicate charges/manufacturing. Orders use immutable print-file IDs and variant specifications.
- Paid orders enter a leased retry queue. The worker retrieves existing vendor orders before creating drafts; only confirms a paid, non-refunded order within its saved supplier-cost cap. Authenticated polling collects status and tracking. Ambiguous vendor timeouts are retried through lookup, not blind resubmission. Repeated errors go to owner review. No unsigned fulfillment webhook.
- Full or partial Square refunds stop queued fulfillment and flag owner review. **Refunding Square does not cancel an already submitted Printful order.** Owners must cancel with the supplier if still possible and settle the customer payment separately. Orders already in production may not be cancellable. No automatic refunds or new customer charges are created by this shop worker.
- Additive migration 0062 creates product and fulfillment-detail tables linked to the existing commerce ledger, with RLS/revoked public access. All reads/writes go through authenticated server functions; customer order reads are scoped to the purchasing account. No historical registration, player, booking or payment data is imported or changed.

## Launch dependencies — checkout stays closed

1. Owner creates/connects a Printful API store and authorizes secure production-only `PRINTFUL_ACCESS_TOKEN` and `PRINTFUL_STORE_ID` configuration. Configure vendor billing and return address. Do not paste secrets into a PR or chat.
2. Supply original high-resolution/vector Prospects logo files, production color specifications and permission to use them. The collage is a visual concept, not production-ready garment artwork. Configure each actual blank, placement, color, size and price in Printful; obtain and approve samples before publication.
3. Configure the existing Stripe account's Tax business address, registrations and billing as appropriate, with a dedicated production `SHOP_STRIPE_TAX_SECRET_KEY`; assign valid `txcd_########` categories to each product. Set `SHOP_TAX_CONFIGURED=true` only after professional/owner review of applicable collection rules. This implementation uses **Calculations API only**; tax returns, remittance and Stripe transaction reporting are not automated. Keep sales/tax ledger records and arrange filing separately.
4. Install a unique production-only `SHOP_WORKER_SECRET`. Preview environments must not receive live vendor/tax credentials. Production Square full-catalog configuration must remain valid; existing booking payments are not changed.
5. Verify provider draft creation, actual costs, sizes/stock, destination quotes, funded vendor billing and tracking with an explicitly approved controlled sample/acceptance order. Printful lacks a conventional free manufacturing sandbox; injected-provider tests are not live fulfillment proof. A real sample purchase or real payment needs separate approval. Do not test with customer identities or contact information.
6. Review delivery/returns copy and support contact, then set `MERCH_LIVE_ACCEPTED=true` and `MERCH_CHECKOUT_ENABLED=true` **in production only** after acceptance. No enabling flags, paid subscriptions, sample purchases or charges were made in this implementation.

Customer orders initially ship within the US only, using Standard shipping. The cart must quote shipping; never apply the single-item estimates above to a mixed cart. Production commonly takes 2–5 business days before transit, but the storefront gives no guaranteed arrival date. Size/remorse returns are not generally covered by Printful; defects/loss follow supplier reporting deadlines. Decide any more generous club policy before launch. Tracking appears in My shop orders; carrier links may leave the site. There is no vendor storefront redirect in checkout.

## Verification and operational limits

Disposable database fixtures cover totals, identity/owner permissions, price tampering, duplicate carts/requests/events, provider timeout recovery, no manufacturing before verified payment, supplier-cost changes, refunds, shipment tracking, invalid files and tax-provider result validation. The built-app browser walkthrough covers 320/390/768/1280 layouts, size choice, quantity, cart persistence, guest restrictions, authenticated owner product saving, disconnected-import handling and closed-checkout behavior. CI retains all existing instructor, public navigation, tryout, full regression, lint and dependency-audit gates.

These checks do not prove a real Square payment, Printful manufactured sample, real shipment, provider account connection or email inbox delivery. Production release SHA, CI and hosted smoke receipts belong in the release PR. The worker processes one order per five-minute tick (up to 12 operations/hour, including tracking polls); increase a bounded batch/cadence before higher volume. Owner review cases deliberately require human resolution; no customer self-service manufacturing cancellation. No unrelated permission changes, including Sarah's existing coach role.

## Primary sources

- [Printful API](https://developers.printful.com/docs/), [shipping](https://www.printful.com/shipping), [pricing components](https://help.printful.com/hc/en-us/articles/50262099109777-How-does-Printful-s-product-pricing-work), [billing](https://help.printful.com/hc/en-us/articles/50264607936785-How-does-the-Printful-billing-system-work), [returns](https://help.printful.com/hc/en-us/articles/50263870468753-What-is-Printful-s-return-and-refund-policy).
- [M2580](https://www.printful.com/custom/womens/all/unisex-premium-hoodie-cotton-heritage-m2580), [N3142](https://www.printful.com/custom/mens/t-shirts/unisex-performance-crew-neck-t-shirt-a4-n3142), [ST357](https://www.printful.com/custom/mens/hoodies-sweatshirts/unisex-quarter-zip-pullover-sport-tek-st357), [Richardson 112](https://www.printful.com/custom/embroidered/trucker-hats/snapback-trucker-cap-richardson-112), [EC8000](https://www.printful.com/custom/collections/embroidery/eco-tote-bag-econscious-ec8000).
- [Printify API](https://developers.printify.com/), [Printify plans](https://printify.com/pricing/), [Apliiq API](https://help.apliiq.com/portal/en/kb/articles/apliiq-api-overview), [Apliiq shipping/fulfillment](https://help.apliiq.com/portal/en/kb/articles/how-do-shipping-fees-work-with-dropshipping).
- [Square on-site payments and pricing](https://developer.squareup.com/us/en/online-payment-apis), [Stripe Tax calculations](https://docs.stripe.com/api/tax/calculations/create), [Stripe Tax API usage pricing](https://support.stripe.com/questions/stripe-tax-api-pay-as-you-go-pricing-examples?locale=en-GB).
