const THVL_ID = '7bf43e25-e9e9-4aa6-8554-38de13c5263d';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    // 1. Lấy link LIVE trực tiếp, không qua EPG
    const liveRes = await fetch(`https://api-ott.admon.com.vn/api/tenant/thvli/channel/${THVL_ID}/play`, {
      headers: {
        'Referer': 'https://thvli.vn/',
        'Origin': 'https://thvli.vn',
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      },
      cache: 'no-store'
    });

    let finalUrl = null;
    let title = "THVL FM 90.2";

    if (liveRes.ok) {
      const liveJson = await liveRes.json();
      // API live thường trả về data.link_play là link live playlist.m3u8
      finalUrl = liveJson?.data?.link_play || liveJson?.data?.url || liveJson?.data?.stream_url;
      title = liveJson?.data?.title || title;
    }

    // 2. Nếu API live không trả về, tự tạo link live từ JWT của EPG nhưng ép sang playlist
    if (!finalUrl) {
      const epgRes = await fetch(`https://api-ott.admon.com.vn/api/tenant/thvli/epg/${THVL_ID}/?play-date=${new Date().toISOString().slice(0,10)}`, {
        headers: { Referer: 'https://thvli.vn/' }
      });
      const epgJson = await epgRes.json();
      const now = Math.floor(Date.now()/1000);
      const cur = epgJson?.data?.items?.find(i => Number(i.start_at) <= now && now < Number(i.end_at));
      if (cur?.link_play) {
        // Lấy JWT token từ link cũ
        const m = cur.link_play.match(/catchup\.thvli\.vn\/([^\/]+)\/radio\//);
        if (m) {
          const token = m[1];
          // Tạo link live mới với cùng token nhưng file là playlist.m3u8
          finalUrl = `https://catchup.thvli.vn/${token}/radio/playlist.m3u8`;
        } else {
          finalUrl = cur.link_play;
        }
        title = cur.title;
      }
    }

    if (!finalUrl) throw new Error("Không lấy được link live");

    // 3. Resolve ra chunklist cuối cùng
    const r1 = await fetch(finalUrl, { headers: { Referer: 'https://thvli.vn/', Origin: 'https://thvli.vn' } });
    const t1 = await r1.text();
    let mediaUrl = finalUrl;
    
    // Tìm file m3u8 con cuối cùng (thường là chất lượng cao nhất)
    const lines = t1.split('\n').map(l=>l.trim()).filter(l=>l && !l.startsWith('#') && l.includes('.m3u8'));
    if (lines.length > 0) {
      const last = lines[lines.length-1];
      mediaUrl = last.startsWith('http') ? last : finalUrl.substring(0, finalUrl.lastIndexOf('/')+1) + last;
    }

    return res.status(200).json({
      success: true,
      title: title,
      url: mediaUrl, // link live, không phải dvr_range
      live_url: finalUrl,
      date: new Date().toISOString().slice(0,10)
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
