const H = { "Referer": "https://vovgiaothong.vn/", "User-Agent": "Mozilla/5.0" };

async function getText(u) {
  const r = await fetch(u, { headers: H });
  if (!r.ok) throw new Error("upstream " + r.status);
  return { text: await r.text(), url: r.url };       // r.url = URL sau redirect
}

// Bóc payload MP3 (stream type 0x03/0x04) từ một segment TS
function tsToMp3(buf) {
  const payloadOff = (p) => {
    const afc = (p[3] >> 4) & 3;
    if (afc === 1) return 4;
    if (afc === 3) return 5 + p[4];
    return -1;
  };
  let pmtPid = -1, audioPid = -1;
  for (let i = 0; i + 188 <= buf.length; i += 188) {
    const p = buf.subarray(i, i + 188);
    if (p[0] !== 0x47 || !(p[1] & 0x40)) continue;
    const pid = ((p[1] & 0x1f) << 8) | p[2];
    const off = payloadOff(p);
    if (off < 0) continue;
    const t = off + 1 + p[off];
    if (pid === 0 && pmtPid < 0) {
      pmtPid = ((p[t + 10] & 0x1f) << 8) | p[t + 11];
    } else if (pid === pmtPid && audioPid < 0) {
      const secLen = ((p[t + 1] & 0x0f) << 8) | p[t + 2];
      const end = Math.min(t + 3 + secLen - 4, 188);
      let q = t + 12 + (((p[t + 10] & 0x0f) << 8) | p[t + 11]);
      while (q + 5 <= end) {
        const type = p[q];
        const spid = ((p[q + 1] & 0x1f) << 8) | p[q + 2];
        if ((type === 0x03 || type === 0x04) && audioPid < 0) audioPid = spid;
        q += 5 + (((p[q + 3] & 0x0f) << 8) | p[q + 4]);
      }
    }
  }
  if (audioPid < 0) { console.log("no mp3 pid, pmt", pmtPid); return Buffer.alloc(0); }
  const out = [];
  for (let i = 0; i + 188 <= buf.length; i += 188) {
    const p = buf.subarray(i, i + 188);
    if (p[0] !== 0x47) continue;
    if ((((p[1] & 0x1f) << 8) | p[2]) !== audioPid) continue;
    let off = payloadOff(p);
    if (off < 0 || off >= 188) continue;
    if (p[1] & 0x40) {                                  // đầu gói PES: bỏ header
      if (!(p[off] === 0 && p[off + 1] === 0 && p[off + 2] === 1)) continue;
      off += 9 + p[off + 8];
      if (off >= 188) continue;
    }
    out.push(p.subarray(off, 188));
  }
  return Buffer.concat(out);
}

export default async (req, res) => {
  const ch = /^[\w-]+$/.test(req.query.ch || "") ? req.query.ch : "gthcm";
  const master = `https://play.vovgiaothong.vn/live/${ch}/playlist.m3u8`;
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-store");

  let closed = false;
  req.on("close", () => { closed = true; });
  const deadline = Date.now() + 50000;                  // ngắt chủ động, ESP32 sẽ nối lại
  const seen = new Set();
  let chunklist = null;

  while (!closed && Date.now() < deadline) {
    try {
      if (!chunklist) {
        const m = await getText(master);
        let last = "";
        for (const l of m.text.split("\n")) {
          const s = l.trim();
          if (s && !s.startsWith("#") && s.includes(".m3u8")) last = s;
        }
        chunklist = new URL(last, m.url).href;
      }
      const pl = await getText(chunklist);
      for (const l of pl.text.split("\n")) {
        const s = l.trim();
        if (!s || s.startsWith("#")) continue;
        const name = s.split("?")[0].split("/").pop();
        if (seen.has(name)) continue;
        seen.add(name);
        const r = await fetch(new URL(s, pl.url).href, { headers: H });
        if (!r.ok) continue;
        const mp3 = tsToMp3(Buffer.from(await r.arrayBuffer()));
        if (mp3.length) res.write(mp3);
      }
    } catch (e) {
      console.log("err", e.message);
      chunklist = null;                                 // lấy lại playlist (wsSession mới)
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  res.end();
};
