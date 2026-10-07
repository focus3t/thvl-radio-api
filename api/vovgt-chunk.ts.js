export default async (req, res) => {
  const u = req.query.u;
  if (!u) return res.status(400).send("Missing u");

  try {
    const r = await fetch(u, {
      headers: {
        "Referer": "https://vovgiaothong.vn/",
        "User-Agent": "Mozilla/5.0",
        ...(req.headers.range ? { "Range": req.headers.range } : {})
      }
    });

    res.setHeader("Content-Type", r.headers.get("content-type") || "video/mp2t");
    res.setHeader("Cache-Control", "no-cache");
    if (r.headers.get("accept-ranges")) {
      res.setHeader("Accept-Ranges", r.headers.get("accept-ranges"));
    }

    // Dùng Web Streams API để stream trực tiếp từng byte về ESP32 ngay lập tức
    const reader = r.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    res.status(500).send(err.message);
  }
};
