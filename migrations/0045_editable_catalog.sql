-- Persist the formerly overlaid assessment amounts once. Future admin edits are authoritative.
update club_services set price=149 where (id='s1' and price=154) or (id='s9' and price=155);
insert into club_services(id,kind,name,price,active,sort_order)
values ('assessment-setup','fee','First-month assessment fee',50,true,500)
on conflict(id) do nothing;
-- Youth services begin at the current equivalent lesson's price and duration.
insert into club_services(id,kind,name,discipline,price,minutes,purpose,requires_assessment,active,sort_order)
select 'youth-'||lower(discipline),'lesson','Youth '||discipline||' · 11U & Under',discipline,price,minutes,
'For players age 11 and under. No new player assessment required.',false,true,sort_order+30
from club_services where id in ('s2','s7','s10','s12') on conflict(id) do nothing;
insert into service_resources(service_id,lane_ids)
select 'youth-'||lower(s.discipline),r.lane_ids from club_services s join service_resources r on r.service_id=s.id
where s.id in ('s2','s7','s10','s12') on conflict(service_id) do nothing;
insert into club_services(id,kind,name,price,minutes,purpose,active,sort_order) values('team-plan-one-60','team_plan','One cage · 60 min', 226,60,'Four visits per month. Contact Front Office to schedule and invoice.',true,600) on conflict(id) do nothing;
insert into club_services(id,kind,name,price,minutes,purpose,active,sort_order) values('team-plan-one-90','team_plan','One cage · 90 min', 340,90,'Four visits per month. Contact Front Office to schedule and invoice.',true,610) on conflict(id) do nothing;
insert into club_services(id,kind,name,price,minutes,purpose,active,sort_order) values('team-plan-one-120','team_plan','One cage · 120 min', 453,120,'Four visits per month. Contact Front Office to schedule and invoice.',true,620) on conflict(id) do nothing;
insert into club_services(id,kind,name,price,minutes,purpose,active,sort_order) values('team-plan-two-60','team_plan','Two cages · 60 min', 412,60,'Four visits per month. Contact Front Office to schedule and invoice.',true,630) on conflict(id) do nothing;
insert into club_services(id,kind,name,price,minutes,purpose,active,sort_order) values('team-plan-two-90','team_plan','Two cages · 90 min', 618,90,'Four visits per month. Contact Front Office to schedule and invoice.',true,640) on conflict(id) do nothing;
insert into club_services(id,kind,name,price,minutes,purpose,active,sort_order) values('team-plan-two-120','team_plan','Two cages · 120 min', 824,120,'Four visits per month. Contact Front Office to schedule and invoice.',true,650) on conflict(id) do nothing;
insert into club_services(id,kind,name,price,minutes,purpose,active,sort_order) values('team-plan-field-60','team_plan','Field / team area · 60 min', 298,60,'Four visits per month. Contact Front Office to schedule and invoice.',true,660) on conflict(id) do nothing;
insert into club_services(id,kind,name,price,minutes,purpose,active,sort_order) values('team-plan-field-90','team_plan','Field / team area · 90 min', 443,90,'Four visits per month. Contact Front Office to schedule and invoice.',true,670) on conflict(id) do nothing;
insert into club_services(id,kind,name,price,minutes,purpose,active,sort_order) values('team-plan-field-120','team_plan','Field / team area · 120 min', 566,120,'Four visits per month. Contact Front Office to schedule and invoice.',true,680) on conflict(id) do nothing;

-- Old lesson URL redirects through the authoritative monthly product.
update club_services set active=false where id='s6';

-- Preserve the already-published plan benefits while removing runtime overlays.
update club_services set remote=1 where id='m3' and remote=4;
update club_services set includes_json=(select coalesce(jsonb_agg(line),'[]'::jsonb)::text from jsonb_array_elements_text(includes_json::jsonb) line where line !~* 'quarterly.*(lab|assessment)') where id='m3';
update club_services set detail='Four 75-minute group sessions per billing month, 3–5 comparable pitchers. Enrollment opens with the group schedule.', includes_json='["Four 75-minute group sessions per billing month","Command competition and mound situations","Athlete profile","Session recaps"]'
where id='m4' and detail='One 75-minute group session weekly, 3–5 comparable pitchers.';
