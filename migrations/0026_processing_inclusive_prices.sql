-- Owner authorized processing-inclusive prices for NEW purchases, September 21, 2026.
-- No paid orders, existing subscriptions, balances, credits or signed agreements are changed.
alter table club_services alter column price type numeric(12,2) using price::numeric(12,2);
update club_services set price=52.5 where id='individual';
update club_services set price=62.5 where id='team';
update club_services set price=78 where id='field';
update club_services set price=82 where id='prospect';
update club_services set price=144 where id='all-star';
update club_services set price=206 where id='elite-family';
update club_services set price=247 where id='m1';
update club_services set price=401 where id='m2';
update club_services set price=463 where id='m3';
update club_services set price=165 where id='m4';
update club_services set price=185 where id='m5';
update club_services set price=227 where id='p1';
update club_services set price=397 where id='p2';
update club_services set price=763 where id='p3';
update club_services set price=154 where id='s1';
update club_services set price=63 where id='s2';
update club_services set price=104 where id='s3';
update club_services set price=134 where id='s4';
update club_services set price=47 where id='s5';
update club_services set price=165 where id='s6';
update club_services set price=63 where id='s7';
update club_services set price=104 where id='s8';
update club_services set price=155 where id='s9';
update club_services set price=63 where id='s10';
update club_services set price=104 where id='s11';
update club_services set price=104 where id='s12';
