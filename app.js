(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) api.start(root.document, root.fetch.bind(root));
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DEFAULT_VIDEO_ID = "RWKjvaV_rv4";

  function getVideoId(value) {
    const input = (value || "").trim();
    if (/^[\w-]{11}$/.test(input)) return input;
    try {
      const url = new URL(input);
      if (url.hostname === "youtu.be" || url.hostname.endsWith(".youtu.be")) {
        return url.pathname.split("/").filter(Boolean)[0] || null;
      }
      if (url.searchParams.get("v")) return url.searchParams.get("v");
      const parts = url.pathname.split("/").filter(Boolean);
      const marker = parts.findIndex(part => ["embed", "shorts", "live"].includes(part));
      return marker >= 0 && parts[marker + 1] ? parts[marker + 1] : null;
    } catch (_) {
      return null;
    }
  }

  function transcriptEndpoint(videoId) {
    return `https://youtube-transcript.ai/transcript/${encodeURIComponent(videoId)}.txt?lang=pl`;
  }

  function start(document, fetchFn) {
    const byId = id => document.getElementById(id);
    let currentVideoId = DEFAULT_VIDEO_ID;

    byId("load").onclick = () => {
      const id = getVideoId(byId("url").value);
      if (!id) {
        byId("status").className = "status err";
        byId("status").textContent = "✗ Nem sikerült felismerni a YouTube videóazonosítót.";
        return;
      }
      currentVideoId = id;
      byId("player").src = `https://www.youtube.com/embed/${encodeURIComponent(id)}?playsinline=1&rel=0`;
      byId("status").className = "status note";
      byId("status").textContent = "Videó betöltve. Indítható a lengyel feliratteszt.";
    };

    byId("test").onclick = async () => {
      const id = getVideoId(byId("url").value) || currentVideoId;
      const endpoint = transcriptEndpoint(id);
      byId("status").className = "status note";
      byId("status").textContent = "⏳ Lengyel transcript lekérése…";
      byId("out").textContent = `Lekérés: ${endpoint}`;
      try {
        const response = await fetchFn(endpoint, { headers: { Accept: "text/plain" } });
        const text = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}\n${text.slice(0, 1000)}`);
        if (!text.trim()) throw new Error("A szolgáltatás üres választ adott.");
        byId("status").className = "status ok";
        byId("status").textContent = "✓ Transcript válasz megérkezett. Nézd meg lent a lengyel szöveget/időbélyegeket.";
        byId("out").textContent = text;
      } catch (error) {
        byId("status").className = "status err";
        byId("status").textContent = "✗ A transcript lekérése nem sikerült. A videó ettől továbbra is működik.";
        byId("out").textContent = String(error && (error.stack || error.message) || error);
      }
    };
  }

  return { DEFAULT_VIDEO_ID, getVideoId, transcriptEndpoint, start };
});
