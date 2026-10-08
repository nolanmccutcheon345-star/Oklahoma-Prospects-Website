# Assigned training log transaction

Completion writes now lock and validate the daily plan inside the same transaction as the training-log upsert. A simultaneous plan edit must wait for that row lock, preventing a drill removal between validation and save. Disposable-database tests cover removed-drill rejection, unchanged prior completion, and later valid writes. PGlite does not establish hosted PostgreSQL concurrency acceptance; no hosted mutations were performed.
