const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_VIDEO_ID, getVideoId, transcriptEndpoint, timestampToSeconds, collapseRepeats, parseTranscript, splitText, translateText, translateRowsWithContext, stripNonSpeechMarkers, normalizeHungarian, splitCaptionText, findSubtitleAt, expandSubtitle } = require("../app.js");
test("recognizes YouTube URLs and rejects foreign hosts", () => {
  const id = DEFAULT_VIDEO_ID;
  for (const url of [id, `https://youtu.be/${id}`, `https://www.youtube.com/watch?v=${id}`, `https://www.youtube.com/embed/${id}`, `https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/live/${id}`]) assert.equal(getVideoId(url), id);
  assert.equal(getVideoId("https://example.com/watch?v=787TQgRSxq8"), null); assert.equal(getVideoId(""), null);
});
test("builds the Polish transcript endpoint", () => assert.equal(transcriptEndpoint(DEFAULT_VIDEO_ID), "https://youtube-transcript.ai/transcript/787TQgRSxq8.txt?lang=pl"));
test("parses timed transcript blocks", () => {
  const input = ["## Transcript", "[0:09] Dzień dobry", "", "[1:11] Do widzenia", "---"].join(String.fromCharCode(10));
  const rows = parseTranscript(input);
  assert.deepEqual(rows, [{ start: 9, end: 71, pl: "Dzień dobry" }, { start: 71, end: 83, pl: "Do widzenia" }]); assert.equal(timestampToSeconds("1:02:03"), 3723);
});
test("splits text below the service limit", () => { const chunks = splitText("szkoła ".repeat(200).trim(), 100); assert.ok(chunks.length > 1); assert.ok(chunks.every(chunk => chunk.length <= 100)); });
test("translates Polish text", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => [[['Jó napot', 'Dzień dobry']]] });
  assert.equal(await translateText("Dzień dobry", fakeFetch), "Jó napot.");
});
test("removes repeated phrases and creates sentence-aware timed captions", () => {
  assert.equal(collapseRepeats("ala ma kota ala ma kota koniec"), "ala ma kota koniec");
  const rows = expandSubtitle({ start: 0, end: 20, hu: "Ez az első rövid mondat. Ez pedig a második rövid mondat." });
  assert.equal(rows.length, 2);
  assert.equal(rows.at(-1).end, 20);
  assert.ok(rows.every(row => row.hu && row.end > row.start));
});

test("finds the active subtitle efficiently", () => {
  const rows = [{ start: 1, end: 3, hu: "a" }, { start: 3, end: 6, hu: "b" }];
  assert.equal(findSubtitleAt(rows, 4).hu, "b");
  assert.equal(findSubtitleAt(rows, 0.5), null);
  assert.equal(findSubtitleAt(rows, 6), null);
});

test("normalizes Hungarian punctuation and capitalization", () => {
  assert.equal(normalizeHungarian("  jó napot , hogy van  "), "Jó napot, hogy van.");
  assert.equal(normalizeHungarian("i"), "I");
});
test("splits Hungarian captions without cutting words", () => {
  const parts = splitCaptionText("Ez az első mondat. Ez a második mondat, amely valamivel hosszabb.", 30);
  assert.ok(parts.length >= 2);
  assert.ok(parts.every(part => part.length <= 30 || !part.includes(" ")));
});


test("translates adjacent Polish rows with shared context and keeps timing", async () => {
  const rows = [{ start: 1, end: 3, pl: "Pierwsze zdanie" }, { start: 3, end: 5, pl: "Drugie zdanie" }];
  const fakeFetch = async url => {
    const q = new URL(url).searchParams.get("q");
    return { ok: true, json: async () => [[[q.includes("[[PLHU_1]]") ? "[[PLHU_1]] Első mondat [[PLHU_2]] Második mondat" : "Tartalék fordítás", q]]] };
  };
  const out = await translateRowsWithContext(rows, fakeFetch, 3);
  assert.equal(out.length, 2);
  assert.equal(out[0].start, 1);
  assert.equal(out[1].end, 5);
  assert.equal(out[0].hu, "Első mondat.");
  assert.equal(out[1].hu, "Második mondat.");
});


test("keeps short translated rows intact to avoid over-fragmentation", () => {
  const rows = expandSubtitle({ start: 10, end: 16, hu: "Ez egy rövid, természetes magyar felirat, amelynek egyben kell maradnia." });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].start, 10);
  assert.equal(rows[0].end, 16);
});


test("removes non-speech music laughter and applause markers", () => {
  const input = ["[0:01] (Muzyka) [Muzyka] Cześć (śmiech) [Aplauz]", "[0:05] (zene) (nevetés) Dzień dobry"].join("\n");
  const rows = parseTranscript(input);
  assert.equal(rows[0].pl, "Cześć");
  assert.equal(rows[1].pl, "Dzień dobry");
});


test("removes translated non-speech markers after translation", () => {
  assert.equal(stripNonSpeechMarkers("(Zene) Helló. (Nevetés) [Taps]"), "Helló.");
  assert.equal(normalizeHungarian("(zene) (zene) Jó reggelt (nevetés)"), "Jó reggelt.");
});
