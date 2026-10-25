# Prospects Pro Shop — print-on-demand rollout

**Owner decision:** Print-on-demand provider manufactures and ships each order to the customer's address. Prospects does not stock or manually ship merchandise. Shopify setup is **deferred at owner's request**.

## Intended architecture
- Prospects website Merchandise tab: branded storefront entry, product display and links to a secure Shopify-hosted checkout or embedded storefront after integration.
- Shopify: authoritative product catalog, variants, customer checkout, taxes, shipping address, payments, discounts, orders, refunds and customer communications.
- Printful (preferred initial candidate, **not yet connected**) or comparable provider: manufacturing, fulfillment, shipment/tracking and production exception handling.
- Owner admin: product approval, image upload, prices, collections, margin and order oversight. Never store card numbers in Prospects DB.
- Collections: hats, shirts, hoodies, beanies, tote bags and cage jackets. Check supplier support for each exact product, embroidery placement, Columbia blue and dark maroon color matching, sizing and decoration quality before publishing.

## Security and release gates
1. Configure Shopify account, store currency, payment processor, tax nexus and policies; no credentials in GitHub.
2. Connect and authorize POD provider. Verify exact supported blanks/variants, cost, available shipping destinations and embroidery/print quality with samples.
3. Upload owner-approved product photography and logos, create mapped draft variants; verify retail price > production cost + estimated shipping + processing/returns allowance.
4. Configure live carrier/shipping quotes, address validation, sales tax, refund/return policy, privacy and notification templates.
5. Test full sandbox/test-mode flow: checkout, duplicate webhook delivery, failed payment, provider submission, out-of-stock item, address failure, cancellation, shipment/tracking, refund, reconciliation and order status.
6. Verify customer never pays before seeing complete shipping/tax-inclusive total. Only publish when approved by owner and fulfillment actually works.
7. Keep the existing /merchandise page in pre-launch mode until all checks pass.

## Data contract
`src/lib/merchandise/pod-contract.ts` models draft catalog variants, supplier mapping, status and estimated gross margin. It is **not** a live Shopify or Printful integration. Do not imply customers can buy until release gates pass.
