export const config = {
  runtime: 'nodejs',
  regions: ['sin1'],
};

// ---- TS Parser chuẩn ----
function getPid(buf, i) { return ((buf[i+1] & 0x1F) << 8) | buf[i+2]; }
function hasPayload(buf, i) { return (buf[i+3] & 0x10)!== 0; }
function getPayloadOffset(buf, i) {
  const adapt = (buf[i+3] >> 4) & 0x03; // 1=payload only, 2=adapt only, 3=both
  if (adapt === 2) return -1;
  let off = 4;
  if (adapt === 3) {
    const adapLen = buf[i+4];
    off += 1 + adapLen;
  }
  return off;
}

function findPmtPid(tsBuf) {
  for (let i = 0; i + 188 <= tsBuf.length; i += 188) {
    if (tsBuf[i]!== 0x47) continue;
    if (getPid(tsBuf, i)!== 0) continue;
    if (!hasPayload(tsBuf, i)) continue;
    let off = getPayloadOffset(tsBuf, i);
    const pusi = (tsBuf[i+1] & 0x40)!== 0;
    if (pusi) {
      const pointer = tsBuf[i+off];
      off += 1 + pointer;
    }
    if (tsBuf[i+off]!== 0x00) continue; // PAT
    const secLen = ((tsBuf[i+off+1] & 0x0F) << 8) | tsBuf[i+off+2];
    for (let p = i+off+8; p+4 <= i+off+3+secLen-4; p+=4) {
      const prog = (tsBuf[p] << 8) | tsBuf[p+1];
      const pmtPid = ((tsBuf[p+2] & 0x1F) << 8) | tsBuf[p+3];
      if (prog!== 0) return pmtPid;
    }
  }
  return null;
}

function findMp3Pid(tsBuf, pmtPid) {
  for (let i = 0; i + 188 <= tsBuf.length; i += 188) {
    if (tsBuf[i]!== 0x47) continue;
    if (getPid(tsBuf, i)!== pmtPid) continue;
    if (!hasPayload(tsBuf, i)) continue;
    let off = getPayloadOffset(tsBuf, i);
    const pusi = (tsBuf[i+1] & 0x40)!== 0;
    if (pusi) {
      const pointer = tsBuf[i+off];
      off += 1 + pointer;
    }
    if (tsBuf[i+off]!== 0x02) continue; // PMT
    const progInfoLen = ((tsBuf[i+off+10] & 0x0F) << 8) | tsBuf[i+off+11];
    let pos = i+off+12+progInfoLen;
    const secEnd = i+off+3+ (((tsBuf[i+off+1] & 0x0F) << 8) | tsBuf[i+off+2]) - 4;
    while (pos + 5 < secEnd) {
      const streamType = tsBuf[pos];
      const elemPid = ((tsBuf[pos+1] & 0x1F) << 8) | tsBuf[pos+2];
      const esLen = ((tsBuf[pos+3] & 0x0F) << 8) | tsBuf[pos+4];
      if (streamType === 0x03 || streamType === 0x04) return elemPid; // MP3
      pos += 5 + esLen;
    }
  }
  return null;
}

function extractMp3Payload(tsBuf, audioPid) {
  const chunks = [];
  for (let i = 0; i + 188 <= tsBuf.length; i += 188) {
    if (tsBuf[i]!== 0x47) continue;
    if (getPid(tsBuf, i)!== audioPid) continue;
    const off = getPayloadOffset(tsBuf, i);
    if (off < 0 || off >= 188) continue;
    if (!hasPayload(tsBuf, i)) continue;

    let payloadOff = i + off;
    const pusi = (tsBuf[i+1] & 0x40)!== 0;
    if (pusi) {
      // PES header: 00 00 01 xx xx xx xx xx xx
      if (tsBuf[payloadOff] === 0x00 && tsBuf[payloadOff+1] === 0x00 && tsBuf[payloadOff+2] === 0x01) {
        const pesHeaderLen = tsBuf[payloadOff+8];
        payloadOff += 9 + pesHeaderLen;
      }
    }
    if (payloadOff < i+188) {
      chunks.push(tsBuf.subarray(payloadOff, i+188));
    }
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const city = urlObj.searchParams.get('ch') || 'gthcm';
  const masterUrl = city === 'gthn'
  ? "https://play.vovgiaothong.vn/live/gthn/playlist.m3u8"
    : "https://play.vovgiaothong.vn/live/gthcm/playlist.m3u8";

  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  let pmtPid = null;
  let audioPid = null;
  const seen = new Set();

  const abort = () => { try{ res.end(); }catch{} };
  req.on('close', abort);

  while (!req.socket.destroyed) {
    try {
      const masterText = await fetch(masterUrl, { headers: { Referer: "https://vovgiaothong.vn/", "User-Agent": "Mozilla/5.0" } }).then(r=>r.text());
      const subLine = masterText.split('\n').find(l=>l.trim() &&!l.trim().startsWith('#') && l.includes('.m3u8'));
      if (!subLine) { await new Promise(r=>setTimeout(r,1000)); continue; }
      const subUrl = subLine.trim().startsWith('http')? subLine.trim() : new URL(subLine.trim(), masterUrl).toString();

      const subText = await fetch(subUrl, { headers: { Referer: "https://vovgiaothong.vn/", "User-Agent": "Mozilla/5.0" } }).then(r=>r.text());
      const base = subUrl.slice(0, subUrl.lastIndexOf('/')+1);
      const tsUrls = subText.split('\n').map(s=>s.trim()).filter(s=>s &&!s.startsWith('#') && s.includes('.ts')).map(s=> s.startsWith('http')? s : base+s);

      for (const tsUrl of tsUrls) {
        if (seen.has(tsUrl)) continue;
        const tsBuf = Buffer.from(await fetch(tsUrl, { headers: { Referer: "https://vovgiaothong.vn/", "User-Agent": "Mozilla/5.0" } }).then(r=>r.arrayBuffer()));

        if (!pmtPid) pmtPid = findPmtPid(tsBuf);
        if (pmtPid &&!audioPid) audioPid = findMp3Pid(tsBuf, pmtPid);
        if (!audioPid) continue;

        const mp3 = extractMp3Payload(tsBuf, audioPid);
        // lọc bỏ gói không có sync MP3 để tránh nhiễu
        if (mp3.length > 100 && mp3.includes(0xFF)) {
          res.write(mp3);
          seen.add(tsUrl);
        }
        if (seen.size > 30) seen.delete([...seen][0]);
      }
    } catch(e){ console.error(e); }
    await new Promise(r=>setTimeout(r, 1200));
  }
}
