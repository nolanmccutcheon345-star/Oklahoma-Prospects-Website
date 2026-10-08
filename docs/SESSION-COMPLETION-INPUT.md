# Completion recap validation

The completion service validates and trims its booking ID and recap itself, retaining the existing five-to-5000-character requirement even when called outside the route wrapper. Invalid input is rejected before identity or ledger access. Real completion tests remain in the disposable ledger suite.
