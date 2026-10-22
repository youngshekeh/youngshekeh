import {verifyPublicGoldQuote} from './public-gold-evidence.mjs';
// The intake status contract uses a flat state/quote; launch curation uses a nested broker.
export function brokerTickerView(data,now=Date.now()){
 const broker=data?.live_broker??data;
 const verified=verifyPublicGoldQuote({response:{ok:data?.ok===true},
  data:{ok:data?.ok===true,live_broker:broker}},now).verified;
 return Object.freeze({verified,quote:verified?broker.quote:null,
  state:verified?'BROKER_LIVE':data?.ok!==true?'UNAVAILABLE':broker?.state==='BROKER_LIVE'?'QUOTE_UNVERIFIED':broker?.state||'UNAVAILABLE'});
}
