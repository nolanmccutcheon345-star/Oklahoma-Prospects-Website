# Coach service window duration

The coach picker now requires a recurring slot long enough for at least one assigned approved service, and lists only services whose duration fits. A coach assigned only a 75-minute assessment is omitted if their schedule offers only 30 minutes. Shorter services remain selectable. Selected-date conflicts are still checked by the booking flow.

No schema, availability edits, payment transactions or pricing changes. Runtime database tests cover assignment restrictions; duration tests include malformed values. Hosted role/browser and Square acceptance remain separate.
