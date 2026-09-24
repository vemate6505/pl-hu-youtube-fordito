#!/usr/bin/env bash
set -Eeuo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

version="${1:-}"
description="${2:-automatizált teszt és deploy}"
if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+([.][0-9]+)?$ ]]; then
  echo "Használat: ./scripts/release.sh v0.5 \"rövid leírás\"" >&2
  exit 2
fi
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "A kiadás csak a main ágról indítható." >&2
  exit 2
fi

trap 'echo "A kiadás leállt. Diagnosztika:" >&2; bash scripts/diagnose.sh >&2 || true' ERR
bash scripts/test.sh
git diff --check
git add index.html app.js test scripts .github README.md
git diff --cached --quiet && { echo "Nincs kiadható módosítás."; exit 0; }
git commit -m "$version - $description"
git push origin main
echo "Kiadás feltöltve. A GitHub Actions ellenőrzi, a GitHub Pages pedig automatikusan publikálja."
