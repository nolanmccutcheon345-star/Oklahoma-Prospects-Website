-- Generated from migrations/0065_shop_design_brief.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0065_shop_design_brief.sql') THEN
-- Correct only the untouched seeded brief; preserve any owner-edited product notes.
update shop_products set preparation_notes='Target Nike, Under Armour or adidas fleece. Navy and heather grey. PROSPECTS chest lettering based on the supplied mockup; prepare and approve production lettering artwork. Optional existing P sleeve mark only after confirming location cost. Verify actual colors, youth/adult sizing and printing compatibility.',revision=revision+1,updated_at=now()
where id='launch-dugout-hoodie' and updated_by='shop-launch-0064'
and preparation_notes='Target Nike, Under Armour or adidas fleece. Navy and heather grey. Existing PROSPECTS wordmark across chest; optional P sleeve mark only after confirming location cost. Verify actual colors, youth/adult sizing and printing compatibility.';

    INSERT INTO _migrations (name) VALUES ('0065_shop_design_brief.sql');
  END IF;
END
$netlify_apply$;
