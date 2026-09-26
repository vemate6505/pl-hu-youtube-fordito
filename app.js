(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) api.start(root, root.document, root.fetch.bind(root));
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const DEFAULT_VIDEO_ID = "787TQgRSxq8";
  const TRANSLATE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
  const VIDEO_SYNC_DEFAULTS = { "787TQgRSxq8": -0.5 };
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
      pl: collapseRepeats(match[2].replace(/[[(](?:muzyka|aplauz|śmiech|smiech|zene|taps|nevetés|nevets|laughter|music)[\])]/gi, "").replace(/\[[^\]]*__[^\]]*\]/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim())
    }));
  }
  function mergeTranscriptRows(rows, maxGap = 0.35, maxDuration = 12, maxChars = 300) {
    const merged = [];
    for (const row of rows.filter(row => row.pl && row.pl.trim())) {
      const prev = merged[merged.length - 1];
      const gap = prev ? row.start - prev.end : Infinity;
      const combined = prev ? `${prev.pl} ${row.pl}`.trim() : row.pl;
      if (prev && gap <= maxGap && row.end - prev.start <= maxDuration && combined.length <= maxChars) {
        prev.end = row.end;
        prev.pl = combined;
      } else merged.push({ ...row });
    }
    return merged;
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
  async function translateViaGoogle(text, sourceLang, targetLang, fetchFn) {
    const translated = [];
    for (const chunk of splitText(text)) {
      const url = `${TRANSLATE_ENDPOINT}?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(chunk)}`;
      const response = await fetchFn(url, { headers: { Accept: "application/json" } });
      const data = await response.json();
      const value = Array.isArray(data?.[0]) ? data[0].map(part => part?.[0] || "").join("") : "";
      if (!value) throw new Error("A fordítószolgáltatás nem adott választ.");
      translated.push(value.trim());
    }
    return translated.join(" ");
  }
  async function translateText(text, fetchFn) {
    try {
      const english = await translateViaGoogle(text, "pl", "en", fetchFn);
      const hungarian = await translateViaGoogle(english, "en", "hu", fetchFn);
      return normalizeHungarian(hungarian);
    } catch (_) {
      try {
        const direct = await translateViaGoogle(text, "pl", "hu", fetchFn);
        return normalizeHungarian(direct);
      } catch (_) {
        const fallback = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=pl%7Chu`;
        const response = await fetchFn(fallback, { headers: { Accept: "application/json" } });
        const data = await response.json();
        const value = data.responseData?.translatedText || "";
        if (!value) throw new Error("A fordítószolgáltatás nem adott választ.");
        return normalizeHungarian(value);
      }
    }
  }
  async function translateRowsWithContext(rows, fetchFn, groupSize = 3) {
    const output = rows.map(row => ({ ...row }));
    for (let i = 0; i < output.length; i += groupSize) {
      const group = output.slice(i, i + groupSize);
      const source = group.map((row, offset) => `[[PLHU_${offset + 1}]] ${row.pl}`).join(" ");
      const translated = await translateText(source, fetchFn);
      const parts = [];
      for (let offset = 0; offset < group.length; offset += 1) {
        const tag = `[[PLHU_${offset + 1}]]`;
        const nextTag = offset + 1 < group.length ? `[[PLHU_${offset + 2}]]` : null;
        const start = translated.indexOf(tag);
        const end = nextTag ? translated.indexOf(nextTag) : translated.length;
        parts.push(start >= 0 && end > start ? normalizeHungarian(translated.slice(start + tag.length, end)) : "");
      }
      if (parts.length === group.length && parts.every(Boolean)) {
        parts.forEach((hu, offset) => { output[i + offset].hu = hu; });
      } else {
        for (let offset = 0; offset < group.length; offset += 1) {
          output[i + offset].hu = await translateText(group[offset].pl, fetchFn);
        }
      }
    }
    return output;
  }
  function stripNonSpeechMarkers(text) {
    return String(text || "")
      .replace(/[[(][^\])]*(?:zene|music|muzyka|nevet(?:és|es)|nevets|laughter|laugh|śmiech|smiech|taps|applause|aplauz)[^\])]*[\])]/gi, " ")
      .replace(/\s+/g, " ").trim();
  }
  function normalizeHungarian(text) {
    let value = stripNonSpeechMarkers(text).replace(/\s+/g, " ").trim();
    if (!value) return "";
    value = value.replace(/\s+([,.!?;:])/g, "$1").replace(/([,.!?;:])(?=[^\s"')\]])/g, "$1 ");
    value = value.charAt(0).toLocaleUpperCase("hu-HU") + value.slice(1);
    if (!/[.!?…]$/.test(value) && value.length > 3) value += ".";
    return value;
  }
  function splitCaptionText(text, maxChars = 120) {
    const clean = normalizeHungarian(text);
    if (!clean) return [];
    const sentences = clean.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [clean];
    const chunks = [];
    for (const sentence of sentences) {
      const words = sentence.trim().split(/\s+/); let current = "";
      for (const word of words) {
        if (current && (current + " " + word).length > maxChars) {
          chunks.push(current.trim()); current = word;
        } else current += (current ? " " : "") + word;
      }
      if (current.trim()) chunks.push(current.trim());
    }
    return chunks;
  }
  function findSubtitleAt(subtitles, time) {
    let lo = 0, hi = subtitles.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, item = subtitles[mid];
      if (time < item.start) hi = mid - 1;
      else if (time >= item.end) lo = mid + 1;
      else return item;
    }
    return null;
  }
  function expandSubtitle(row, seconds = 4.2) {
    if (row.end - row.start <= 8 && row.hu.length <= 140) return [{ start: row.start, end: row.end, hu: normalizeHungarian(row.hu) }];
    const parts = splitCaptionText(row.hu);
    if (!parts.length) return [];
    const duration = Math.max(0.8, row.end - row.start);
    const slot = duration / parts.length;
    let cursor = row.start;
    return parts.map((hu, index) => {
      const end = index === parts.length - 1 ? row.end : Math.min(row.end, cursor + slot);
      const item = { start: cursor, end, hu }; cursor = end; return item;
    });
  }
  function start(win, document, fetchFn) {
    const byId = id => document.getElementById(id);
    let currentVideoId = DEFAULT_VIDEO_ID, player = null, subtitles = [], ticker = null, syncOffset = 0;
    const syncKey = id => `plhu-sync-v08-${id}`;
    function setSyncOffset(value) {
      syncOffset = Math.max(-10, Math.min(10, Math.round(value * 2) / 2));
      try { win.localStorage?.setItem(syncKey(currentVideoId), String(syncOffset)); } catch (_) {}
      const el = byId("syncValue"); if (el) el.textContent = `${syncOffset >= 0 ? "+" : ""}${syncOffset.toFixed(1)} s`;
    }
    function createPlayer(videoId) {
      currentVideoId = videoId;
      try {
        const saved = win.localStorage?.getItem(syncKey(videoId));
        setSyncOffset(saved !== null && saved !== undefined ? Number(saved) || 0 : (VIDEO_SYNC_DEFAULTS[videoId] || 0));
      } catch (_) { setSyncOffset(VIDEO_SYNC_DEFAULTS[videoId] || 0); }
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
        const subtitleTime = now + syncOffset;
        const line = findSubtitleAt(subtitles, subtitleTime);
        const waiting = subtitles.length && subtitleTime < subtitles[0].start ? `A magyar felirat ${Math.floor(subtitles[0].start / 60)}:${String(Math.floor(subtitles[0].start % 60)).padStart(2, "0")}-nél indul.` : "";
        const caption = line?.hu || waiting || (subtitles.length ? "" : "A magyar felirat indításra vár.");
        byId("overlay").textContent = caption;
        byId("liveCaption").textContent = caption;
      }, 250);
    }
    async function buildHungarianSubtitles(videoId = null) {
      const id = videoId || getVideoId(byId("url").value) || currentVideoId;
      byId("status").className = "status note"; byId("status").textContent = "⏳ Lengyel felirat letöltése…"; byId("translate").disabled = true;
      try {
        const cached = win.localStorage?.getItem(`plhu-v017-${id}`);
        if (cached) subtitles = JSON.parse(cached);
        else {
          const response = await fetchFn(transcriptEndpoint(id), { headers: { Accept: "text/plain" } });
          const text = await response.text();
          if (!response.ok) throw new Error(`Transcript HTTP ${response.status}`);
          subtitles = mergeTranscriptRows(parseTranscript(text));
          if (!subtitles.length) throw new Error("Nem található időzített lengyel felirat.");
          byId("status").textContent = "⏳ Kontextusos magyar fordítás készítése…";
          subtitles = await translateRowsWithContext(subtitles, fetchFn);
          subtitles = subtitles.flatMap(row => expandSubtitle(row));
          win.localStorage?.setItem(`plhu-v017-${id}`, JSON.stringify(subtitles));
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
      byId("status").className = "status note"; byId("status").textContent = "Videó betöltve. A magyar felirat automatikusan készül…";
      buildHungarianSubtitles(id);
    };
    byId("translate").onclick = () => buildHungarianSubtitles();
    byId("syncEarlier").onclick = () => setSyncOffset(syncOffset + 0.5);
    byId("syncLater").onclick = () => setSyncOffset(syncOffset - 0.5);
    byId("syncReset").onclick = () => setSyncOffset(0);
    byId("fullscreen").onclick = async () => {
      const shell = byId("playerShell");
      try {
        if (!document.fullscreenElement) {
          await shell.requestFullscreen();
        } else await document.exitFullscreen();
      } catch (_) { byId("status").textContent = "A teljes képernyős módot a böngésző nem engedte."; }
    };
    createPlayer(DEFAULT_VIDEO_ID);
    win.setTimeout(() => buildHungarianSubtitles(DEFAULT_VIDEO_ID), 0);
  }
  return { DEFAULT_VIDEO_ID, VIDEO_SYNC_DEFAULTS, getVideoId, transcriptEndpoint, timestampToSeconds, collapseRepeats, parseTranscript, mergeTranscriptRows, splitText, translateViaGoogle, translateText, translateRowsWithContext, stripNonSpeechMarkers, normalizeHungarian, splitCaptionText, findSubtitleAt, expandSubtitle, start };
});
