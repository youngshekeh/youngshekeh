// V253: research alert transitions. No orders, probabilistic claims or remote messages.
export const ALERT_CLASSES=Object.freeze({
 ABOVE_HIGH:'ABOVE_PREVIOUS_Q_HIGH',UPPER:'AT_PREVIOUS_Q_HIGH_ZONE',
 BELOW_LOW:'BELOW_PREVIOUS_Q_LOW',LOWER:'AT_PREVIOUS_Q_LOW_ZONE',INSIDE:'BETWEEN_QUARTERLY_ZONES'
});
export const ALERT_COOLDOWN_MS=10*60*1000;
export function classifyQuarterAlert(zone,quote,now=Date.now()){
 if(!zone||!quote||zone?.governance?.capital_permission!=='0R'||
  zone?.governance?.live_order_submission_enabled!==false)return null;
 const current=quote.value,at=Date.parse(String(quote.at||''));
 const maxAge=zone.asset==='bitcoin'?30000:65*60*1000;
 if(typeof current!=='number'||!Number.isFinite(current)||current<=0||
 !Number.isFinite(at)||at>now+5000||now-at>maxAge)return null;
 if(zone.asset==='bitcoin'&&quote.source!=='Coinbase')return null;
 if(zone.asset!=='bitcoin'&&quote.source!=='Yahoo Finance')return null;
 const hi=zone.previous_high,lo=zone.previous_low;
 if(!Number.isFinite(hi)||!Number.isFinite(lo)||lo<=0||hi<=lo)return null;
 const width=(hi-lo)*.02,upper=hi-width,lower=lo+width;
 const status=current>hi?ALERT_CLASSES.ABOVE_HIGH:
   current>=upper?ALERT_CLASSES.UPPER:current<lo?ALERT_CLASSES.BELOW_LOW:
   current<=lower?ALERT_CLASSES.LOWER:ALERT_CLASSES.INSIDE;
 return Object.freeze({
  asset:zone.asset,asset_label:zone.label,state:status,
  price:current,market_observed_at:quote.at,level:status===ALERT_CLASSES.ABOVE_HIGH||
   status===ALERT_CLASSES.UPPER?hi:status===ALERT_CLASSES.BELOW_LOW||
   status===ALERT_CLASSES.LOWER?lo:null,
  quarter:zone.previous_quarter,
  interpretation:status===ALERT_CLASSES.INSIDE?'PRICE BETWEEN QUARTERLY PROXY ZONES':
    'MECHANICAL RANGE INTERACTION · NOT A VERIFIED LIQUIDITY SWEEP',
  trade_permission:'WAIT',capital_permission:'0R',
  not_execution_signal:true,not_institutional_orderbook:true
 });
}
export function acceptQuarterAlert(state,classification,now=Date.now()){
 const old=state instanceof Map?state:new Map();
 if(!classification)return {state:old,event:null};
 const next=new Map(old),key=classification.asset,last=next.get(key);
 // Never repeat a state without a transition, even after the cooldown.
 if(last?.state===classification.state)return {state:next,event:null};
 const event=classification.state===ALERT_CLASSES.INSIDE?null:classification;
 if(event&&last?.lastEvent===classification.state&&now-last?.eventAt<ALERT_COOLDOWN_MS)
  return {state:next,event:null};
 next.set(key,{state:classification.state,lastEvent:event?.state||last?.lastEvent||null,
   eventAt:event?now:last?.eventAt||0});
 return {state:next,event};
}
