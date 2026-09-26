#!/usr/bin/env bash
set -Eeuo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

node --check app.js
node --test test/*.test.js

grep -q '<script src="app.js?v=0.12.1"></script>' index.html
grep -q 'YouTube Fordító v0.16' index.html
grep -q 'id="liveCaption"' index.html
grep -q 'id="fullscreen"' index.html
grep -q 'id="playerShell" class="player"' index.html
grep -q 'id="overlay" class="overlay"' index.html
grep -q 'requestFullscreen' app.js

if grep -RInE --include='*.js' --include='*.html' --include='*.json' \
  '(api[_-]?key|token|secret|password)[[:space:]]*[:=]' .; then
  echo "Lehetséges titkos adat került a forrásba." >&2
  exit 1
fi

echo "MORDO-PLHU ellenőrzések sikeresek."

! grep -q 'orientation.*lock' app.js

grep -q 'app.js?v=0.12.1' index.html
grep -q '787TQgRSxq8' index.html
grep -q 'DEFAULT_VIDEO_ID = "787TQgRSxq8"' app.js

grep -q 'buildHungarianSubtitles();' app.js
grep -q 'stripNonSpeechMarkers' app.js

grep -q 'buildHungarianSubtitles(DEFAULT_VIDEO_ID)' app.js
grep -q 'buildHungarianSubtitles(id)' app.js

grep -q 'mergeTranscriptRows(parseTranscript(text))' app.js
