export const config = {
  runtime: 'nodejs', // phải dùng nodejs để stream liên tục được
  regions: ['sin1'], // để gần VN cho đỡ lag
};

function getPmtPidFromPat(buf) {
  for (let i = 0; i < buf.length; i += 188) {
    if (buf[i]!== 0x47) continue;
    const pid = ((buf[i+1] & 0x1F) << 8) | buf[i+2];
    if (pid!== 0) continue;
    const payloadStart = (buf[i+1] & 0x40)? 5 : 4;
    const pointer = buf[i+payloadStart];
    let off = i + payloadStart + 1 + pointer;
    if (buf[off]!== 0x00) continue; // table_id PAT
    const sectionLen = ((buf[off+1] & 0x0F) << 8) | buf[off+2];
    for (let j = off+8; j < off+3+sectionLen-4; j+=4) {
      const program = (buf[j] << 8) | buf[j+1];
      const pmtPid = ((buf[j+2] & 0x1F) << 8) | buf[j+3];
      if (program!== 0) return pmtPid;
    }
  }
  return null;
}

function getAudioPidFromPmt(buf, pmtPid) {
  for (let i = 0; i < buf.length; i += 188) {
    if (buf[i]!== 0x47) continue;
    const pid = ((buf[i+1] & 0x1F) << 8) | buf[i+2];
    if (pid!== pmtPid) continue;
    const hasAdapt = (buf[i+3] & 0x20) >> 5;
    let offset = 4;
    if (hasAdapt) offset += 1 + buf[i+4];
    const payloadStart = (buf[i+1] & 0x40)? 1 : 0;
    if (payloadStart) offset += 1 + buf[i+offset];
    let off = i + offset;
    if (buf[off]!== 0x02) continue; // table_id PMT
    const progInfoLen = ((buf[off+10] & 0x0F) << 8) | buf[off+11];
    let pos = off + 12 + progInfoLen;
    const end = off + 3 + (((buf[off+1] & 0x0F) << 8) | buf[off+2]) - 4;
    while (pos + 5 < end) {
      const streamType = buf[pos];
      const elemPid = ((buf[pos+1] & 0x1F) << 8) | buf[pos+2];
      // 0x03, 0x04 = MP3
      if (streamType === 0x03 || streamType === 0x04) return elemPid;
      const esLen = ((buf[pos+3] & 0x0F) << 8) | buf[pos+4];
      pos += 5 + esLen;
    }
  }
  return null;
}

function extractMp3(buf, audioPid) {
  let out = [];
  for (let i = 0; i < buf.length; i += 188) {
    if (buf[i]!== 0x47) continue;
    const pid = ((buf[i+1] & 0x1F) << 8) | buf[i+2];
    if (pid!== audioPid) continue;
    const hasAdapt = (buf[i+3] & 0x20) >> 5;
    const hasPayload = (buf[i+3] & 0x10) >> 4;
    if (!hasPayload) continue;
    let offset = 4;
    if (hasAdapt) {
      const adapLen = buf[i+4];
      offset += 1 + adapLen;
    }
    if (buf[i+1] & 0x40) { // PUSI - có PES header
      const pesStart = i + offset;
      if (buf[pesStart] === 0x00 && buf[pesStart+1] === 0x00 && buf[pesStart+2] === 0x01) {
        const pesHeaderLen = buf[pesStart+8];
        offset += 9 + pesHeaderLen;
      }
    }
    const payloadLen = 188 - offset;
    if (payloadLen > 0) {
      out.push(buf.subarray(i + offset, i + 188));
    }
  }
  return Buffer.concat(out);
}

export default async function handler(req, res) {
  const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const city = searchParams.get('ch') || searchParams.get('city') || 'gthcm';
  const masterUrl = city === 'gthn'
   ? "https://play.vovgiaothong.vn/live/gthn/playlist.m3u8"
    : "https://play.vovgiaothong.vn/live/gthcm/playlist.m3u8";

  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "no-cache, no-store",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Transfer-Encoding": "chunked",
  });

  let pmtPid = null;
  let audioPid = null;
  const seen = new Set();

  try {
    while (true) {
      if (req.socket.destroyed) break;

      const masterRes = await fetch(masterUrl, { headers: { "Referer": "https://vovgiaothong.vn/", "User-Agent": "Mozilla/5.0" } });
      const masterText = await masterRes.text();
      const subPath = masterText.split('\n').find(l => l.trim() &&!l.startsWith('#') && l.includes('.m3u8'));
      if (!subPath) continue;
      const subUrl = subPath.trim().startsWith('http')? subPath.trim() : new URL(subPath.trim(), masterUrl).toString();

      const subRes = await fetch(subUrl, { headers: { "Referer": "https://vovgiaothong.vn/", "User-Agent": "Mozilla/5.0" } });
      const subText = await subRes.text();
      const base = subUrl.substring(0, subUrl.lastIndexOf('/') + 1);
      const tsList = subText.split('\n').map(l=>l.trim()).filter(l=>l &&!l.startsWith('#') && l.includes('.ts')).map(l=> l.startsWith('http')? l : base + l);

      for (const tsUrl of tsList) {
        if (seen.has(tsUrl)) continue;
        seen.add(tsUrl);
        if (seen.size > 20) seen.delete([...seen][0]);

        const tsRes = await fetch(tsUrl, { headers: { "Referer": "https://vovgiaothong.vn/", "User-Agent": "Mozilla/5.0" } });
        const ab = await tsRes.arrayBuffer();
        const buf = Buffer.from(ab);

        if (!pmtPid) pmtPid = getPmtPidFromPat(buf);
        if (pmtPid &&!audioPid) audioPid = getAudioPidFromPmt(buf, pmtPid);
        if (!audioPid) continue;

        const mp3 = extractMp3(buf, audioPid);
        if (mp3.length > 0) {
          res.write(mp3);
        }
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch(e) {
    console.error(e);
  } finally {
    res.end();
  }
}
