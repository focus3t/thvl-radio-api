const THVL_ID = '7bf43e25-e9e9-4aa6-8554-38de13c5263d';
const THVL_API = 'https://api-ott.admon.com.vn/api/tenant/thvli/epg';

async function resolveMediaPlaylist(masterUrl) {
  try {
    // Ép từ DVR sang LIVE ngay từ đầu
    let urlToFetch = masterUrl.replace(/playlist_dvr_range[^\/]*\.m3u8.*/, 'playlist.m3u8');
    
    const res = await fetch(urlToFetch, {
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
    console.log("Master content preview:", text.substring(0,500));

    // Nếu đã là media playlist chứa .ts hoặc .aac thì trả về luôn
    if ((text.includes('.ts') || text.includes('.aac')) && text.includes('#EXTINF')) {
      return urlToFetch;
    }

    // Tìm dòng m3u8 con
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    let lastM3u8 = null;
    for (const line of lines) {
      if (line.includes('.m3u8')) lastM3u8 = line;
    }

    if (!lastM3u8) return urlToFetch;

    const finalUrl = lastM3u8.startsWith('http') ? lastM3u8 : urlToFetch.substring(0, urlToFetch.lastIndexOf('/') + 1) + lastM3u8;
    
    // Fetch thêm 1 lần nữa để chắc chắn không phải là chunks_dvr_range
    const res2 = await fetch(finalUrl, {
      headers: { 'Referer': 'https://thvli.vn/', 'Origin': 'https://thvli.vn', 'User-Agent': 'Mozilla/5.0' }
    });
    const text2 = await res2.text();
    if (text2.includes('.aac') || text2.includes('.ts')) {
      return finalUrl; // đây mới là media playlist thật
    }

    return finalUrl;
  } catch (e) {
    console.error('resolve error', e);
    return masterUrl;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const date = vn.toISOString().slice(0, 10);
    const url = `${THVL_API}/${THVL_ID}/?play-date=${date}`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0', Referer: 'https://thvli.vn/' },
      cache: 'no-store',
    });

    if (!response.ok) {
      return res.status(502).json({ success: false, error: `THVL API returned ${response.status}` });
    }

    const json = await response.json();
    const items = json?.data?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(502).json({ success: false, error: 'THVL không trả về danh sách' });
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    const current = items.find(item => Number(item.start_at) <= nowUnix && nowUnix < Number(item.end_at) && item.link_play);
    if (!current) {
      return res.status(502).json({ success: false, error: 'Không tìm thấy chương trình', timestamp: nowUnix });
    }

    const finalUrl = await resolveMediaPlaylist(current.link_play);

    return res.status(200).json({
      success: true,
      title: current.title,
      url: finalUrl,
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
