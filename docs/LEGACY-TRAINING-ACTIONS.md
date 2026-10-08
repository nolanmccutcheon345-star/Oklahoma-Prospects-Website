# Legacy training actions

Legacy drill completion validates a positive ID and boolean, checks account ownership in the update, and returns an error for missing or unowned records. Training logs use bounded trimmed fields and the verified account identity, rather than caller-supplied ownership. Players may still log training and complete their own assigned legacy drills.

Disposable SQL regressions cover cross-account/missing drill rejection, valid completion, trimmed player logs and malformed requests without extra saved records. These tests do not establish hosted role or browser acceptance.
