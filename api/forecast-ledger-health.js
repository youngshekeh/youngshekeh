import {curateLedger,unavailableLedger} from '../src/forecast-ledger-health.mjs';
const SOURCE='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-track-record';
export async function readLedger({fetcher=fetch,clock=Date.now}={}){
 try{
  const r=await fetcher(SOURCE,{headers:{Accept:'application/json','Cache-Control':'no-cache'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(4000)});
  if(!r.ok)return unavailableLedger('PUBLIC_LEDGER_HTTP_ERROR');
  const body=await r.json();return curateLedger(body,clock());
 }catch{return unavailableLedger('PUBLIC_LEDGER_UNAVAILABLE');}
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json(unavailableLedger('METHOD_NOT_ALLOWED'));}
 return res.status(200).json(await readLedger());
}
