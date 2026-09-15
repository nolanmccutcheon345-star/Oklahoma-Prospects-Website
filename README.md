# Oklahoma Prospects

The live club product for **[prospectsbaseball.club](https://prospectsbaseball.club)**.

Reserved indoor cages in Broken Arrow, Oklahoma. Baseball and softball. Est. 2008.

This repository **is** the website and the phone app — same product, one codebase. Families book, train, and visit here. Coaches and the office run the club from the same origin.

## What this replaced

The previous static HTML marketing site in this repository is gone. `prospectsbaseball.club` now serves this app.

## Stack

- TanStack Start (React 19) + Vite + Tailwind
- Netlify production host (`oklahoma-prospects` → `prospectsbaseball.club`)
- Postgres when `DATABASE_URL` is set; otherwise a local PGLite fallback

## Scripts

```bash
npm run dev        # local app
npm run build      # production build + migrations
npm run typecheck
```

## Domain

| Host | Role |
| --- | --- |
| [prospectsbaseball.club](https://prospectsbaseball.club) | this app |
| www.prospectsbaseball.club | 301 → apex |
| book.prospectsbaseball.club | 301 into this app |
| app.prospectsbaseball.club | 301 into this app |
