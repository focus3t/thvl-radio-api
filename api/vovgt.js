const fetch = require('node-fetch'); // Hoặc dùng fetch có sẵn trong Node.js

export default async function handler(req, res) {
  const { city } = req.query; // Có thể phân biệt 'hcm' hoặc 'hn'
  const masterUrl = city === 'hn' 
    ? "https://play.vovgiaothong.vn/live/gthn/playlist.m3u8" 
    : "https://play.vovgiaothong.vn/live/gthcm/playlist.m3u8";

  try {
    // 1. Fetch Master Playlist từ VOV với đầy đủ Header giả lập trình duyệt
    const masterRes = await fetch(masterUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Referer": "https://vovgiaothong.vn/",
        "Origin": "https://vovgiaothong.vn"
      },
      redirect: 'follow'
    });
    
    if (!masterRes.ok) throw new Error("Failed to fetch master playlist");
    const masterBody = await masterRes.text();

    // 2. Tìm dòng m3u8 con
    const lines = masterBody.split('\n');
    let subPlaylistPath = "";
    for (let line of lines) {
      line = line.trim();
      if (line && !line.startsWith("#") && line.includes(".m3u8")) {
        subPlaylistPath = line;
        break;
      }
    }

    if (!subPlaylistPath) throw new Error("Sub-playlist not found");

    const subUrl = subPlaylistPath.startsWith("http") 
      ? subPlaylistPath 
      : new URL(subPlaylistPath, masterUrl).toString();

    // 3. Fetch Sub Playlist để lấy danh sách các file .ts
    const subRes = await fetch(subUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://vovgiaothong.vn/"
      }
    });
    
    if (!subRes.ok) throw new Error("Failed to fetch sub-playlist");
    const subBody = await subRes.text();

    // 4. Lấy file .ts mới nhất (hoặc trả về trực tiếp nội dung sub-playlist m3u8 nếu Audio.h hỗ trợ)
    const subLines = subBody.split('\n');
    let latestTsUrl = "";
    for (let i = subLines.length - 1; i >= 0; i--) {
      let line = subLines[i].trim();
      if (line && !line.startsWith("#") && line.includes(".ts")) {
        latestTsUrl = line.startsWith("http") 
          ? line 
          : new URL(line, subUrl).toString();
        break;
      }
    }

    if (!latestTsUrl) throw new Error("No .ts chunk found");

    // Cách A: Trả về thẳng JSON chứa URL chunk mới nhất
    return res.status(200).json({ url: latestTsUrl });

    // Hoặc Cách B: Bạn cũng có thể dùng Vercel làm proxy stream trực tiếp dữ liệu âm thanh qua lại, 
    // nhưng trả về JSON URL như THVL hiện tại sẽ nhẹ server Vercel và ESP32 dễ đọc nhất.

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
