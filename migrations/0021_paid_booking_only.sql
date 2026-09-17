-- Opening checkout must not block a time. Existing paid bookings are unchanged.
update commerce_orders set status='expired',updated_at=now()
where status in ('pending','pending_fee','failed') and id in
  (select order_id from booking_records where status='held');
delete from booking_occupancy where booking_id in
  (select id from booking_records where status='held');
update booking_records set status='expired' where status='held';
