export default async function handler(req, res) {
  const ch = req.query.ch || 'gthcm'; // gthcm hoặc gthn
  const masterUrl = `https://play.vovgiaothong.vn/live/${ch}/playlist.m3u8`;

  const r = await fetch(masterUrl, {
    headers: {
      "Referer": "https://vovgiaothong.vn/",
      "Origin": "https://vovgiaothong.vn",
      "User-Agent": "Mozilla/5.0"
    }
  });
  const text = await r.text();
  
  // Tìm chunklist trong master
  let chunklistUrl = "";
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (l && !l.startsWith("#") && l.includes(".m3u8")) {
      chunklistUrl = l;
    }
  }
  if (!chunklistUrl) return res.status(404).send("no chunklist");
  if (!chunklistUrl.startsWith("http")) {
    chunklistUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/')+1) + chunklistUrl;
  }

  // Tải chunklist thật
  const r2 = await fetch(chunklistUrl, {
    headers: {
      "Referer": "https://vovgiaothong.vn/",
      "Origin": "https://vovgiaothong.vn",
      "User-Agent": "Mozilla/5.0"
    }
  });
  let playlist = await r2.text();

  // Rewrite tất cả URL .ts thành URL proxy sạch của mình
  const base = chunklistUrl.substring(0, chunklistUrl.lastIndexOf('/')+1);
  playlist = playlist.split("\n").map(line => {
    let l = line.trim();
    if (l && !l.startsWith("#")) {
      if (!l.startsWith("http")) l = base + l;
      // /api/vovgt-ts?u=encodeURIComponent(tsUrl)
      return `/api/vovgt-ts?u=${encodeURIComponent(l)}`;
    }
    return line;
  }).join("\n");

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Cache-Control", "no-cache");
  res.send(playlist);
}
