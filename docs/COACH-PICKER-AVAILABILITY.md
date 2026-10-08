# Coach picker availability — owner R4 follow-up

Public and authenticated checkout coach choices now require both an active admin service assignment and a usable recurring availability window. Coaches without a schedule, with only malformed/closed-hours windows, or with only another coach’s windows are omitted. Existing schedule identifiers and admin restrictions remain authoritative.

The picker checks whether at least one half-hour window fits the existing slot grid and facility hours during a representative week. That week is an internal recurring-schedule check, not an event or appointment. Exact selected-service duration, date, coach and resource conflicts remain validated by the existing slot and checkout handlers. This does not guarantee availability for every service or selected date.

Full roster/schedules remain server-side; only the existing public coach fields are returned. Parent-scoped desk data omits staff schedules, so it cannot be used to decide coach availability. No schema, schedule edits, payment provider operation or customer messages change.

Coach self-selected sport/service preferences, youth-only eligibility/pricing, remote fulfillment and hosted role-session/browser acceptance remain separate work. Admin-assigned service restrictions are preserved.
