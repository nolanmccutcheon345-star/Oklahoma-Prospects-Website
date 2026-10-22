-- Add editable retail navigation and a display-only coming-soon state.
-- Existing products, prices, approvals, orders and publication remain intact.
alter table shop_products add column coming_soon boolean not null default false;
alter table shop_products add column collection_ids jsonb not null default '[]' check(jsonb_typeof(collection_ids)='array');
alter table shop_settings add column navigation jsonb not null default '[
 {"id":"collections","label":"Collections","options":[{"id":"hats","label":"Hats"},{"id":"t-shirts","label":"T-shirts"},{"id":"long-sleeve","label":"Long sleeve"},{"id":"hoodies","label":"Hoodies"},{"id":"pants","label":"Pants"},{"id":"accessories","label":"Accessories"}]},
 {"id":"sport","label":"Sport","options":[{"id":"baseball","label":"Baseball"},{"id":"softball","label":"Softball"}]},
 {"id":"fit","label":"Fit","options":[{"id":"mens","label":"Men’s"},{"id":"womens","label":"Women’s"},{"id":"unisex","label":"Unisex"}]},
 {"id":"age","label":"Age group","options":[{"id":"youth","label":"Youth"},{"id":"adult","label":"Adult"}]}
]' check(jsonb_typeof(navigation)='array');

-- Carry existing explicit categories into matching retail collections once.
-- Preserve the category itself and leave ambiguous categories unassigned.
update shop_products set collection_ids = to_jsonb(array[case
 when lower(trim(category)) in ('hats','caps','hat','cap') then 'hats'
 when lower(trim(category)) in ('t-shirts','t-shirt','tees','shirts') then 't-shirts'
 when lower(trim(category)) in ('long sleeve','long sleeves') then 'long-sleeve'
 when lower(trim(category)) in ('hoodies','hoodie') then 'hoodies'
 when lower(trim(category)) in ('pants','pant') then 'pants'
 when lower(trim(category)) in ('accessories','accessory') then 'accessories'
 end]::text[]) where lower(trim(category)) in ('hats','caps','hat','cap','t-shirts','t-shirt','tees','shirts','long sleeve','long sleeves','hoodies','hoodie','pants','pant','accessories','accessory');
