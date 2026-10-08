# Public coach profile fields

Owner requirement W11: public coach names, bios and intentionally published optional information; no automatic exposure of account/contact details.

The existing publication workflow and profile editor remain in place. The public query now constructs a dedicated DTO containing only name, specialties, career/background, approach, athletes served, accomplishments and welcome text. Private or future JSON fields never reach the public response, even if stored alongside these fields. Invalid records are omitted individually; unpublished records stay private.

This does not create biographies, approve staff content or publish missing coach records. It preserves existing published content, and introduces no migration or payment change. Completing profiles for every coach and owner approval controls remain separate work.

Validation uses the real migrated database: an explicitly published synthetic profile containing extra email, phone, account ID and internal notes returns only public fields; draft/malformed profiles are excluded; withdrawing publication removes the record immediately. Typecheck, lint, build and built SSR checks accompany the change.
