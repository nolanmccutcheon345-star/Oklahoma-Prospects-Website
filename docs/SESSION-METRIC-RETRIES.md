# Session metric retries

Previously, reusing a session log ID silently succeeded even when the submitted values differed. The saved row stayed unchanged, leaving the athlete believing a changed result had been recorded.

Identical retries from the same account for the same athlete succeed without adding another row. A reused ID with different session values, another athlete or another account now receives a generic conflict. Original coach-verification status is preserved on replay; a retry does not certify or overwrite old results. Server-side schema, athlete access, real-date and future-date checks precede writes.

Validation: migrated disposable database tests exercise unchanged, concurrent, changed, cross-account and cross-athlete retries; the real saveMetric service retains access/date/schema checks. No production migration or hosted role-session testing.
