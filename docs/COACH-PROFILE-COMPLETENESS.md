# Coach profile publication completeness

Owner W11 requires a public name and short bio for each coach. Existing Career & background text serves as the bio; this change does not fabricate staff content or add a second bio field.

Unpublished profiles may keep that field empty while being drafted. Publishing requires a nonblank name and Career & background bio. The request validator and underlying server save enforce the same rule, including direct internal calls. The public allowlist additionally omits legacy malformed/blank-bio published records until a real bio is supplied. Their stored data is not deleted or overwritten.

Optional approach, ages, accomplishments, welcome and specialties remain optional. No migration, payment behavior, messages or automatic publication is introduced. Staff still need to supply genuine content through the existing editor; owner approval workflow and complete hosted coach-session testing remain separate work.

Validation covers draft saves, whitespace/newline-only publication rejection, valid trimmed bios, blank names, direct-server early rejection, and the real migrated public query excluding incomplete profiles while preserving complete profiles and private-field minimization.
