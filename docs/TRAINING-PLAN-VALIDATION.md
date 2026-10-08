# Training plan validation

Plans now require unique drill IDs so completion tracking identifies one assigned drill. The underlying setTrainingDay and setTrack services validate their existing schemas before role checks/writes, including OP levels, evidence, bounded drill content and HTTPS video links. Empty plans remain valid for clearing assignments. Real-date and assigned-coach checks remain.

Migrated disposable database tests cover duplicates, malformed drills/date/level, parent denial and valid coach saves. No migration, payment or customer notification. Hosted role/browser acceptance remains separate.
