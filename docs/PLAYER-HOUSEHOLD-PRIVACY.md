# Player household privacy

Owner requirement W9 limits player accounts to their own training/player information. The household-access endpoint previously returned guardian emails, names, primary household emails and account/membership identifiers to linked players. It now returns no household-access rows for players and keeps invitation controls disabled. Parent/coach/owner responses retain their existing household scope.

Migrated database tests prove a player response contains no guardian contacts, parents retain their linked household, unrelated households stay isolated, player invitations are rejected and authorized parent invitations still save. No invitation is delivered, role changed or migration performed. Hosted role/browser acceptance remains separate.
