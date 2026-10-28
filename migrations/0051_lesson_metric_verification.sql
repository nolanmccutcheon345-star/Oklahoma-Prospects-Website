ALTER TABLE recruiting_metrics ADD COLUMN source_booking_id text REFERENCES booking_records(id);
