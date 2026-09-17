-- Generated from migrations/0021_paid_booking_only.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0021_paid_booking_only.sql') THEN
-- Opening checkout must not block a time. Existing paid bookings are unchanged.
update commerce_orders set status='expired',updated_at=now()
where status in ('pending','pending_fee','failed') and id in
  (select order_id from booking_records where status='held');
delete from booking_occupancy where booking_id in
  (select id from booking_records where status='held');
update booking_records set status='expired' where status='held';

    INSERT INTO _migrations (name) VALUES ('0021_paid_booking_only.sql');
  END IF;
END
$netlify_apply$;
