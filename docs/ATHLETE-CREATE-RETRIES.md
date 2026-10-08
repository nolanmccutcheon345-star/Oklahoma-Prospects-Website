# Athlete creation retries

A repeated request ID succeeds only when the saved athlete still matches the owner and submitted name, birth date, sport, throwing hand, and batting hand. Conflicting retries report an error instead of claiming a different athlete was saved. Validate the input at the service boundary as well as the API. Disposable database tests cover identical retries, conflicting fields, and malformed IDs. No hosted or provider acceptance claimed.
