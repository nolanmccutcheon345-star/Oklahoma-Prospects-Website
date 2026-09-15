# Oklahoma Prospects

The live club product for **[prospectsbaseball.club](https://prospectsbaseball.club)**.

Reserved indoor cages in Broken Arrow, Oklahoma. Baseball and softball. Est. 2008.

This repository **is** the website and the phone app — same product, one codebase. Families book, train, and visit here. Coaches and the office run the club from the same origin.

## What this replaced

The previous static HTML marketing site in this repository is gone. `prospectsbaseball.club` now serves this app.

## Stack

- TanStack Start (React 19) + Vite + Tailwind
- Netlify production host (`oklahoma-prospects` → `prospectsbaseball.club`)
- Persistent Postgres in hosted environments; in-memory PGlite is for local development only

## Scripts

```bash
npm run dev        # local app
npm run build      # build only; does not modify the database
npm run db:migrate # explicit schema migration, with the target database configured
npm run typecheck
npm test
npm run lint
NETLIFY=true CONTEXT=deploy-preview npm run build
npm run verify:build
```

## Domain

| Host | Role |
| --- | --- |
| [prospectsbaseball.club](https://prospectsbaseball.club) | this app |
| www.prospectsbaseball.club | 301 → apex |
| book.prospectsbaseball.club | 301 into this app |
| app.prospectsbaseball.club | 301 into this app |

## Audit implementation

See [the release and Grok handoff](docs/AUDIT-HANDOFF.md) for deployment contexts,
migration order, validation evidence and remaining release gates. The audit branch
is a review candidate; it does not certify that the live site runs these changes.
