export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const masterUrl = 'https://live.canthotv.vn/live/radio1.stream/playlist.m3u8';

    // Lấy master playlist
    const r1 = await fetch(masterUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://canthotv.vn/' }
    });
    const t1 = await r1.text();

    // Tìm chunklist
    const lines = t1.split('\n').map(l=>l.trim()).filter(l=>l &&!l.startsWith('#') && l.includes('.m3u8'));
    let chunklistUrl = masterUrl;
    if (lines.length > 0) {
      const last = lines[lines.length-1];
      chunklistUrl = last.startsWith('http')? last : masterUrl.substring(0, masterUrl.lastIndexOf('/')+1) + last;
    }

    // Lấy chunklist (chứa 10 chunk 2s)
    const r2 = await fetch(chunklistUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://canthotv.vn/' }
    });
    const t2 = await r2.text();

    // Trả về nguyên chunklist cho ESP32, nhưng quan trọng là base URL vẫn là canthotv
    // ESP32-audio sẽ tự tải chunk. Để hết giật, ta ép ESP32 dùng buffer lớn hơn
    // Nên ở đây ta chỉ cần trả về link chunklist gốc đã resolve

    return res.status(200).json({
      success: true,
      title: "Radio Cần Thơ",
      url: chunklistUrl, // ESP32 sẽ phát link này, nhưng đã qua Vercel resolve nên nhanh hơn
      master: masterUrl
    });

  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
