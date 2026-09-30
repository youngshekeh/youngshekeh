const TARGET='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v76-data-quality';

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }
  try{
    const incoming=new URL(req.url,'https://thefatheranalytics.com');
    const target=new URL(TARGET);
    target.search=incoming.search;
    const upstream=await fetch(target,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-PUBLIC-SHELL/115.0'},
      cache:'no-store',
      signal:AbortSignal.timeout(15000)
    });
    const body=await upstream.json().catch(()=>null);
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-TFA-Runtime','PRIVATE_BRAIN');
    return res.status(upstream.ok?200:503).json(body??{ok:false,error:'private_runtime_unavailable'});
  }catch{
    res.setHeader('Cache-Control','no-store');
    return res.status(503).json({ok:false,error:'private_runtime_unavailable'});
  }
}
