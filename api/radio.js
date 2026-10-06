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
    // Việt Nam = UTC+7
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const date = vn.toISOString().slice(0, 10);

    const url =
      `${THVL_API}/${THVL_ID}/?play-date=${date}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'THVL-Radio-ESP32/1.0',
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

    const hlsUrl =
      json?.data?.play_info?.data?.hls_link_play ||
      json?.data?.link_play;

    if (!hlsUrl) {
      return res.status(502).json({
        success: false,
        error: 'THVL API không trả về HLS URL',
      });
    }

    return res.status(200).json({
      success: true,
      url: hlsUrl,
      date,
      expires: json?.data?.gen_time ?? null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}