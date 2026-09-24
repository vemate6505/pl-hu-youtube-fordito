const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_VIDEO_ID, getVideoId, transcriptEndpoint, timestampToSeconds, collapseRepeats, parseTranscript, splitText, translateText, expandSubtitle } = require("../app.js");
test("recognizes YouTube URLs and rejects foreign hosts", () => {
  const id = DEFAULT_VIDEO_ID;
  for (const url of [id, `https://youtu.be/${id}`, `https://www.youtube.com/watch?v=${id}`, `https://www.youtube.com/embed/${id}`, `https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/live/${id}`]) assert.equal(getVideoId(url), id);
  assert.equal(getVideoId("https://example.com/watch?v=RWKjvaV_rv4"), null); assert.equal(getVideoId(""), null);
});
test("builds the Polish transcript endpoint", () => assert.equal(transcriptEndpoint(DEFAULT_VIDEO_ID), "https://youtube-transcript.ai/transcript/RWKjvaV_rv4.txt?lang=pl"));
test("parses timed transcript blocks", () => {
  const rows = parseTranscript("## Transcript\n[0:09] Dzień dobry\n\n[1:11] Do widzenia\n---");
  assert.deepEqual(rows, [{ start: 9, end: 71, pl: "Dzień dobry" }, { start: 71, end: 83, pl: "Do widzenia" }]); assert.equal(timestampToSeconds("1:02:03"), 3723);
});
test("splits text below the service limit", () => { const chunks = splitText("szkoła ".repeat(200).trim(), 100); assert.ok(chunks.length > 1); assert.ok(chunks.every(chunk => chunk.length <= 100)); });
test("translates Polish text", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => [[['Jó napot', 'Dzień dobry']]] });
  assert.equal(await translateText("Dzień dobry", fakeFetch), "Jó napot");
});
test("removes repeated phrases and creates short timed captions", () => {
  assert.equal(collapseRepeats("ala ma kota ala ma kota koniec"), "ala ma kota koniec");
  const rows = expandSubtitle({ start: 0, end: 20, hu: "egy kettő három négy öt hat hét nyolc kilenc" }, 7);
  assert.equal(rows.length, 3); assert.equal(rows.at(-1).end, 20); assert.ok(rows.every(row => row.hu));
});
