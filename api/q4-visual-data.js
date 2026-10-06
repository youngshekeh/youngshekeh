const ORIGIN='https://thefatheranalytics.com';
const SOURCES={
  day:'/api/gold-day-state',
  zones:'/api/gold-mtf-zones',
  liquidity:'/api/gold-liquidity-state-machine'
};

async function read(path){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(ORIGIN+path,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-Q4-VISUAL/1.0'},
      cache:'no-store',
      signal:controller.signal,
      redirect:'error'
    });
    const body=await response.json().catch(()=>null);
    return response.ok && body && typeof body==='object' && !Array.isArray(body)
      ? body
      : {ok:false,state:'UNAVAILABLE',status:response.status};
  }catch{
    return {ok:false,state:'UNAVAILABLE',error:'q4_source_unavailable'};
  }finally{
    clearTimeout(timer);
  }
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Q4-Visual','READ_ONLY_AGGREGATE');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }
  const [day,zones,liquidity]=await Promise.all([
    read(SOURCES.day),
    read(SOURCES.zones),
    read(SOURCES.liquidity)
  ]);
  const usable=[day,zones,liquidity].filter(x=>x?.ok===true).length;
  return res.status(usable?200:503).json({
    ok:usable>0,
    version:'q4-visual-bundle-v1',
    generated_at:new Date().toISOString(),
    truth_label:'READ_ONLY_PRODUCTION_RESEARCH_AGGREGATE',
    usable_sources:usable,
    day,
    zones,
    liquidity,
    governance:{
      action_permitted:'WAIT',
      capital_permission:'0R',
      automatic_execution:false,
      note:'This route aggregates existing research-only public outputs for Q4 visualization. It cannot promote trading permission.'
    }
  });
}
