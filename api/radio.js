const THVL_ID = '7bf43e25-e9e9-4aa6-8554-38de13c5263d';
const THVL_API = 'https://api-ott.admon.com.vn/api/tenant/thvli/epg';

async function resolveMediaPlaylist(masterUrl) {
  try {
    const res = await fetch(masterUrl, {
      headers: {
        'Referer': 'https://thvli.vn/',
        'Origin': 'https://thvli.vn',
        'User-Agent': 'Mozilla/5.0',
        'Accept': '*/*'
      },
      cache: 'no-store'
    });

    if (!res.ok) return masterUrl;

    const text = await res.text();

    // Nếu file này đã chứa.ts thì nó đã là media playlist
    if (text.includes('.ts') && text.includes('#EXTINF')) {
      return masterUrl;
    }

    // Tìm dòng.m3u8 con (thường là chất lượng cao nhất ở cuối file)
    const lines = text.split('\n').map(l => l.trim()).filter(l => l &&!l.startsWith('#'));
    let lastM3u8 = null;
    for (const line of lines) {
      if (line.includes('.m3u8')) lastM3u8 = line;
    }

    if (!lastM3u8) return masterUrl;

    // Nối URL
    if (lastM3u8.startsWith('http')) {
      return lastM3u8;
    } else {
      const base = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
      return base + lastM3u8;
    }
  } catch (e) {
    console.error('resolveMediaPlaylist error', e);
    return masterUrl;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // cho ESP32 gọi

  if (req.method!== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const date = vn.toISOString().slice(0, 10);

    const url = `${THVL_API}/${THVL_ID}/?play-date=${date}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://thvli.vn/',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return res.status(502).json({ success: false, error: `THVL API returned ${response.status}` });
    }

    const json = await response.json();
    const items = json?.data?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(502).json({ success: false, error: 'THVL không trả về danh sách chương trình' });
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    const current = items.find(item =>
      Number(item.start_at) <= nowUnix &&
      nowUnix < Number(item.end_at) &&
      item.link_play
    );

    if (!current) {
      return res.status(502).json({ success: false, error: 'Không tìm thấy chương trình đang phát', timestamp: nowUnix });
    }

    // QUAN TRỌNG: Tự động resolve ra media playlist cuối cùng
    const finalUrl = await resolveMediaPlaylist(current.link_play);

    return res.status(200).json({
      success: true,
      title: current.title,
      url: finalUrl, // ĐÃ LÀ LINK MEDIA CUỐI CÙNG, ESP32 phát thẳng
      master_url: current.link_play,
      start_at: current.start_at,
      end_at: current.end_at,
      date,
    });

  } catch (error) {
    console.error('THVL API error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Unknown error' });
  }
}
