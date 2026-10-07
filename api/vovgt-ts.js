export default async function handler(req, res) {
  const tsUrl = req.query.u;
  if (!tsUrl) return res.status(400).send("missing u");

  const r = await fetch(tsUrl, {
    headers: {
      "Referer": "https://vovgiaothong.vn/",
      "Origin": "https://vovgiaothong.vn",
      "User-Agent": "Mozilla/5.0"
    }
  });
  const buf = Buffer.from(await r.arrayBuffer());
  
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "video/mp2t");
  res.setHeader("Cache-Control", "no-cache");
  res.send(buf);
}
