#!/bin/sh
set -eu
cd /workspace
# :8081 is QA-only — a revive must never inherit a stale built-output preview.
node scripts/preview.mjs stop || true

seed_owners() {
  origin=http://127.0.0.1:8080
  i=0
  while [ "$i" -lt 20 ]; do
    if curl -sf -o /dev/null --max-time 2 "$origin/"; then
      curl -sS -o /dev/null -X POST "$origin/api/auth/sign-up/email" \
        -H "content-type: application/json" \
        -H "origin: $origin" \
        --data '{"email":"nolanmccutcheon@icloud.com","password":"Baseball345!","name":"Nolan McCutcheon"}' || true
      curl -sS -o /dev/null -X POST "$origin/api/auth/sign-up/email" \
        -H "content-type: application/json" \
        -H "origin: $origin" \
        --data '{"email":"stevemccutcheon89@gmail.com","password":"Nolanandsteve123!","name":"Steve McCutcheon"}' || true
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
}

if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  seed_owners
  exit 0
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
seed_owners &
