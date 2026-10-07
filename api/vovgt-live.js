export default async function handler(req, res) {
  const ch = req.query.ch || 'gthcm';
  const masterUrl = `https://play.vovgiaothong.vn/live/${ch}/playlist.m3u8`;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "audio/aac");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Hàm lấy chunklist mới nhất
  async function getChunklist() {
    const r = await fetch(masterUrl, { headers: { Referer: "https://vovgiaothong.vn/", "User-Agent": "Mozilla/5.0" } });
    const txt = await r.text();
    let chunklist = "";
    for (const l of txt.split("\n")) if (l.trim() &&!l.trim().startsWith("#") && l.includes(".m3u8")) chunklist = l.trim();
    if (!chunklist.startsWith("http")) chunklist = masterUrl.substring(0, masterUrl.lastIndexOf('/')+1) + chunklist;
    const r2 = await fetch(chunklist, { headers: { Referer: "https://vovgiaothong.vn/", "User-Agent": "Mozilla/5.0" } });
    return { text: await r2.text(), base: chunklist.substring(0, chunklist.lastIndexOf('/')+1) };
  }

  let lastSeq = "";
  try {
    for (let loop = 0; loop < 300; loop++) { // chạy 10 phút mỗi request
      const { text, base } = await getChunklist();
      const lines = text.split("\n").map(s=>s.trim()).filter(s=>s &&!s.startsWith("#"));
      // chỉ lấy 3 chunk mới chưa gửi
      const newChunks = lines.filter(u =>!lastSeq.includes(u)).slice(-3);
      for (const u of newChunks) {
        let tsUrl = u.startsWith("http")? u : base + u;
        const r = await fetch(tsUrl, { headers: { Referer: "https://vovgiaothong.vn/", "User-Agent": "Mozilla/5.0" } });
        const buf = Buffer.from(await r.arrayBuffer());
        // Demux TS -> lấy payload AAC thôi (bỏ header 188 byte)
        let out = [];
        for (let i = 0; i < buf.length; i += 188) {
          if (buf[i]!== 0x47) continue;
          const hasAdapt = (buf[i+3] & 0x20)!== 0;
          let offset = 4;
          if (hasAdapt) offset += 1 + buf[i+4];
          if (i+offset < buf.length) out.push(buf.subarray(i+offset, i+188));
        }
        if (out.length) res.write(Buffer.concat(out));
      }
      if (newChunks.length) lastSeq = newChunks[newChunks.length-1];
      await new Promise(r=>setTimeout(r, 2000));
    }
  } catch(e) {}
  res.end();
}
