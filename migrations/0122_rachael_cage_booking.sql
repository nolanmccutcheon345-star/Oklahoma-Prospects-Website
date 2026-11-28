-- Prepare only. Keep the item inactive until ownership verifies the coach,
-- compatible single lane, schedules and separate instructor payment copy.
insert into club_services (
  id, kind, name, discipline, price, minutes, purpose, requires_assessment, active, sort_order
) values (
  'rachael-cage-60', 'lesson', 'Book with Coach Rachael · Cage fee', 'Pitching', 35, 60,
  'Cage fee only. Pay Coach Rachael directly for instruction. No evaluation required.',
  false, false, 45
) on conflict (id) do nothing;
