const THVL_ID = '7bf43e25-e9e9-4aa6-8554-38de13c5263d';
const THVL_API = 'https://api-ott.admon.com.vn/api/tenant/thvli/epg';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    // =========================
    // 1. Ngày Việt Nam
    // =========================
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const date = vn.toISOString().slice(0, 10);

    // =========================
    // 2. Lấy EPG THVL
    // =========================
    const epgUrl = `${THVL_API}/${THVL_ID}/?play-date=${date}`;

    const epgResponse = await fetch(epgUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://thvli.vn/',
      },
      cache: 'no-store',
    });

    if (!epgResponse.ok) {
      return res.status(502).json({
        success: false,
        error: `THVL API returned ${epgResponse.status}`,
      });
    }

    const epg = await epgResponse.json();
    const items = epg?.data?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(502).json({
        success: false,
        error: 'THVL không trả về danh sách chương trình',
      });
    }

    // =========================
    // 3. Tìm chương trình hiện tại
    // =========================
    const nowUnix = Math.floor(Date.now() / 1000);

    const current = items.find(item =>
      Number(item.start_at) <= nowUnix &&
      nowUnix < Number(item.end_at) &&
      item.link_play
    );

    if (!current) {
      return res.status(502).json({
        success: false,
        error: 'Không tìm thấy chương trình đang phát',
        timestamp: nowUnix,
      });
    }

    const masterUrl = current.link_play;

    console.log('THVL master:', masterUrl);

    // =========================
    // 4. Lấy master M3U8
    // =========================
    const masterResponse = await fetch(masterUrl, {
      method: 'GET',
      headers: {
        Accept: '*/*',
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://thvli.vn/',
      },
      cache: 'no-store',
    });

    if (!masterResponse.ok) {
      return res.status(502).json({
        success: false,
        error: `Master M3U8 returned ${masterResponse.status}`,
        master_url: masterUrl,
      });
    }

    const masterText = await masterResponse.text();

    console.log('Master M3U8:', masterText);

    // =========================
    // 5. Tìm media playlist
    // =========================
    const lines = masterText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    let mediaPath = null;

    for (const line of lines) {
      if (
        !line.startsWith('#') &&
        line.toLowerCase().includes('.m3u8')
      ) {
        mediaPath = line;
        break;
      }
    }

    if (!mediaPath) {
      return res.status(502).json({
        success: false,
        error: 'Không tìm thấy media playlist',
        master_url: masterUrl,
      });
    }

    // =========================
    // 6. Chuyển relative URL
    //    thành absolute URL
    // =========================
    const mediaUrl = new URL(mediaPath, masterUrl).toString();

    console.log('THVL media:', mediaUrl);

    // =========================
    // 7. Trả kết quả
    // =========================
    return res.status(200).json({
      success: true,
      title: current.title,
      url: mediaUrl,
      master_url: masterUrl,
      start_at: current.start_at,
      end_at: current.end_at,
      date,
    });

  } catch (error) {
    console.error('THVL API error:', error);

    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error',
    });
  }
}
