import {curateGoldReference,curateBitcoinReference,curatePublicReferences,WAIT_GOVERNANCE} from '../src/public-market-reference-data.mjs';
// Independent market-reference lane; no database, Supabase read, funds, OAuth or broker operations.
const PROVIDERS=Object.freeze({
  gold:'https://api.gold-api.com/price/XAU',
  bitcoin:'https://api.coinbase.com/v2/prices/BTC-USD/spot'
});
const DEADLINE=2600;
const CACHE_MS=4000;
let cached=null,until=0,pending=null;
async function readOne(url){
  const response=await fetch(url,{method:'GET',headers:{Accept:'application/json'},
    redirect:'error',cache:'no-store',signal:AbortSignal.timeout(DEADLINE)});
  if(!response.ok)throw new Error('provider_http_error');
  const body=await response.json();
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('provider_bad_body');
  return body;
}
export async function readReferences(now=Date.now){
  const started=now();
  const [g,b]=await Promise.allSettled([readOne(PROVIDERS.gold),readOne(PROVIDERS.bitcoin)]);
  const stamp=now();
  return curatePublicReferences({
    gold:g.status==='fulfilled'?curateGoldReference(g.value,stamp):null,
    bitcoin:b.status==='fulfilled'?curateBitcoinReference(b.value,stamp):null
  },stamp);
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Market-Lane','INDEPENDENT_PUBLIC_REFERENCES');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed',governance:WAIT_GOVERNANCE});
  }
  const now=Date.now();
  // Positive cache only, bounded; never retain an unavailable quote as current.
  if(cached&&now<until){
    const g=cached.assets?.gold;
    if(!g || (Date.parse(g.source_updated_at)<=now+5000
      && now-Date.parse(g.source_updated_at)<=120000))
      return res.status(200).json(cached);
  }
  if(!pending)pending=readReferences().finally(()=>{pending=null});
  const result=await pending;
  if(result.ok){
    cached=result;until=Date.now()+CACHE_MS;
    return res.status(200).json(result);
  }
  cached=null;until=0;
  return res.status(503).json(result);
}
