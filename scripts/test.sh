#!/usr/bin/env bash
set -Eeuo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

node --check app.js
node --test test/*.test.js

grep -q '<script src="app.js"></script>' index.html
grep -q 'YouTube Fordító v0.6' index.html

if grep -RInE --include='*.js' --include='*.html' --include='*.json' \
  '(api[_-]?key|token|secret|password)[[:space:]]*[:=]' .; then
  echo "Lehetséges titkos adat került a forrásba." >&2
  exit 1
fi

echo "MORDO-PLHU ellenőrzések sikeresek."
