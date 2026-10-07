export default async function handler(req, res) {
  const ch = (req.query.ch || 'gthcm').toLowerCase();
  const masterUrl = `https://play.vovgiaothong.vn/live/${ch}/playlist.m3u8`;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "video/mp2t");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.setHeader("Connection", "keep-alive");

  async function getChunklist() {
    const r = await fetch(masterUrl, { headers: { Referer: "https://vovgiaothong.vn/", "User-Agent": "Mozilla/5.0" } });
    const txt = await r.text();
    let chunklist = "";
    for (const l of txt.split("\n")) {
      const t = l.trim();
      if (t && !t.startsWith("#") && t.includes(".m3u8")) chunklist = t;
    }
    if (!chunklist) throw "no chunklist";
    if (!chunklist.startsWith("http")) chunklist = masterUrl.slice(0, masterUrl.lastIndexOf('/')+1) + chunklist;
    const r2 = await fetch(chunklist, { headers: { Referer: "https://vovgiaothong.vn/", "User-Agent": "Mozilla/5.0" } });
    return { text: await r2.text(), base: chunklist.slice(0, chunklist.lastIndexOf('/')+1) };
  }

  let seen = new Set();
  try {
    for (let i = 0; i < 600; i++) {
      const { text, base } = await getChunklist();
      const chunks = text.split("\n").map(s=>s.trim()).filter(s=>s && !s.startsWith("#"));
      const news = chunks.filter(c=>!seen.has(c)).slice(-2);
      for (const c of news) {
        let tsUrl = c.startsWith("http") ? c : base + c;
        const r = await fetch(tsUrl, { headers: { Referer: "https://vovgiaothong.vn/", "User-Agent": "Mozilla/5.0" } });
        const ab = await r.arrayBuffer();
        res.write(Buffer.from(ab));
        seen.add(c);
      }
      if (seen.size > 20) { // giữ set nhỏ thôi
        const arr = Array.from(seen);
        seen = new Set(arr.slice(-10));
      }
      await new Promise(r=>setTimeout(r, 1500));
    }
  } catch(e) {
    console.error(e);
  }
  res.end();
}
