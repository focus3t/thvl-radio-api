export default async (req,res)=>{
  const u=req.query.u; 
  const r=await fetch(u,{headers:{Referer:"https://vovgiaothong.vn/", "User-Agent":"Mozilla/5.0"}});
  res.setHeader("Content-Type","video/mp2t");
  res.setHeader("Cache-Control","no-cache");
  res.send(Buffer.from(await r.arrayBuffer()));
}
