export default async (req,res)=>{
  const ch = req.query.ch || 'gthcm';
  const master = `https://play.vovgiaothong.vn/live/${ch}/playlist.m3u8`;
  const r = await fetch(master, {headers:{Referer:"https://vovgiaothong.vn/", "User-Agent":"Mozilla/5.0"}});
  const txt = await r.text();
  let chunklistUrl="";
  for(const l of txt.split("\n")){ if(l.trim()&&!l.trim().startsWith("#")&&l.includes(".m3u8")) chunklistUrl=l.trim(); }
  if(!chunklistUrl.startsWith("http")) chunklistUrl = master.slice(0,master.lastIndexOf('/')+1)+chunklistUrl;
  const r2 = await fetch(chunklistUrl, {headers:{Referer:"https://vovgiaothong.vn/", "User-Agent":"Mozilla/5.0"}});
  let pl = await r2.text();
  const base = chunklistUrl.slice(0, chunklistUrl.lastIndexOf('/')+1);
  pl = pl.split("\n").map(line=>{
    const l=line.trim();
    if(l&&!l.startsWith("#")){
      let u=l.startsWith("http")?l:base+l;
      return `/api/vovgt-chunk.ts?u=${encodeURIComponent(u)}`;
    }
    return line;
  }).join("\n");
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Content-Type","application/vnd.apple.mpegurl");
  res.send(pl);
}
