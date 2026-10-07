export default async (req,res)=>{
  const ch = req.query.ch || 'gthcm';
  const r = await fetch(`https://play.vovgiaothong.vn/live/${ch}/playlist.m3u8`, {
    headers: { "Referer":"https://vovgiaothong.vn/", "User-Agent":"Mozilla/5.0" }
  });
  const txt = await r.text();
  // trả về nguyên master, ESP32 tự resolve, nhưng proxy đã có Referer nên CDN không chặn nữa
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Content-Type","application/vnd.apple.mpegurl");
  res.send(txt);
}
