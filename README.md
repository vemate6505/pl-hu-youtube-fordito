# MORDO-PLHU

Lengyel YouTube-felirat automatikus magyar fordításának és időzített videós megjelenítésének böngészős prototípusa (v0.6).

## Automatizált folyamat

1. A módosítás elkészül a helyi Git-repóban.
2. `bash scripts/test.sh` ellenőrzi a JavaScriptet, a videólink-feldolgozást, a transcript-végpontot és az érzékeny adatok véletlen bekerülését.
3. Hibánál a folyamat leáll; `bash scripts/diagnose.sh` kiírja a szükséges diagnosztikát.
4. `bash scripts/release.sh v0.5 "automatizált teszt és deploy"` sikeres teszt után commitol és pushol.
5. A GitHub Actions újra lefuttatja a tesztet. A `main` ág frissítése után a meglévő GitHub Pages-beállítás publikálja az oldalt.

Tesztoldal: <https://vemate6505.github.io/pl-hu-youtube-fordito/>
