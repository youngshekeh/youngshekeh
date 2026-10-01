export function paperQuoteView(data,now=Date.now()) {
  const withheld={state:data?.ok===true?(data.state==='NOT_CONNECTED'?'NOT_CONNECTED':'PAPER_QUOTE_STALE'):'UNAVAILABLE',bid:null,ask:null,spread:null};
  const q=data?.latest_quote;
  if(data?.ok!==true||data?.state!=='PAPER_QUOTE_FRESH_UNVERIFIED'||q?.mode!=='PAPER_DEMO'||q?.provenance!=='BROKER_DEMO_USER_SUPPLIED'
    ||data?.governance?.capital_permission!=='0R'||data?.governance?.live_order_submission_enabled!==false
    ||data?.broker_connection_verified!==false||!Number.isFinite(now))return withheld;
  const observed=Date.parse(q.observed_at),received=Date.parse(q.received_at),expires=Date.parse(q.expires_at);
  if(![observed,received,expires].every(Number.isFinite)||observed>now||received>now||now-observed>=10000||now-received>=10000
    ||expires>Math.min(observed,received)+10000||expires<=now||typeof q.bid!=='number'||typeof q.ask!=='number'
    ||!Number.isFinite(q.bid)||!Number.isFinite(q.ask)||q.bid<=0||q.ask<=q.bid||q.ask-q.bid>q.bid*.02)return withheld;
  return {state:'PAPER_QUOTE_FRESH_UNVERIFIED',bid:q.bid,ask:q.ask,spread:q.ask-q.bid};
}
