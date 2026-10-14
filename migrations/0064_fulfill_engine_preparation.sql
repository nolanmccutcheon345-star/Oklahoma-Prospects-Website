-- Additive supplier transition. Legacy products and orders keep their supplier identity.
alter table shop_products drop constraint shop_products_provider_check;
alter table shop_products add constraint shop_products_provider_check check(provider in ('printful','printify','fulfill-engine'));
alter table shop_order_details drop constraint shop_order_details_provider_check;
alter table shop_order_details add constraint shop_order_details_provider_check check(provider in ('printful','printify','fulfill-engine'));
alter table shop_products add column preparation_notes text not null default '';

-- Private buying/design briefs only: no invented SKUs, inventory, photos, costs or approvals.
insert into shop_products(id,title,category,image_url,variants,provider,pricing_mode,image_approved,updated_by,preparation_notes) values
('launch-performance-cap','Prospects Performance Cap','Headwear','','[]','fulfill-engine','default',false,'shop-launch-0064','Target Richardson PTS20 or PTS30; The Game is an alternative only after supplier confirmation. Navy and grey/maroon. Structured performance/stretch fit, not trucker-only. Embroidered existing P mark on front. Confirm exact model, size range, stitch count, thread colors, decorated unit cost and sample.'),
('launch-training-tee','Prospects Performance Training Tee','Training','','[]','fulfill-engine','default',false,'shop-launch-0064','Target Nike Dri-FIT, Under Armour or adidas performance tee, including youth options if available. Navy, white and Columbia blue. Existing P mark on left chest; retain manufacturer branding. Confirm fabric, placement, exact print dimensions and decorated sample. No brand/model is approved yet.'),
('launch-dugout-hoodie','Prospects Dugout Hoodie','Hoodies','','[]','fulfill-engine','default',false,'shop-launch-0064','Target Nike, Under Armour or adidas fleece. Navy and heather grey. PROSPECTS chest lettering based on the supplied mockup; prepare and approve production lettering artwork. Optional existing P sleeve mark only after confirming location cost. Verify actual colors, youth/adult sizing and printing compatibility.'),
('launch-coach-quarterzip','Prospects Coach Quarter-Zip','Coaches','','[]','fulfill-engine','default',false,'shop-launch-0064','Target Nike, Under Armour or adidas performance quarter-zip. Navy or maroon with existing P mark on left chest. Preserve manufacturer mark. Confirm embroidery compatibility, placement and full cost.'),
('launch-womens-cap','Prospects Women’s Performance Cap','Headwear','','[]','fulfill-engine','default',false,'shop-launch-0064','Target a quality adjustable performance cap with a fit suitable for women. Grey with maroon accent or navy. Embroidered existing P mark. Confirm exact style, fit and adjustable closure before artwork approval.'),
('launch-coach-cage-jacket','Prospects Coach Cage Jacket','Coaches','','[]','fulfill-engine','default',false,'shop-launch-0064','Target Nike cage jacket for the coaches collection; maroon and navy preferred. Existing P mark on left chest. Confirm available model, sleeve length, decoration and sample. EvoShield may be considered only with confirmed supply and direct fulfillment.')
on conflict(id) do nothing;
insert into shop_changes(product_id,actor,action,detail)
select id,'shop-launch-0064','prepare-launch-draft','{"source":"owner requested premium brand collection","verifiedSupplierProduct":false}'::jsonb
from shop_products where updated_by='shop-launch-0064';
