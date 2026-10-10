# Camps and clinics

Train → Camps lists published camps/clinics and a month calendar. Front Office → Camps & Clinics creates and edits name, sport, description, complete per-player price, location, one or more session dates/times (Central Time), coaches, capacity, publication status, and written registration/cancellation policy.

One checkout registers one household-linked player for every listed session. There is no private-lesson assessment requirement. All event prices are read from admin records and validated again before Square payment. Event edits invalidate stale unpaid checkouts. Completed purchases retain their price and policy snapshot.

Pending checkout capacity lasts ten minutes. Registration is granted only through verified Square completion, once per event/player. Payment amount, customer, environment, currency and location use the existing Square checks. Unavailable, expired or conflicting completions enter payment review and the existing compensating-refund queue; duplicate webhooks do not duplicate registrations. Full verified refunds cancel registrations and release player availability. Partial refunds retain the registration.

Published/closed events block assigned coaches’ lesson time. Registered players' sessions block their other bookings. No facility lanes are automatically allocated: admins must arrange sufficient event space. Once registered players exist, session dates, location and policy are locked; use Front Office payment review and replacement events for changes. Ordinary lesson rescheduling/cancellation cannot alter camp registrations. Close registration to stop new bookings; cancel only after active registrations have been resolved. No notification to families is sent just by editing an event; coordinate changes directly. Payment confirmations use the existing receipt queue.

Migration 0047 creates event and registration records. Public endpoints omit participants and private coach data. Admin editing requires verified owner grants; registration requires guardian household billing access. Production verification does not submit real charges or publish invented events.
