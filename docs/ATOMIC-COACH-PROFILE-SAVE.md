# Atomic coach profile saves

Coach profile publication and the working-file name/specialty update now share one database transaction. Previously, a working-file revision conflict could report failure after the published profile had already changed. A conflict now rolls back both writes; a successful save commits both. The existing optimistic revision and active-coach/input guards remain.

An actual saveCoach test against a migrated disposable database introduces a revision conflict after the profile write and proves rollback of profile/publication/name/specialties. The successful retry updates both records and increments the revision once. No schema change, payment or customer notice. Hosted role/browser acceptance remains separate.
