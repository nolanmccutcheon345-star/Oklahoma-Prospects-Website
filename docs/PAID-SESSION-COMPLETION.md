# Paid session completion evidence

Completing a session locks and checks its order is paid before recording assessment completion or earnings. Pending, review, cancelled and refunded orders fail atomically; a failed attempt leaves the booking confirmed and creates no assessment. Paid completion retries retain one completion record. Tests use a disposable ledger with no Square call.
