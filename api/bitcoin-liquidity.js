import {curateBook,unavailableBook,currentBook} from '../src/bitcoin-liquidity-core.mjs';
const URL='https://api.exchange.coinbase.com/products/BTC-USD/book?level=2';
const MAX_BYTES=2000000;
export async function readLiquidity({fetcher=fetch,clock=Date.now}={}){
 try{
  const r=await fetcher(URL,{headers:{Accept:'application/json','Cache-Control':'no-cache'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(3500)});
  if(!r.ok)return unavailableBook('PROVIDER_HTTP_ERROR');
  if(Number(r.headers?.get('content-length'))>MAX_BYTES)return unavailableBook('PAYLOAD_TOO_LARGE');
  const reader=r.body?.getReader();if(!reader)return unavailableBook('INVALID_BODY');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();return unavailableBook('PAYLOAD_TOO_LARGE');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return unavailableBook('INVALID_JSON');}
  return curateBook(body,clock());
 }catch{return unavailableBook('PROVIDER_UNAVAILABLE');}
}
let cached=null,until=0,pending=null;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json(unavailableBook('METHOD_NOT_ALLOWED'));}
 const now=Date.now();
 if(cached&&now<until&&(cached.status==='UNAVAILABLE'||currentBook(cached,now)))return res.status(200).json(cached);
 if(!pending)pending=readLiquidity().finally(()=>{pending=null});
 cached=await pending;until=Date.now()+5000;
 return res.status(200).json(cached);
}
