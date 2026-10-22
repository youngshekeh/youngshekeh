import './public-market-reference.css';
const ROOT=document.getElementById('public-market-reference');
if(ROOT){
 const select=id=>document.getElementById(id);
 const gold=select('pmr-gold'),btc=select('pmr-btc'),status=select('pmr-status');
 const updated=select('pmr-updated'),goldInfo=select('pmr-gold-info'),btcInfo=select('pmr-btc-info');
 const format=(n,digits=2)=>typeof n==='number'&&Number.isFinite(n)&&n>0
  ?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:digits,minimumFractionDigits:2}).format(n)
  :'Unavailable';
 let pending=false,lastOk=0;
 function unavailable(message){
  gold.textContent='Unavailable';btc.textContent='Unavailable';
  goldInfo.textContent='No current attributed spot observation';
  btcInfo.textContent='No current price response';
  status.textContent='FEEDS NOT VERIFIED';status.dataset.state='unavailable';
  updated.textContent=message;
 }
 async function refresh(){
  if(pending||document.hidden)return;
  pending=true;
  try{
   const response=await fetch('/api/public-market-reference',{headers:{Accept:'application/json'},
     cache:'no-store',signal:AbortSignal.timeout(7500)});
   if(!response.ok)throw new Error('source_unavailable');
   const data=await response.json();
   if(data?.ok!==true||data?.reference_only!==true||data?.governance?.capital_permission!=='0R')
     throw new Error('unverified_payload');
   const g=data.assets?.gold,b=data.assets?.bitcoin;
   const now=Date.now(),goldTime=Date.parse(String(g?.source_updated_at||''));
   const freshGold=g?.type==='INDICATIVE_SPOT'&&g?.symbol==='XAUUSD'&&g?.broker_verified===false
     &&Number.isFinite(goldTime)&&goldTime<=now+5000&&now-goldTime<=120000
     &&typeof g.price==='number'&&g.price>0;
   const time=Date.parse(String(b?.observed_at||''));
   const freshBtc=b?.type==='SPOT_RECEIPT_NOT_SOURCE_TIMESTAMPED'&&b?.symbol==='BTCUSD'
     &&Number.isFinite(time)&&time<=now+5000&&now-time<=30000
     &&typeof b.price==='number'&&b.price>0;
   gold.textContent=freshGold?format(g.price):'Unavailable';
   btc.textContent=freshBtc?format(b.price):'Unavailable';
   goldInfo.textContent=freshGold?'Indicative USD / troy oz · Gold API · '+new Date(goldTime).toLocaleTimeString():'Spot source not fresh';
   btcInfo.textContent=freshBtc?'Coinbase spot · received '+new Date(time).toLocaleTimeString()+' · source time not supplied':'No current Coinbase response';
   const count=Number(freshGold)+Number(freshBtc);
   status.textContent=count===2?'2 SOURCES RESPONDING':count===1?'PARTIAL SOURCES':'NO FRESH REFERENCE';
   status.dataset.state=count===2?'online':count===1?'partial':'unavailable';
   updated.textContent='Checked '+new Date().toLocaleTimeString()+' · Independent public feeds';
   lastOk=now;
  }catch{unavailable('Provider unavailable · retrying automatically. No stale price shown.');}
  finally{pending=false;}
 }
 void refresh();
 const timer=window.setInterval(()=>{if(!document.hidden)void refresh()},15000);
 const wake=()=>{if(!document.hidden&&Date.now()-lastOk>4000)void refresh()};
 document.addEventListener('visibilitychange',wake);
 window.addEventListener('pagehide',()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',wake)},{once:true});
}
