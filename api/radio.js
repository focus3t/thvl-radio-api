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
      return res.status(502).json({
        success: false,
        error: `THVL API returned ${response.status}`,
      });
    }

    const json = await response.json();
    const items = json?.data?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(502).json({
        success: false,
        error: 'THVL không trả về danh sách chương trình',
      });
    }

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

    return res.status(200).json({
      success: true,
      title: current.title,
      url: current.link_play,
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
