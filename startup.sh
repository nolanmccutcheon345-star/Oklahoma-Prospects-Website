#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# Startup only serves the app. Account provisioning must never run on restart.
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
mkdir -p .grok
nohup npm run dev >>.grok/preview.log 2>&1 </dev/null &
