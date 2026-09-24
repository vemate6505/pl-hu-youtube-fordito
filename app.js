(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) api.start(root, root.document, root.fetch.bind(root));
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const DEFAULT_VIDEO_ID = "RWKjvaV_rv4";
  const TRANSLATE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
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
  function collapseRepeats(text) {
    const words = text.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i += 1) {
      for (let size = Math.min(45, Math.floor((words.length - i) / 2)); size >= 3; size -= 1) {
        const a = words.slice(i, i + size).join(" "), b = words.slice(i + size, i + size * 2).join(" ");
        if (a === b) { words.splice(i + size, size); i = Math.max(-1, i - 1); break; }
      }
    }
    return words.join(" ");
  }
  function parseTranscript(text) {
    const matches = [...text.matchAll(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s+(.+)$/gm)];
    return matches.map((match, index) => ({
      start: timestampToSeconds(match[1]),
      end: index + 1 < matches.length ? timestampToSeconds(matches[index + 1][1]) : timestampToSeconds(match[1]) + 12,
      pl: collapseRepeats(match[2].replace(/\[Muzyka\]/g, "[Zene]").replace(/\[Aplauz\]/g, "[Taps]").replace(/\[[^\]]*__[^\]]*\]/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim())
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
      let value = "";
      try {
        const url = `${TRANSLATE_ENDPOINT}?client=gtx&sl=pl&tl=hu&dt=t&q=${encodeURIComponent(chunk)}`;
        const response = await fetchFn(url, { headers: { Accept: "application/json" } });
        const data = await response.json();
        value = Array.isArray(data?.[0]) ? data[0].map(part => part?.[0] || "").join("") : "";
      } catch (_) {}
      if (!value) {
        const fallback = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=pl%7Chu`;
        const response = await fetchFn(fallback, { headers: { Accept: "application/json" } });
        const data = await response.json(); value = data.responseData?.translatedText || "";
      }
      if (!value) throw new Error("A fordítószolgáltatás nem adott választ.");
      translated.push(value);
    }
    return translated.join(" ");
  }
  function expandSubtitle(row, seconds = 4) {
    const count = Math.max(1, Math.ceil((row.end - row.start) / seconds));
    const words = row.hu.split(/\s+/); const per = Math.ceil(words.length / count); const result = [];
    for (let i = 0; i < count; i += 1) {
      const hu = words.slice(i * per, (i + 1) * per).join(" ").trim();
      if (hu) result.push({ start: row.start + i * (row.end - row.start) / count, end: row.start + (i + 1) * (row.end - row.start) / count, hu });
    }
    return result;
  }
  function start(win, document, fetchFn) {
    const byId = id => document.getElementById(id);
    let currentVideoId = DEFAULT_VIDEO_ID, player = null, subtitles = [], ticker = null;
    function createPlayer(videoId) {
      currentVideoId = videoId;
      if (player?.loadVideoById) { player.loadVideoById(videoId); return; }
      const build = () => { player = new win.YT.Player("player", { videoId, playerVars: { playsinline: 1, rel: 0, fs: 0, cc_load_policy: 0 }, events: { onReady: beginSync, onStateChange: beginSync } }); };
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
        const waiting = subtitles.length && now < subtitles[0].start ? `A magyar felirat ${Math.floor(subtitles[0].start / 60)}:${String(Math.floor(subtitles[0].start % 60)).padStart(2, "0")}-nél indul.` : "";
        const caption = line?.hu || waiting || (subtitles.length ? "" : "A magyar felirat indításra vár.");
        byId("overlay").textContent = caption;
        byId("liveCaption").textContent = caption;
      }, 250);
    }
    async function buildHungarianSubtitles() {
      const id = getVideoId(byId("url").value) || currentVideoId;
      byId("status").className = "status note"; byId("status").textContent = "⏳ Lengyel felirat letöltése…"; byId("translate").disabled = true;
      try {
        const cached = win.localStorage?.getItem(`plhu-v07-${id}`);
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
          subtitles = subtitles.flatMap(row => expandSubtitle(row));
          win.localStorage?.setItem(`plhu-v07-${id}`, JSON.stringify(subtitles));
        }
        byId("status").className = "status ok"; byId("status").textContent = `✓ Magyar felirat kész: ${subtitles.length} időzített blokk. Indítsd el a videót; az első szöveg 0:09-nél jelenik meg.`;
        byId("out").textContent = subtitles.map(s => `[${Math.floor(s.start / 60)}:${String(s.start % 60).padStart(2, "0")}] ${s.hu}`).join("\n\n"); beginSync();
      } catch (error) {
        byId("status").className = "status err"; byId("status").textContent = "✗ A magyar felirat elkészítése nem sikerült."; byId("out").textContent = String(error?.message || error);
      } finally { byId("translate").disabled = false; }
    }
    byId("load").onclick = () => {
      const id = getVideoId(byId("url").value);
      if (!id) { byId("status").className = "status err"; byId("status").textContent = "✗ Érvénytelen YouTube-hivatkozás."; return; }
      subtitles = []; byId("overlay").textContent = "A magyar felirat indításra vár."; byId("liveCaption").textContent = "A magyar felirat indításra vár."; createPlayer(id);
      byId("status").className = "status note"; byId("status").textContent = "Videó betöltve. Nyomd meg a magyar felirat gombot.";
    };
    byId("translate").onclick = buildHungarianSubtitles;
    byId("fullscreen").onclick = async () => {
      const shell = byId("playerShell");
      try {
        if (!document.fullscreenElement) {
          await shell.requestFullscreen();
          await win.screen?.orientation?.lock?.("landscape");
        } else await document.exitFullscreen();
      } catch (_) { byId("status").textContent = "A telefon nem engedte az automatikus elfordítást; fordítsd el kézzel."; }
    };
    createPlayer(DEFAULT_VIDEO_ID);
  }
  return { DEFAULT_VIDEO_ID, getVideoId, transcriptEndpoint, timestampToSeconds, collapseRepeats, parseTranscript, splitText, translateText, expandSubtitle, start };
});
