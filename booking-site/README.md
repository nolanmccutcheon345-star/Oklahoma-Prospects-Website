# Oklahoma Prospects — booking host (redirect only)

This folder is no longer the live booking engine.
`book.prospectsbaseball.club` 301s every path to
https://prospectsbaseball.club/book so families stay on one club site.

`development/_redirects` does the same for `app.prospectsbaseball.club`
→ https://prospectsbaseball.club/training.

Do not redeploy the old scheduler without those 301s — that would split
the brand again. When the phone app is published, change the destination
to that public URL (keep the force 301).
