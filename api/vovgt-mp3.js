const H = { "Referer": "https://vovgiaothong.vn/", "User-Agent": "Mozilla/5.0" };

async function getText(u) {
  const r = await fetch(u, { headers: H, redirect: 'follow' });
  if (!r.ok) throw new Error("upstream " + r.status + " " + u);
  return { text: await r.text(), url: r.url };
}

function tsToMp3(buf) {
  const payloadOff = (p) => {
    const afc = (p[3] >> 4) & 3;
    if (afc === 1) return 4; // payload only
    if (afc === 3) return 5 + p[4]; // adapt + payload
    return -1; // adapt only
  };

  let pmtPid = -1, audioPid = -1;

  // 1. Tìm PMT và Audio PID trong segment này
  for (let i = 0; i + 188 <= buf.length; i += 188) {
    const p = buf.subarray(i, i + 188);
    if (p[0]!== 0x47 ||!(p[1] & 0x40)) continue; // chỉ xét gói có PUSI
    const pid = ((p[1] & 0x1f) << 8) | p[2];
    let off = payloadOff(p);
    if (off < 0) continue;
    const pointer = p[off];
    const t = off + 1 + pointer;
    if (t + 12 >= 188) continue;

    if (pid === 0 && pmtPid < 0) {
      pmtPid = ((p[t + 10] & 0x1f) << 8) | p[t + 11];
    } else if (pid === pmtPid && audioPid < 0) {
      const secLen = ((p[t + 1] & 0x0f) << 8) | p[t + 2];
      const end = Math.min(t + 3 + secLen - 4, 188);
      let q = t + 12 + (((p[t + 10] & 0x0f) << 8) | p[t + 11]);
      while (q + 5 <= end) {
        const type = p[q];
        const elemPid = ((p[q + 1] & 0x1f) << 8) | p[q + 2];
        if ((type === 0x03 || type === 0x04) && audioPid < 0) audioPid = elemPid;
        q += 5 + (((p[q + 3] & 0x0f) << 8) | p[q + 4]);
      }
    }
  }

  if (audioPid < 0) return { mp3: Buffer.alloc(0), pmtPid, audioPid };

  // 2. Bóc payload
  const out = [];
  for (let i = 0; i + 188 <= buf.length; i += 188) {
    const p = buf.subarray(i, i + 188);
    if (p[0]!== 0x47) continue;
    if ((((p[1] & 0x1f) << 8) | p[2])!== audioPid) continue;
    let off = payloadOff(p);
    if (off < 0) continue;
    if (p[1] & 0x40) { // PES header
      if (!(p[off] === 0 && p[off + 1] === 0 && p[off + 2] === 1)) continue;
      off += 9 + p[off + 8];
      if (off >= 188) continue;
    }
    out.push(p.subarray(off, 188));
  }
  return { mp3: Buffer.concat(out), pmtPid, audioPid };
}

export const config = { runtime: 'nodejs', regions: ['sin1'], maxDuration: 300 };

export default async (req, res) => {
  const ch = /^[\w-]+$/.test(req.query.ch || "")? req.query.ch : "gthcm";
  const master = `https://play.vovgiaothong.vn/live/${ch}/playlist.m3u8`;
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");

  let closed = false;
  req.on("close", () => { closed = true; });
  const seen = new Set();
  let chunklist = null;
  let cachedPmt = -1, cachedAudio = -1;

  while (!closed) {
    try {
      if (!chunklist) {
        const m = await getText(master);
        let last = "";
        for (const l of m.text.split("\n")) {
          const s = l.trim();
          if (s &&!s.startsWith("#") && s.includes(".m3u8")) last = s;
        }
        if (!last) throw new Error("no sub playlist");
        chunklist = new URL(last, m.url).href;
      }
      const pl = await getText(chunklist);
      for (const l of pl.text.split("\n")) {
        const s = l.trim();
        if (!s || s.startsWith("#")) continue;
        const name = s.split("?")[0].split("/").pop();
        if (seen.has(name)) continue;

        const r = await fetch(new URL(s, pl.url).href, { headers: H });
        if (!r.ok) continue;
        const result = tsToMp3(Buffer.from(await r.arrayBuffer()));

        if (result.pmtPid > 0) cachedPmt = result.pmtPid;
        if (result.audioPid > 0) cachedAudio = result.audioPid;

        if (result.mp3.length > 0) {
          // Fix: Đảm bảo bắt đầu từ frame sync MP3 0xFFFB để ESP32 không bị rè lúc đầu
          const sync = result.mp3.indexOf(Buffer.from([0xFF, 0xFB]));
          if (sync > 0) res.write(result.mp3.subarray(sync));
          else res.write(result.mp3);
          seen.add(name);
        }
      }
      if (seen.size > 50) seen.delete([...seen][0]);
    } catch (e) {
      console.log("err", e.message, "pmt", cachedPmt, "audio", cachedAudio);
      chunklist = null;
      await new Promise(r => setTimeout(r, 2000));
    }
    await new Promise(r => setTimeout(r, 800));
  }
  res.end();
};
