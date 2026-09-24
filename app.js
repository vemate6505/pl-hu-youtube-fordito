(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) api.start(root, root.document, root.fetch.bind(root));
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const DEFAULT_VIDEO_ID = "RWKjvaV_rv4";
  const TRANSLATE_ENDPOINT = "https://api.mymemory.translated.net/get";
  function getVideoId(value) {
    const input = (value || "").trim();
    if (/^[\w-]{11}$/.test(input)) return input;
    try {
      const url = new URL(input);
      if (url.hostname === "youtu.be" || url.hostname.endsWith(".youtu.be")) return url.pathname.split("/").filter(Boolean)[0] || null;
      if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
      if (url.searchParams.get("v")) return url.searchParams.get("v");
      const parts = url.pathname.split("/").filter(Boolean);
      const marker = parts.findIndex(part => ["embed", "shorts", "live"].includes(part));
      return marker >= 0 && parts[marker + 1] ? parts[marker + 1] : null;
    } catch (_) { return null; }
  }
  const transcriptEndpoint = videoId => `https://youtube-transcript.ai/transcript/${encodeURIComponent(videoId)}.txt?lang=pl`;
  const timestampToSeconds = stamp => stamp.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);
  function parseTranscript(text) {
    const matches = [...text.matchAll(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s+(.+)$/gm)];
    return matches.map((match, index) => ({
      start: timestampToSeconds(match[1]),
      end: index + 1 < matches.length ? timestampToSeconds(matches[index + 1][1]) : timestampToSeconds(match[1]) + 12,
      pl: match[2].replace(/\[Muzyka\]/g, "[Zene]").replace(/\[Aplauz\]/g, "[Taps]").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
    }));
  }
  function splitText(text, limit = 430) {
    const words = text.split(/\s+/); const chunks = []; let current = "";
    for (const word of words) {
      if (current && `${current} ${word}`.length > limit) { chunks.push(current); current = word; }
      else current += `${current ? " " : ""}${word}`;
    }
    if (current) chunks.push(current);
    return chunks;
  }
  async function translateText(text, fetchFn) {
    const translated = [];
    for (const chunk of splitText(text)) {
      const url = `${TRANSLATE_ENDPOINT}?q=${encodeURIComponent(chunk)}&langpair=pl%7Chu`;
      const response = await fetchFn(url, { headers: { Accept: "application/json" } });
      const data = await response.json();
      if (!response.ok || data.responseStatus !== 200 || !data.responseData?.translatedText) throw new Error(data.responseDetails || `Fordítási HTTP ${response.status}`);
      translated.push(data.responseData.translatedText);
    }
    return translated.join(" ");
  }
  function start(win, document, fetchFn) {
    const byId = id => document.getElementById(id);
    let currentVideoId = DEFAULT_VIDEO_ID, player = null, subtitles = [], ticker = null;
    function createPlayer(videoId) {
      currentVideoId = videoId;
      if (player?.loadVideoById) { player.loadVideoById(videoId); return; }
      const build = () => { player = new win.YT.Player("player", { videoId, playerVars: { playsinline: 1, rel: 0, cc_load_policy: 0 }, events: { onReady: beginSync } }); };
      if (win.YT?.Player) build();
      else {
        win.onYouTubeIframeAPIReady = build;
        if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
          const script = document.createElement("script"); script.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(script);
        }
      }
    }
    function beginSync() {
      clearInterval(ticker);
      ticker = setInterval(() => {
        const now = player?.getCurrentTime?.() || 0;
        const line = subtitles.find(item => now >= item.start && now < item.end);
        byId("overlay").textContent = line?.hu || (subtitles.length ? "" : "A magyar felirat indításra vár.");
      }, 250);
    }
    async function buildHungarianSubtitles() {
      const id = getVideoId(byId("url").value) || currentVideoId;
      byId("status").className = "status note"; byId("status").textContent = "⏳ Lengyel felirat letöltése…"; byId("translate").disabled = true;
      try {
        const cached = win.localStorage?.getItem(`plhu-v06-${id}`);
        if (cached) subtitles = JSON.parse(cached);
        else {
          const response = await fetchFn(transcriptEndpoint(id), { headers: { Accept: "text/plain" } });
          const text = await response.text();
          if (!response.ok) throw new Error(`Transcript HTTP ${response.status}`);
          subtitles = parseTranscript(text);
          if (!subtitles.length) throw new Error("Nem található időzített lengyel felirat.");
          for (let i = 0; i < subtitles.length; i += 1) {
            byId("status").textContent = `⏳ Magyar fordítás: ${i + 1}/${subtitles.length}`;
            subtitles[i].hu = await translateText(subtitles[i].pl, fetchFn);
          }
          win.localStorage?.setItem(`plhu-v06-${id}`, JSON.stringify(subtitles));
        }
        byId("status").className = "status ok"; byId("status").textContent = `✓ Magyar felirat kész: ${subtitles.length} időzített blokk. Indítsd el a videót.`;
        byId("out").textContent = subtitles.map(s => `[${Math.floor(s.start / 60)}:${String(s.start % 60).padStart(2, "0")}] ${s.hu}`).join("\n\n"); beginSync();
      } catch (error) {
        byId("status").className = "status err"; byId("status").textContent = "✗ A magyar felirat elkészítése nem sikerült."; byId("out").textContent = String(error?.message || error);
      } finally { byId("translate").disabled = false; }
    }
    byId("load").onclick = () => {
      const id = getVideoId(byId("url").value);
      if (!id) { byId("status").className = "status err"; byId("status").textContent = "✗ Érvénytelen YouTube-hivatkozás."; return; }
      subtitles = []; byId("overlay").textContent = "A magyar felirat indításra vár."; createPlayer(id);
      byId("status").className = "status note"; byId("status").textContent = "Videó betöltve. Nyomd meg a magyar felirat gombot.";
    };
    byId("translate").onclick = buildHungarianSubtitles;
    createPlayer(DEFAULT_VIDEO_ID);
  }
  return { DEFAULT_VIDEO_ID, getVideoId, transcriptEndpoint, timestampToSeconds, parseTranscript, splitText, translateText, start };
});
