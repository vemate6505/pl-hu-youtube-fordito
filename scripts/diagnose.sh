#!/usr/bin/env bash
set -Eeuo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

echo "Node: $(node --version 2>/dev/null || echo 'nem található')"
echo "Git: $(git --version)"
echo "Ág: $(git branch --show-current)"
echo "Commit: $(git rev-parse --short HEAD)"
echo "Módosított fájlok:"
git status --short
echo "Transcript végpont:"
curl --fail --silent --show-error --location --max-time 25 \
  --output /dev/null --write-out 'HTTP %{http_code}, %{size_download} bájt, %{time_total} s\n' \
  'https://youtube-transcript.ai/transcript/RWKjvaV_rv4.txt?lang=pl'
