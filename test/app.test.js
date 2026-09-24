const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_VIDEO_ID, getVideoId, transcriptEndpoint } = require("../app.js");

test("recognizes supported YouTube URL formats", () => {
  const id = "RWKjvaV_rv4";
  assert.equal(getVideoId(id), id);
  assert.equal(getVideoId(`https://youtu.be/${id}`), id);
  assert.equal(getVideoId(`https://www.youtube.com/watch?v=${id}`), id);
  assert.equal(getVideoId(`https://www.youtube.com/embed/${id}`), id);
  assert.equal(getVideoId(`https://www.youtube.com/shorts/${id}`), id);
  assert.equal(getVideoId(`https://www.youtube.com/live/${id}`), id);
});

test("rejects invalid video references", () => {
  assert.equal(getVideoId(""), null);
  assert.equal(getVideoId("not a youtube link"), null);
  assert.equal(getVideoId("https://example.com/video"), null);
});

test("builds the Polish transcript endpoint", () => {
  assert.equal(
    transcriptEndpoint(DEFAULT_VIDEO_ID),
    "https://youtube-transcript.ai/transcript/RWKjvaV_rv4.txt?lang=pl"
  );
});
