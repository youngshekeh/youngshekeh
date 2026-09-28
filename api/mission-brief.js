const BASE='https://thefatheranalytics.com';
const SUPABASE_URL='https://mpcelmjiycjpdyyflisn.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
const LEGACY_ANON_JWT='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wY2VsbWppeWNqcGR5eWZsaXNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MjIzNDUsImV4cCI6MjEwNDI5ODM0NX0.6uYPhuQRuG7MKqbUe-Ndq5e6scRFDW9qCfzAF4wLAMk';
const MARKET_ASSETS=[
  {id:'gold',name:'Gold',symbol:'GC=F',kind:'futures',precision:1},
  {id:'dxy',name:'U.S. Dollar Index',symbol:'DX-Y.NYB',kind:'index',precision:3},
  {id:'spx',name:'S&P 500',symbol:'^GSPC',kind:'cash_index',precision:2},
  {id:'btc',name:'Bitcoin',symbol:'BTC-USD',kind:'crypto',precision:0},
  {id:'eurusd',name:'EUR/USD',symbol:'EURUSD=X',kind:'fx',precision:4},
  {id:'us10y',name:'U.S. 10Y Yield',symbol:'^TNX',kind:'cash_yield',precision:3},
  {id:'oil',name:'WTI Crude',symbol:'CL=F',kind:'futures',precision:2}
];
function num(v){const x=Number(v);return Number.isFinite(x)?x:null}
function marketDirection(change){
  if(change===null)return 'UNAVAILABLE';
  if(change>=0.15)return 'UP';
  if(change<=-0.15)return 'DOWN';
  return 'FLAT';
}
function marketFreshness(kind,ts){
  if(!ts)return {state:'UNAVAILABLE',age_minutes:null};
  const age=Math.max(0,(Date.now()/1000-ts)/60);
  let state='FRESH';
  if(String(kind).startsWith('cash_')) state=age<=45?'FRESH':'MARKET_CLOSED_OR_STALE';
  else if(kind==='crypto') state=age<=20?'FRESH':age<=60?'DELAYED':'STALE';
  else state=age<=30?'FRESH':age<=120?'DELAYED':'STALE';
  return {state,age_minutes:Number(age.toFixed(1))};
}
async function marketQuote(asset){
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.symbol)}?interval=5m&range=1d&includePrePost=true`;
  try{
    const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/88.0'},cache:'no-store',signal:AbortSignal.timeout(8000)});
    const j=await r.json().catch(()=>null); const m=j?.chart?.result?.[0]?.meta;
    if(!r.ok||!m)return {id:asset.id,name:asset.name,symbol:asset.symbol,ok:false,freshness:'UNAVAILABLE'};
    const price=num(m.regularMarketPrice??m.fulldayPrice),prev=num(m.previousClose??m.chartPreviousClose);
    const pct=num(m.regularMarketChangePercent??m.fulldayChangePercent)??(price!==null&&prev?((price-prev)/prev*100):null);
    const ts=num(m.regularMarketTime),fresh=marketFreshness(asset.kind,ts);
    return {id:asset.id,name:asset.name,symbol:asset.symbol,kind:asset.kind,ok:true,
      price:price===null?null:Number(price.toFixed(asset.precision)),
      change_pct:pct===null?null:Number(pct.toFixed(3)),direction:marketDirection(pct),
      observed_at:ts?new Date(ts*1000).toISOString():null,freshness:fresh.state,age_minutes:fresh.age_minutes,
      source:'Yahoo Finance chart endpoint'};
  }catch{return {id:asset.id,name:asset.name,symbol:asset.symbol,ok:false,freshness:'UNAVAILABLE'}}
}
async function worldBankLatest(country,indicator,label){
  const url=`https://api.worldbank.org/v2/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(indicator)}?format=json&mrnev=1&per_page=1`;
  try{
    const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/90.0'},cache:'no-store',signal:AbortSignal.timeout(8000)});
    const j=await r.json().catch(()=>null); const meta=Array.isArray(j)?j?.[0]:null; const row=Array.isArray(j?.[1])?j[1][0]:null;
    if(!r.ok||!row)return {ok:false,label,country,indicator,state:'UNAVAILABLE',source:'World Bank API'};
    return {ok:true,label,country:row?.country?.value??country,indicator,period:String(row?.date??''),value:num(row?.value),
      source:'World Bank API',source_last_updated:meta?.lastupdated??null,frequency:'ANNUAL_STRUCTURAL'};
  }catch{return {ok:false,label,country,indicator,state:'UNAVAILABLE',source:'World Bank API'}}
}
function arxivStamp(d){
  const p=n=>String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}
async function arxivActivity(category,label,days=7){
  const end=new Date();
  const start=new Date(end.getTime()-days*86400000);
  const query=`cat:${category} AND submittedDate:[${arxivStamp(start)} TO ${arxivStamp(end)}]`;
  const url=`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&start=0&max_results=1`;
  try{
    const r=await fetch(url,{headers:{Accept:'application/atom+xml','User-Agent':'THE-FATHER-ANALYTICS/91.0'},cache:'no-store',signal:AbortSignal.timeout(9000)});
    const xml=await r.text();
    const match=xml.match(/<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/i);
    if(!r.ok||!match)return {ok:false,label,category,state:'UNAVAILABLE',source:'arXiv API'};
    return {ok:true,label,category,count:Number(match[1]),window_days:days,window_start:start.toISOString(),window_end:end.toISOString(),
      source:'arXiv API',truth_label:'ACTIVITY_COUNT_NOT_MOMENTUM'};
  }catch{return {ok:false,label,category,state:'UNAVAILABLE',source:'arXiv API'}}
}
async function cryptoGlobal(){
  try{
    const r=await fetch('https://api.coingecko.com/api/v3/global',{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/91.0'},cache:'no-store',signal:AbortSignal.timeout(9000)});
    const j=await r.json().catch(()=>null); const d=j?.data;
    if(!r.ok||!d)return {ok:false,state:'UNAVAILABLE',source:'CoinGecko Global API'};
    const change=num(d.market_cap_change_percentage_24h_usd);
    return {ok:true,total_market_cap_usd:num(d.total_market_cap?.usd),total_volume_usd:num(d.total_volume?.usd),
      market_cap_change_24h_pct:change,volume_change_24h_pct:num(d.volume_change_percentage_24h_usd),
      btc_dominance_pct:num(d.market_cap_percentage?.btc),eth_dominance_pct:num(d.market_cap_percentage?.eth),
      active_cryptocurrencies:num(d.active_cryptocurrencies),markets:num(d.markets),
      observed_at:d.updated_at?new Date(Number(d.updated_at)*1000).toISOString():null,
      state:change===null?'WITHHELD':change<=-3?'RISK_OFF_24H':change>=3?'EXPANSION_24H':'MIXED_24H',
      source:'CoinGecko Global API',truth_label:'CURRENT_MARKET_BREADTH'};
  }catch{return {ok:false,state:'UNAVAILABLE',source:'CoinGecko Global API'}}
}
function quantile(values,q){
  if(!values.length)return null;
  const x=[...values].sort((a,b)=>a-b);
  const pos=(x.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos);
  return lo===hi?x[lo]:x[lo]+(x[hi]-x[lo])*(pos-lo);
}
function seasonalStats(values,current){
  const clean=values.filter(Number.isFinite);
  if(!clean.length)return {sample_size:0,state:'WITHHELD'};
  const positive=clean.filter(v=>v>0).length;
  const positiveRate=Number((positive/clean.length*100).toFixed(1));
  const median=quantile(clean,.5),q25=quantile(clean,.25),q75=quantile(clean,.75);
  const percentile=Number.isFinite(current)?Number((clean.filter(v=>v<=current).length/clean.length*100).toFixed(1)):null;
  const state=positiveRate>=65&&median>0?'HISTORICALLY_POSITIVE':
    positiveRate<=35&&median<0?'HISTORICALLY_NEGATIVE':'HISTORICALLY_MIXED';
  return {sample_size:clean.length,positive_rate_pct:positiveRate,average_return_pct:Number((clean.reduce((a,b)=>a+b,0)/clean.length).toFixed(2)),
    median_return_pct:Number(median.toFixed(2)),q25_return_pct:Number(q25.toFixed(2)),q75_return_pct:Number(q75.toFixed(2)),
    best_return_pct:Number(Math.max(...clean).toFixed(2)),worst_return_pct:Number(Math.min(...clean).toFixed(2)),
    current_return_pct:Number.isFinite(current)?Number(current.toFixed(2)):null,current_percentile:percentile,state};
}
async function goldSeasonality(){
  const url='https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=10y&includePrePost=false';
  try{
    const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/95.0'},cache:'no-store',signal:AbortSignal.timeout(10000)});
    const j=await r.json().catch(()=>null),x=j?.chart?.result?.[0],ts=x?.timestamp||[],q=x?.indicators?.quote?.[0]||{};
    if(!r.ok||!ts.length)return {ok:false,state:'UNAVAILABLE',source:'Yahoo Finance GC=F daily history'};
    const rows=[];
    for(let i=0;i<ts.length;i++){
      const close=num(q.close?.[i]); if(close===null||close<=0)continue;
      const d=new Date(ts[i]*1000);
      rows.push({ts:ts[i],date:d.toISOString().slice(0,10),year:d.getUTCFullYear(),month:d.getUTCMonth()+1,
        quarter:Math.floor(d.getUTCMonth()/3)+1,close});
    }
    rows.sort((a,b)=>a.ts-b.ts);
    if(rows.length<500)return {ok:false,state:'INSUFFICIENT_HISTORY',source:'Yahoo Finance GC=F daily history'};

    const monthEnds=new Map(),quarterEnds=new Map();
    for(const row of rows){
      monthEnds.set(`${row.year}-${String(row.month).padStart(2,'0')}`,row);
      quarterEnds.set(`${row.year}-Q${row.quarter}`,row);
    }
    const monthly=[...monthEnds.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    const monthlyReturns=[];
    for(let i=1;i<monthly.length;i++){
      const [key,row]=monthly[i],prev=monthly[i-1][1];
      monthlyReturns.push({key,year:row.year,month:row.month,return_pct:(row.close/prev.close-1)*100,close:row.close,date:row.date});
    }
    const quarterly=[...quarterEnds.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    const quarterlyReturns=[];
    for(let i=1;i<quarterly.length;i++){
      const [key,row]=quarterly[i],prev=quarterly[i-1][1];
      quarterlyReturns.push({key,year:row.year,quarter:row.quarter,return_pct:(row.close/prev.close-1)*100,close:row.close,date:row.date});
    }

    const latest=rows.at(-1),currentMonthKey=`${latest.year}-${String(latest.month).padStart(2,'0')}`,currentQuarterKey=`${latest.year}-Q${latest.quarter}`;
    const currentMonth=monthlyReturns.find(x=>x.key===currentMonthKey);
    const currentQuarter=quarterlyReturns.find(x=>x.key===currentQuarterKey);
    const histMonth=monthlyReturns.filter(x=>x.month===latest.month&&x.key!==currentMonthKey).slice(-10);
    const histQuarter=quarterlyReturns.filter(x=>x.quarter===latest.quarter&&x.key!==currentQuarterKey).slice(-10);
    const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];

    return {ok:true,as_of:latest.date,symbol:'GC=F',history_years:10,
      month:{label:monthNames[latest.month-1],number:latest.month,...seasonalStats(histMonth.map(x=>x.return_pct),currentMonth?.return_pct),
        historical:[...histMonth].map(x=>({year:x.year,return_pct:Number(x.return_pct.toFixed(2))}))},
      quarter:{label:`Q${latest.quarter}`,number:latest.quarter,...seasonalStats(histQuarter.map(x=>x.return_pct),currentQuarter?.return_pct),
        historical:[...histQuarter].map(x=>({year:x.year,return_pct:Number(x.return_pct.toFixed(2))}))},
      source:'Yahoo Finance GC=F continuous futures daily history',
      truth_label:'HISTORICAL_CONTINUOUS_FUTURES_SEASONALITY_NOT_FORECAST',
      note:'Continuous futures can contain contract-roll effects. Historical calendar distributions are context, not a directional forecast or probability of the next move.'};
  }catch{return {ok:false,state:'UNAVAILABLE',source:'Yahoo Finance GC=F daily history'}}
}
async function cboeVolIndex(symbol,label){
  const url=`https://cdn.cboe.com/api/global/us_indices/daily_prices/${symbol}_History.csv`;
  try{
    const r=await fetch(url,{headers:{Accept:'text/csv','User-Agent':'THE-FATHER-ANALYTICS/94.0'},cache:'no-store',signal:AbortSignal.timeout(10000)});
    const text=await r.text();
    if(!r.ok||!text)return {ok:false,symbol,label,state:'UNAVAILABLE',source:'Cboe'};
    const lines=text.trim().split(/\r?\n/);
    const headers=lines.shift().split(',').map(x=>x.trim().toUpperCase());
    const dateIdx=headers.indexOf('DATE');
    const valueIdx=headers.indexOf('CLOSE')>=0?headers.indexOf('CLOSE'):headers.indexOf(symbol.toUpperCase());
    if(dateIdx<0||valueIdx<0)return {ok:false,symbol,label,state:'SCHEMA_UNAVAILABLE',source:'Cboe'};
    const rows=lines.map(line=>{
      const parts=line.split(',');
      const value=num(parts[valueIdx]);
      const rawDate=String(parts[dateIdx]||'').trim();
      if(!rawDate||value===null)return null;
      const m=rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const date=m?`${m[3]}-${m[1]}-${m[2]}`:rawDate;
      return {date,value};
    }).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
    if(!rows.length)return {ok:false,symbol,label,state:'UNAVAILABLE',source:'Cboe'};
    const latest=rows.at(-1),prior=rows.at(-2)??null,prior5=rows.at(-6)??null;
    const trailing=rows.slice(-252).map(x=>x.value);
    const pct=trailing.length?Number((trailing.filter(v=>v<=latest.value).length/trailing.length*100).toFixed(1)):null;
    const change=(a,b)=>a!==null&&a!==undefined&&b?Number(((a/b)-1)*100).toFixed?.(2):null;
    const change1=prior?Number((((latest.value/prior.value)-1)*100).toFixed(2)):null;
    const change5=prior5?Number((((latest.value/prior5.value)-1)*100).toFixed(2)):null;
    const regime=pct===null?'WITHHELD':pct>=90?'EXTREME':pct>=75?'ELEVATED':pct<=25?'SUPPRESSED':'NORMAL';
    return {ok:true,symbol,label,date:latest.date,value:latest.value,prior_value:prior?.value??null,
      change_1d_pct:change1,change_5d_pct:change5,trailing_252_percentile:pct,regime,
      sample_size:trailing.length,source:'Cboe Global Indices - official historical daily prices',
      truth_label:'OPTIONS_DERIVED_VOLATILITY_INDEX_DAILY_CLOSE'};
  }catch{return {ok:false,symbol,label,state:'UNAVAILABLE',source:'Cboe'}}
}
async function treasuryCurve10Y(kind){
  const year=new Date().getUTCFullYear();
  const real=kind==='real';
  const data=real?'daily_treasury_real_yield_curve':'daily_treasury_yield_curve';
  const valueTag=real?'TC_10YEAR':'BC_10YEAR';
  const label=real?'10Y real yield':'10Y nominal Treasury';
  const url=`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=${data}&field_tdr_date_value=${year}`;
  try{
    const r=await fetch(url,{headers:{Accept:'application/xml,text/xml;q=0.9,*/*;q=0.1','User-Agent':'THE-FATHER-ANALYTICS/93.1'},cache:'no-store',signal:AbortSignal.timeout(10000)});
    const xml=await r.text();
    if(!r.ok||!xml)return {ok:false,series:valueTag,label,state:'UNAVAILABLE',source:'U.S. Treasury'};
    const blocks=[...xml.matchAll(/<m:properties>([\s\S]*?)<\/m:properties>/gi)].map(m=>m[1]);
    const rows=[];
    for(const block of blocks){
      const dm=block.match(/<d:NEW_DATE[^>]*>([^<]+)<\/d:NEW_DATE>/i);
      const vm=block.match(new RegExp('<d:'+valueTag+'[^>]*>([^<]+)<\\/d:'+valueTag+'>','i'));
      if(!dm||!vm)continue;
      const value=num(vm[1]);
      if(value===null)continue;
      rows.push({date:String(dm[1]).slice(0,10),value});
    }
    rows.sort((a,b)=>a.date.localeCompare(b.date));
    if(!rows.length)return {ok:false,series:valueTag,label,state:'UNAVAILABLE',source:'U.S. Treasury'};
    const latest=rows.at(-1),prior=rows.at(-2)??null;
    return {ok:true,series:valueTag,label,date:latest.date,value:latest.value,
      prior_date:prior?.date??null,prior_value:prior?.value??null,
      change_bps:prior?Number(((latest.value-prior.value)*100).toFixed(1)):null,
      observations:rows.slice(-20),source:'U.S. Treasury Daily Treasury Yield Curve',
      truth_label:real?'OFFICIAL_TREASURY_REAL_YIELD_CURVE':'OFFICIAL_TREASURY_NOMINAL_YIELD_CURVE'};
  }catch{return {ok:false,series:valueTag,label,state:'UNAVAILABLE',source:'U.S. Treasury'}}
}
function canonicalTreasuryTerm(row){
  const term=String(row?.security_term||'');
  const type=String(row?.security_type||'');
  if(type!=='Note'&&type!=='Bond')return null;
  if(term==='2-Year'||term.startsWith('1-Year '))return '2Y';
  if(term==='3-Year')return '3Y';
  if(term==='5-Year')return '5Y';
  if(term==='7-Year')return '7Y';
  if(term.startsWith('9-Year'))return '10Y';
  if(term.startsWith('19-Year'))return '20Y';
  if(term.startsWith('29-Year'))return '30Y';
  return term||null;
}
function auctionShares(row){
  const total=num(row?.total_accepted);
  const pct=v=>total&&num(v)!==null?Number((num(v)/total*100).toFixed(2)):null;
  return {indirect_pct:pct(row?.indirect_bidder_accepted),direct_pct:pct(row?.direct_bidder_accepted),dealer_pct:pct(row?.primary_dealer_accepted)};
}
function compareAuction(latest,prior){
  const btc=num(latest?.bid_to_cover_ratio),pbtc=num(prior?.bid_to_cover_ratio);
  const ls=auctionShares(latest),ps=auctionShares(prior);
  const btcChange=btc!==null&&pbtc!==null?Number((btc-pbtc).toFixed(2)):null;
  const indirectChange=ls.indirect_pct!==null&&ps.indirect_pct!==null?Number((ls.indirect_pct-ps.indirect_pct).toFixed(2)):null;
  const dealerChange=ls.dealer_pct!==null&&ps.dealer_pct!==null?Number((ls.dealer_pct-ps.dealer_pct).toFixed(2)):null;
  let state='MIXED_OR_STABLE';
  if((btcChange!==null&&btcChange<=-0.07&&indirectChange!==null&&indirectChange<=-2)||
     (btcChange!==null&&btcChange<0&&dealerChange!==null&&dealerChange>=3)) state='DEMAND_SOFTENED';
  else if((btcChange!==null&&btcChange>=0.07&&indirectChange!==null&&indirectChange>=2)||
          (btcChange!==null&&btcChange>0&&dealerChange!==null&&dealerChange<=-3)) state='DEMAND_FIRMED';
  return {state,bid_to_cover:btc,prior_bid_to_cover:pbtc,bid_to_cover_change:btcChange,
    indirect_share_pct:ls.indirect_pct,indirect_share_change_pp:indirectChange,
    direct_share_pct:ls.direct_pct,dealer_share_pct:ls.dealer_pct,dealer_share_change_pp:dealerChange};
}
async function treasuryFundingPulse(){
  const fields='auction_date,security_type,security_term,bid_to_cover_ratio,high_yield,indirect_bidder_accepted,direct_bidder_accepted,primary_dealer_accepted,total_accepted,offering_amt';
  const url='https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query?fields='+encodeURIComponent(fields)+'&sort=-auction_date&page%5Bsize%5D=100';
  try{
    const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/93.0'},cache:'no-store',signal:AbortSignal.timeout(10000)});
    const j=await r.json().catch(()=>null);
    const rows=Array.isArray(j?.data)?j.data.filter(x=>num(x?.bid_to_cover_ratio)!==null):[];
    const coupons=rows.filter(x=>canonicalTreasuryTerm(x));
    if(!r.ok||!coupons.length)return {ok:false,state:'UNAVAILABLE',source:'U.S. Treasury Fiscal Data'};
    const buckets=new Map();
    for(const row of coupons){
      const key=canonicalTreasuryTerm(row);
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(row);
    }
    const comparisons=[];
    for(const [term,list] of buckets.entries()){
      if(list.length<2)continue;
      const latest=list[0],prior=list[1],cmp=compareAuction(latest,prior);
      comparisons.push({
        term,auction_date:latest.auction_date,prior_auction_date:prior.auction_date,
        security_type:latest.security_type,security_term:latest.security_term,
        high_yield:num(latest.high_yield),offering_amt:num(latest.offering_amt),
        total_accepted:num(latest.total_accepted),...cmp
      });
    }
    comparisons.sort((a,b)=>String(b.auction_date).localeCompare(String(a.auction_date)));
    const latest=comparisons[0]??null;
    const sample=comparisons.slice(0,7);
    const soft=sample.filter(x=>x.state==='DEMAND_SOFTENED').length;
    const firm=sample.filter(x=>x.state==='DEMAND_FIRMED').length;
    const mixed=sample.length-soft-firm;
    const broadState=soft>=3&&soft>firm?'BROAD_DEMAND_SOFTENING':
      firm>=3&&firm>soft?'BROAD_DEMAND_FIRMING':'MIXED_AUCTION_DEMAND';
    return {ok:true,latest,comparisons:sample,summary:{state:broadState,softened:soft,firmed:firm,mixed,sample_size:sample.length},
      source:'U.S. Treasury Fiscal Data - Auctions Query',
      truth_label:'OFFICIAL_AUCTION_RESULTS_RELATIVE_DEMAND_NOT_SYSTEMIC_STRESS',
      note:'Auction demand is compared with the prior auction of the same maturity bucket. A softer auction is not by itself evidence of systemic funding stress.'};
  }catch{return {ok:false,state:'UNAVAILABLE',source:'U.S. Treasury Fiscal Data'}}
}
async function cftcGoldPositioning(){
  const select=[
    'report_date_as_yyyy_mm_dd','market_and_exchange_names','open_interest_all','change_in_open_interest_all',
    'prod_merc_positions_long','prod_merc_positions_short','change_in_prod_merc_long','change_in_prod_merc_short',
    'swap_positions_long_all','swap__positions_short_all','change_in_swap_long_all','change_in_swap_short_all',
    'm_money_positions_long_all','m_money_positions_short_all','change_in_m_money_long_all','change_in_m_money_short_all',
    'other_rept_positions_long','other_rept_positions_short','change_in_other_rept_long','change_in_other_rept_short'
  ].join(',');
  const url='https://publicreporting.cftc.gov/resource/72hh-3qpy.json?$select='+encodeURIComponent(select)
    +'&$where='+encodeURIComponent("cftc_contract_market_code='088691'")
    +'&$order='+encodeURIComponent('report_date_as_yyyy_mm_dd DESC')
    +'&$limit=3';
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
  const group=(name,row,longKey,shortKey,chgLongKey,chgShortKey,oi)=>{
    const long=n(row?.[longKey]),short=n(row?.[shortKey]),chgLong=n(row?.[chgLongKey]),chgShort=n(row?.[chgShortKey]);
    const net=long!==null&&short!==null?long-short:null;
    const weeklyNetChange=chgLong!==null&&chgShort!==null?chgLong-chgShort:null;
    return {name,long,short,net,weekly_net_change:weeklyNetChange,net_pct_open_interest:net!==null&&oi?Number((net/oi*100).toFixed(2)):null};
  };
  try{
    const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/92.0'},cache:'no-store',signal:AbortSignal.timeout(9000)});
    const rows=await r.json().catch(()=>null);
    if(!r.ok||!Array.isArray(rows)||!rows.length)return {ok:false,state:'UNAVAILABLE',source:'CFTC Disaggregated Futures Only'};
    const latest=rows[0],previous=rows[1]??null,third=rows[2]??null;
    const oi=n(latest.open_interest_all);
    const reportDate=latest.report_date_as_yyyy_mm_dd??null;
    const ageDays=reportDate?Number(((Date.now()-new Date(reportDate).getTime())/86400000).toFixed(1)):null;
    const freshness=ageDays===null?'UNAVAILABLE':ageDays<=10?'CURRENT_WEEKLY':ageDays<=17?'LATE_WEEKLY':'STALE_WEEKLY';
    const managed=group('Managed Money',latest,'m_money_positions_long_all','m_money_positions_short_all','change_in_m_money_long_all','change_in_m_money_short_all',oi);
    const swap=group('Swap Dealers',latest,'swap_positions_long_all','swap__positions_short_all','change_in_swap_long_all','change_in_swap_short_all',oi);
    const producer=group('Producer / Merchant',latest,'prod_merc_positions_long','prod_merc_positions_short','change_in_prod_merc_long','change_in_prod_merc_short',oi);
    const other=group('Other Reportables',latest,'other_rept_positions_long','other_rept_positions_short','change_in_other_rept_long','change_in_other_rept_short',oi);
    const managedNet=row=>{
      const a=n(row?.m_money_positions_long_all),b=n(row?.m_money_positions_short_all);
      return a!==null&&b!==null?a-b:null;
    };
    const latestManaged=managedNet(latest),thirdManaged=managedNet(third);
    return {
      ok:true,report_date:reportDate,age_days:ageDays,freshness,
      market:latest.market_and_exchange_names??'GOLD - COMMODITY EXCHANGE INC.',
      contract_code:'088691',dataset_id:'72hh-3qpy',
      open_interest:oi,open_interest_change:n(latest.change_in_open_interest_all),
      groups:[managed,swap,producer,other],
      managed_money_3_report_net_change:latestManaged!==null&&thirdManaged!==null?latestManaged-thirdManaged:null,
      prior_report_date:previous?.report_date_as_yyyy_mm_dd??null,
      source:'CFTC Disaggregated Futures Only',
      truth_label:'OFFICIAL_WEEKLY_COT_NOT_INTRADAY_FLOW',
      note:'COT positions are weekly Tuesday snapshots published by CFTC. They are not live dealer, CTA or intraday flow.'
    };
  }catch{return {ok:false,state:'UNAVAILABLE',source:'CFTC Disaggregated Futures Only'}}
}
function marketBreadth(rows){
  const live=rows.filter(x=>x.ok&&['FRESH','DELAYED'].includes(x.freshness));
  const by=id=>live.find(x=>x.id===id);
  const up=live.filter(x=>x.direction==='UP').length,down=live.filter(x=>x.direction==='DOWN').length,flat=live.filter(x=>x.direction==='FLAT').length;
  const dxy=by('dxy'),eur=by('eurusd'),btc=by('btc'),spx=by('spx'),oil=by('oil'),gold=by('gold');
  const usdFirm=(dxy?.direction==='UP'||eur?.direction==='DOWN'),usdSoft=(dxy?.direction==='DOWN'||eur?.direction==='UP');
  const risk=[btc,spx].filter(Boolean),riskDown=risk.filter(x=>x.direction==='DOWN').length,riskUp=risk.filter(x=>x.direction==='UP').length;
  const riskSoft=riskDown>riskUp,riskFirm=riskUp>riskDown;
  let state='MIXED_CROSS_ASSET_TAPE';
  if(usdFirm&&riskSoft&&oil?.direction==='UP')state='USD_FIRM_ENERGY_UP_RISK_SOFT';
  else if(usdFirm&&riskSoft)state='USD_FIRM_RISK_SOFT';
  else if(usdSoft&&riskFirm)state='USD_SOFT_RISK_FIRM';
  else if(oil?.direction==='UP'&&gold?.direction==='DOWN')state='COMMODITY_DIVERGENCE';
  return {state,usable_assets:live.length,up,down,flat,breadth_score:live.length?Number(((up-down)/live.length).toFixed(2)):0,
    usd_state:usdFirm?'FIRM':usdSoft?'SOFT':'MIXED',risk_state:riskSoft?'SOFT':riskFirm?'FIRM':'MIXED',
    note:'Descriptive cross-asset pattern only; not a causal claim or trade signal.'};
}


const QUANT_SURVIVOR_CAPTURED_AT='2026-09-28T07:11:37.628Z';
const QUANT_SURVIVOR_MAX_AGE_MS=6*60*60*1000;
const QUANT_SURVIVOR_SNAPSHOT={
  forecast_error:{
    ok:true,version:'v96-forecast-error-attribution-v1',
    horizons:[
      {horizon_minutes:30,resolved_sample:12,nonflat_sample:8,hits:6,misses:2,flat_count:4,clean_hits:6,timing_recovered:2,directional_failures:0,low_follow_through:4,adverse_path_risk:0,avg_mfe_pct:0.1433,avg_mae_pct:0.0397,calibration_state:'EARLY_SAMPLE_LT_20',reviewed_at:'2026-09-28T07:10:00.204836Z'},
      {horizon_minutes:60,resolved_sample:10,nonflat_sample:10,hits:8,misses:2,flat_count:0,clean_hits:7,timing_recovered:2,directional_failures:0,low_follow_through:0,adverse_path_risk:1,avg_mfe_pct:0.2676,avg_mae_pct:0.0431,calibration_state:'EARLY_SAMPLE_LT_20',reviewed_at:'2026-09-28T07:10:00.204836Z'},
      {horizon_minutes:120,resolved_sample:6,nonflat_sample:6,hits:6,misses:0,flat_count:0,clean_hits:5,timing_recovered:0,directional_failures:0,low_follow_through:0,adverse_path_risk:0,avg_mfe_pct:0.5098,avg_mae_pct:0.0615,calibration_state:'EARLY_SAMPLE_LT_20',reviewed_at:'2026-09-28T07:10:00.204836Z'}
    ],
    categories:{DIRECTIONAL_HIT:1,ADVERSE_PATH_RISK:1,CLEAN_DIRECTIONAL_HIT:18,TIMING_ERROR_RECOVERED_LATER:4,LOW_FOLLOW_THROUGH_UNRESOLVED:2,LOW_FOLLOW_THROUGH_RECOVERED_LATER:2},
    sample_policy:{public_accuracy:'WITHHELD_UNTIL_THRESHOLD',minimum_nonflat_sample_for_public_accuracy:20},
    data_integrity:{negative_mae:0,negative_mfe:0},
    governance:{research_only:true,action_permitted:'WAIT',capital_permission:'0R'}
  },
  execution_latency:{
    ok:true,version:'v97-execution-latency-quality-v1',
    delays:[
      {delay_minutes:2,sample_size:14,adverse_count:10,improved_count:4,neutral_count:0,adverse_frequency_pct:71.43,avg_signed_shortfall_bps:1.3125,median_signed_shortfall_bps:1.3043,avg_adverse_cost_bps:3.2787,avg_favorable_improvement_bps:1.9662,p75_adverse_cost_bps:4.9103,max_adverse_cost_bps:11.3505,calibration_state:'EARLY_SAMPLE_10_TO_29',reviewed_at:'2026-09-28T07:10:00.204836Z'},
      {delay_minutes:5,sample_size:14,adverse_count:9,improved_count:5,neutral_count:0,adverse_frequency_pct:64.29,avg_signed_shortfall_bps:2.7909,median_signed_shortfall_bps:4.0201,avg_adverse_cost_bps:5.7906,avg_favorable_improvement_bps:2.9996,p75_adverse_cost_bps:9.1954,max_adverse_cost_bps:22.5873,calibration_state:'EARLY_SAMPLE_10_TO_29',reviewed_at:'2026-09-28T07:10:00.204836Z'},
      {delay_minutes:10,sample_size:13,adverse_count:7,improved_count:6,neutral_count:0,adverse_frequency_pct:53.85,avg_signed_shortfall_bps:2.0783,median_signed_shortfall_bps:4.2528,avg_adverse_cost_bps:4.5202,avg_favorable_improvement_bps:2.442,p75_adverse_cost_bps:6.8553,max_adverse_cost_bps:16.8674,calibration_state:'EARLY_SAMPLE_10_TO_29',reviewed_at:'2026-09-28T07:10:00.204836Z'}
    ],
    truth_label:'OBSERVED_SIGNAL_TO_LATER_PRICE_SHORTFALL_PROXY',
    sample_policy:{minimum_sample_for_stable_latency_estimate:30},
    excluded_costs:['bid_ask_spread','broker_slippage','commission','market_impact','fill_probability'],
    governance:{research_only:true,action_permitted:'WAIT',capital_permission:'0R',realized_execution_cost:false}
  }
};
function quantSurvivorSnapshot(){
  const captured=Date.parse(QUANT_SURVIVOR_CAPTURED_AT);
  if(!Number.isFinite(captured))return null;
  const ageMs=Math.max(0,Date.now()-captured);
  if(ageMs>QUANT_SURVIVOR_MAX_AGE_MS)return null;
  return {
    ok:true,
    source_mode:'VERIFIED_SNAPSHOT_FALLBACK',
    observed_at:QUANT_SURVIVOR_CAPTURED_AT,
    fallback_age_minutes:Number((ageMs/60000).toFixed(1)),
    forecast_error:QUANT_SURVIVOR_SNAPSHOT.forecast_error,
    execution_latency:QUANT_SURVIVOR_SNAPSHOT.execution_latency
  };
}

const SETTLEMENT_SURVIVOR_CAPTURED_AT='2026-09-28T07:22:20.539Z';
const SETTLEMENT_SURVIVOR_MAX_AGE_MS=6*60*60*1000;
const SETTLEMENT_SURVIVOR_SNAPSHOT={
  ok:true,version:'v101-forecast-settlement-readiness-v1',as_of_date:'2026-09-28',
  counts:{open:7,total:7,due_today:0,brier_scored:0,overdue_open:0,frozen_with_hash:7,resolved_or_closed:0,publication_integrity_verified:7},
  nearest_open_horizon:'2027-12-31',days_to_nearest_horizon:459,settlement_state:'NO_FORECASTS_DUE',
  publication_integrity_state:'ALL_PUBLICATIONS_VERIFIED',brier_publication_state:'WITHHELD_NO_RESOLVED_OUTCOMES',
  scheduler:{history_mutation:false,forecast_ledger_qa:'DAILY_06_UTC'},
  forecasts:[
    {forecast_code:'GTI-F001',probability:94,horizon_date:'2027-12-31',days_remaining:459,status:'open',maturity_state:'OPEN_NOT_DUE',publication_integrity:'VERIFIED',brier_state:'PENDING_OUTCOME'},
    {forecast_code:'GTI-F006',probability:83,horizon_date:'2028-12-31',days_remaining:825,status:'open',maturity_state:'OPEN_NOT_DUE',publication_integrity:'VERIFIED',brier_state:'PENDING_OUTCOME'},
    {forecast_code:'GTI-F002',probability:93,horizon_date:'2030-12-31',days_remaining:1555,status:'open',maturity_state:'OPEN_NOT_DUE',publication_integrity:'VERIFIED',brier_state:'PENDING_OUTCOME'},
    {forecast_code:'GTI-F003',probability:88,horizon_date:'2030-12-31',days_remaining:1555,status:'open',maturity_state:'OPEN_NOT_DUE',publication_integrity:'VERIFIED',brier_state:'PENDING_OUTCOME'},
    {forecast_code:'GTI-F004',probability:95,horizon_date:'2030-12-31',days_remaining:1555,status:'open',maturity_state:'OPEN_NOT_DUE',publication_integrity:'VERIFIED',brier_state:'PENDING_OUTCOME'},
    {forecast_code:'GTI-F005',probability:86,horizon_date:'2030-12-31',days_remaining:1555,status:'open',maturity_state:'OPEN_NOT_DUE',publication_integrity:'VERIFIED',brier_state:'PENDING_OUTCOME'},
    {forecast_code:'GTI-F007',probability:79,horizon_date:'2030-12-31',days_remaining:1555,status:'open',maturity_state:'OPEN_NOT_DUE',publication_integrity:'VERIFIED',brier_state:'PENDING_OUTCOME'}
  ],
  governance:{public_accuracy:'SAMPLE_AND_OUTCOME_GATED',capital_permission:'0R',outcome_mutation_by_this_function:false,early_settlement_allowed_without_verified_evidence:false},
  truth_label:'IMMUTABLE_PUBLICATION_PLUS_MATURITY_READINESS_NOT_OUTCOME_JUDGMENT'
};
function settlementSurvivorSnapshot(){
  const captured=Date.parse(SETTLEMENT_SURVIVOR_CAPTURED_AT);
  if(!Number.isFinite(captured))return null;
  const ageMs=Math.max(0,Date.now()-captured);
  if(ageMs>SETTLEMENT_SURVIVOR_MAX_AGE_MS)return null;
  return {...SETTLEMENT_SURVIVOR_SNAPSHOT,source_mode:'VERIFIED_SNAPSHOT_FALLBACK',observed_at:SETTLEMENT_SURVIVOR_CAPTURED_AT,fallback_age_minutes:Number((ageMs/60000).toFixed(1)),fallback_expires_at:new Date(captured+SETTLEMENT_SURVIVOR_MAX_AGE_MS).toISOString()};
}

const BENCHMARK_SURVIVOR_CAPTURED_AT='2026-09-28T07:31:09.169Z';
const BENCHMARK_SURVIVOR_MAX_AGE_MS=6*60*60*1000;
const BENCHMARK_SURVIVOR_SNAPSHOT={
  ok:true,version:'v102-benchmark-reputation-v1',
  counts:{models:4,edge_unproven:0,sample_too_small:4,human_review_eligible:0,reputation_sample_reached:0},
  benchmark_policy:{version:'TFA_GOLD_BENCHMARK_V1',baseline_name:'NO_SKILL_50',baseline_probability:0.5,baseline_accuracy_pct:50,min_signal_reputation_n:10,min_calibration_bucket_n:5,min_capital_permission_n:5,adaptive_weighting_enabled:false},
  promotion_gate:{minimum_60m_scored:30,minimum_120m_scored:20,required_wilson_lower_60m_pct:'>50',required_wilson_lower_120m_pct:'>50',result_if_passed:'ELIGIBLE_FOR_HUMAN_RESEARCH_REVIEW',automatic_promotion:false},
  models:[
    {model_name:'breakout_conservative_v1',state:'SAMPLE_TOO_SMALL',sample_60m:1,hits_60m:1,accuracy_60m_pct:100,wilson_lower_60m_pct:20.65,sample_120m:1,hits_120m:1,accuracy_120m_pct:100,wilson_lower_120m_pct:20.65,baseline_accuracy_pct:50,reputation_state:'WITHHELD_SAMPLE_TOO_SMALL',canonical_research_review_eligible:false},
    {model_name:'regime_baseline_v1',state:'SAMPLE_TOO_SMALL',sample_60m:1,hits_60m:1,accuracy_60m_pct:100,wilson_lower_60m_pct:20.65,sample_120m:1,hits_120m:1,accuracy_120m_pct:100,wilson_lower_120m_pct:20.65,baseline_accuracy_pct:50,reputation_state:'WITHHELD_SAMPLE_TOO_SMALL',canonical_research_review_eligible:false},
    {model_name:'reversal_specialist_v1',state:'SAMPLE_TOO_SMALL',sample_60m:0,hits_60m:0,accuracy_60m_pct:null,wilson_lower_60m_pct:null,sample_120m:0,hits_120m:0,accuracy_120m_pct:null,wilson_lower_120m_pct:null,baseline_accuracy_pct:50,reputation_state:'WITHHELD_SAMPLE_TOO_SMALL',canonical_research_review_eligible:false},
    {model_name:'structure_balanced_v1',state:'SAMPLE_TOO_SMALL',sample_60m:1,hits_60m:1,accuracy_60m_pct:100,wilson_lower_60m_pct:20.65,sample_120m:1,hits_120m:1,accuracy_120m_pct:100,wilson_lower_120m_pct:20.65,baseline_accuracy_pct:50,reputation_state:'WITHHELD_SAMPLE_TOO_SMALL',canonical_research_review_eligible:false}
  ],
  benchmark_state:'INSUFFICIENT_EVIDENCE',signal_reputation_state:'WITHHELD_SAMPLE_TOO_SMALL',
  governance:{canonical_performance_promotion:false,adaptive_weighting:false,automatic_execution:false,capital_permission:'0R'},
  truth_label:'BASELINE_COMPARISON_PLUS_CONFIDENCE_BOUND_AND_SAMPLE_GATES'
};
function benchmarkSurvivorSnapshot(){
  const captured=Date.parse(BENCHMARK_SURVIVOR_CAPTURED_AT);
  if(!Number.isFinite(captured))return null;
  const ageMs=Math.max(0,Date.now()-captured);
  if(ageMs>BENCHMARK_SURVIVOR_MAX_AGE_MS)return null;
  return {...BENCHMARK_SURVIVOR_SNAPSHOT,source_mode:'VERIFIED_SNAPSHOT_FALLBACK',observed_at:BENCHMARK_SURVIVOR_CAPTURED_AT,fallback_age_minutes:Number((ageMs/60000).toFixed(1)),fallback_expires_at:new Date(captured+BENCHMARK_SURVIVOR_MAX_AGE_MS).toISOString()};
}

const CALIBRATION_STRUCTURE_CAPTURED_AT='2026-09-28T07:33:08.463Z';
const CALIBRATION_STRUCTURE_MAX_AGE_MS=6*60*60*1000;
const CALIBRATION_STRUCTURE_SNAPSHOT={ok:true,version:'v103-calibration-structure-v1',ledger:{total:7,open:7,resolved_or_closed:0,brier_scored:0,average_probability:88.29,median_probability:88,min_probability:79,max_probability:95,p90_plus:3,p80_to_89:3,p70_to_79:1,up_forecasts:7,down_forecasts:0,distinct_horizons:3,distinct_target_states:5,nearest_horizon_days:459,furthest_horizon_days:1555,oldest_forecast_age_days:22},concentration:{direction_state:'DIRECTION_CONCENTRATED',horizon_state:'HORIZON_CONCENTRATED',probability_state:'HIGH_CONFIDENCE_LEDGER',largest_horizon_cluster:5,largest_horizon_share_pct:71.43},calibration_readiness_state:'PRE_OUTCOME_CALIBRATION_BASELINE',brier_state:'WITHHELD_NO_RESOLVED_OUTCOMES',governance:{descriptive_only:true,does_not_publish_accuracy:true,does_not_resolve_outcomes:true,capital_permission:'0R'},truth_label:'PRE_OUTCOME_CALIBRATION_STRUCTURE_NOT_FORECAST_PERFORMANCE'};
function calibrationStructureSurvivorSnapshot(){const captured=Date.parse(CALIBRATION_STRUCTURE_CAPTURED_AT);if(!Number.isFinite(captured))return null;const ageMs=Math.max(0,Date.now()-captured);if(ageMs>CALIBRATION_STRUCTURE_MAX_AGE_MS)return null;return {...CALIBRATION_STRUCTURE_SNAPSHOT,source_mode:'VERIFIED_SNAPSHOT_FALLBACK',observed_at:CALIBRATION_STRUCTURE_CAPTURED_AT,fallback_age_minutes:Number((ageMs/60000).toFixed(1)),fallback_expires_at:new Date(captured+CALIBRATION_STRUCTURE_MAX_AGE_MS).toISOString()};}

const RISK_STACK_CAPTURED_AT='2026-09-28T07:40:00.168Z';
const RISK_STACK_MAX_AGE_MS=6*60*60*1000;
const RISK_STACK_SNAPSHOT={scenario_ev:{ok:true,version:'v98-scenario-ev-proxy-v1',horizons:[{horizon_minutes:30,nonflat_sample:10,resolved_sample:14,execution_sample:14,readiness_state:'EARLY_SAMPLE_INPUTS_NOT_READY',publication_state:'WITHHELD_SAMPLE_THRESHOLDS',empirical_ev_proxy_bps:7.9097,avg_execution_adjusted_edge_bps:7.9097,execution_delay_minutes:5,avg_latency_shortfall_bps:2.7909},{horizon_minutes:60,nonflat_sample:12,resolved_sample:12,execution_sample:12,readiness_state:'EARLY_SAMPLE_INPUTS_NOT_READY',publication_state:'WITHHELD_SAMPLE_THRESHOLDS',empirical_ev_proxy_bps:20.1903,avg_execution_adjusted_edge_bps:20.1903,execution_delay_minutes:5,avg_latency_shortfall_bps:2.5039},{horizon_minutes:120,nonflat_sample:8,resolved_sample:8,execution_sample:8,readiness_state:'EARLY_SAMPLE_INPUTS_NOT_READY',publication_state:'WITHHELD_SAMPLE_THRESHOLDS',empirical_ev_proxy_bps:50.5747,avg_execution_adjusted_edge_bps:50.5747,execution_delay_minutes:5,avg_latency_shortfall_bps:2.5411}],governance:{action_permitted:'WAIT',capital_permission:'0R',empirical_ev_can_grant_capital:false},truth_label:'RESEARCH_EDGE_PROXY_NOT_REALIZED_PNL',excluded_costs:['bid_ask_spread','broker_slippage','commission','market_impact','fill_probability'],publication_policy:{forecast_nonflat_n:20,execution_latency_n:30},execution_delay_proxy_minutes:5},portfolio_risk:{ok:true,state:'OBSERVATION_ONLY_0R',version:'v99-portfolio-risk-readiness-v1',blockers:['CANONICAL_RUNTIME_RESTRICTED','FORECAST_ERROR_SAMPLE_INSUFFICIENT','EXECUTION_LATENCY_SAMPLE_INSUFFICIENT','SCENARIO_EV_PROXY_SAMPLE_INSUFFICIENT','MULTI_ASSET_PORTFOLIO_NOT_YET_CALIBRATED'],evidence:{qa_state:'PASS',quality_state:'PASS',canonical_runtime_state:'CANONICAL_PUBLIC_RUNTIME_RESTRICTED',multi_asset_portfolio_ready:false,reason_multi_asset_not_ready:'Cross-asset context exists, but independently calibrated multi-asset position models do not yet exist.',single_asset_research_assets:['GOLD']},passed_gates:['RESEARCH_ALIGNMENT','AUTONOMOUS_QA_PASS','DATA_QUALITY_PASS'],capital_permission:'0R',multi_asset_portfolio_ready:false,single_asset_human_review_eligible:false}};
function riskStackSurvivorSnapshot(){const captured=Date.parse(RISK_STACK_CAPTURED_AT);if(!Number.isFinite(captured))return null;const ageMs=Math.max(0,Date.now()-captured);if(ageMs>RISK_STACK_MAX_AGE_MS)return null;return {ok:true,source_mode:'VERIFIED_SNAPSHOT_FALLBACK',observed_at:RISK_STACK_CAPTURED_AT,fallback_age_minutes:Number((ageMs/60000).toFixed(1)),fallback_expires_at:new Date(captured+RISK_STACK_MAX_AGE_MS).toISOString(),scenario_ev:RISK_STACK_SNAPSHOT.scenario_ev,portfolio_risk:RISK_STACK_SNAPSHOT.portfolio_risk};}

const FORECAST_COVERAGE_CAPTURED_AT='2026-09-28T07:42:00.472Z';
const FORECAST_COVERAGE_MAX_AGE_MS=6*60*60*1000;
const FORECAST_COVERAGE_SNAPSHOT={ok:true,version:'v104-forecast-coverage-governance-v1',as_of_date:'2026-09-28',ledger:{total:7,up_forecasts:7,down_forecasts:0,max_probability:95,min_probability:79,p90_plus_forecasts:3,average_probability:88.29,within_1y_forecasts:0,distinct_horizon_years:3,distinct_target_states:5,sub70_probability_forecasts:0},concentration_metrics:{horizon_hhi:0.551,direction_hhi:1,target_state_hhi:0.2245,probability_band_hhi:0.3878,largest_target_cluster:2,largest_horizon_cluster:5,largest_target_share_pct:28.57,largest_horizon_share_pct:71.43},coverage_gates:{horizon_coverage:'CONCENTRATED',direction_coverage:'ONE_SIDED_ONLY',target_state_coverage:'BROAD',confidence_band_coverage:'HIGH_CONFIDENCE_ONLY',generalization_readiness:'COVERAGE_INCOMPLETE',near_term_horizon_coverage:'MISSING_LT_1Y'},missing_coverage:{horizon_balance:'LARGEST_HORIZON_CLUSTER_EXCEEDS_60_PERCENT',counter_direction:'DOWN',near_term_horizon:'NO_FORECASTS_WITHIN_365_DAYS',lower_confidence_band:'NO_FORECASTS_BELOW_70_PERCENT'},governance:{descriptive_only:true,capital_permission:'0R',automatic_promotion:false,does_not_change_forecasts:true,does_not_publish_accuracy:true,does_not_create_counter_forecasts:true},truth_label:'FORECAST_BOOK_COVERAGE_AND_CONCENTRATION_NOT_FORECAST_VALIDITY'};
function forecastCoverageSurvivorSnapshot(){const captured=Date.parse(FORECAST_COVERAGE_CAPTURED_AT);if(!Number.isFinite(captured))return null;const ageMs=Math.max(0,Date.now()-captured);if(ageMs>FORECAST_COVERAGE_MAX_AGE_MS)return null;return {...FORECAST_COVERAGE_SNAPSHOT,source_mode:'VERIFIED_SNAPSHOT_FALLBACK',observed_at:FORECAST_COVERAGE_CAPTURED_AT,fallback_age_minutes:Number((ageMs/60000).toFixed(1)),fallback_expires_at:new Date(captured+FORECAST_COVERAGE_MAX_AGE_MS).toISOString()};}

const RECEIPT_LEDGER_CAPTURED_AT='2026-09-28T08:22:41.857379Z';
const RECEIPT_LEDGER_MAX_AGE_MS=6*60*60*1000;
const RECEIPT_LEDGER_SNAPSHOT={ok:true,version:'v107-provenance-receipt-ledger-v1',state:'HASH_CHAIN_VERIFIED',counts:{modules:8,receipts:24,chain_link_failures:0,payload_hash_failures:0,receipt_hash_failures:0},history_window:{first_receipt_at:'2026-09-28T08:08:27.729239Z',latest_receipt_at:'2026-09-28T08:21:50.001572Z'},scheduler:{cadence:'HOURLY_MINUTE_05',gateway_dependency:false},governance:{append_only:true,deletes_blocked:true,updates_blocked:true,capital_permission:'0R',hashes_are_not_external_signatures:true,hashes_are_content_integrity_receipts:true},truth_label:'APPEND_ONLY_HASH_CHAINED_EVIDENCE_RECEIPT_LEDGER_NOT_EXTERNAL_SIGNATURE'};
function receiptLedgerSurvivorSnapshot(){
  const captured=Date.parse(RECEIPT_LEDGER_CAPTURED_AT);
  if(!Number.isFinite(captured))return null;
  const ageMs=Math.max(0,Date.now()-captured);
  if(ageMs>RECEIPT_LEDGER_MAX_AGE_MS)return null;
  return {...RECEIPT_LEDGER_SNAPSHOT,source_mode:'VERIFIED_SNAPSHOT_FALLBACK',observed_at:RECEIPT_LEDGER_CAPTURED_AT,fallback_age_minutes:Number((ageMs/60000).toFixed(1)),fallback_expires_at:new Date(captured+RECEIPT_LEDGER_MAX_AGE_MS).toISOString()};
}

const ATTESTATION_SURVIVOR_CAPTURED_AT='2026-09-28T08:22:41.857379Z';
const ATTESTATION_SURVIVOR_MAX_AGE_MS=6*60*60*1000;
const ATTESTATION_SURVIVOR_SNAPSHOT={
  ok:true,
  version:'v108-server-attested-provenance-v2-key-aware',
  state:'SERVER_ATTESTATION_VERIFIED',
  counts:{receipts:24,attestations:24,verified_attestations:24,failed_attestations:0,missing_historical_keys:0,unattested_receipts:0},
  history_window:{first_attestation_at:'2026-09-28T08:15:03.030845Z',latest_attestation_at:'2026-09-28T08:21:59.305026Z'},
  scheduler:{cadence:'HOURLY_MINUTE_07',depends_on_receipt_cron:'HOURLY_MINUTE_05',gateway_dependency:false},
  governance:{append_only:true,key_storage:'SUPABASE_VAULT',secret_exposed:false,attestation_type:'HMAC_SHA256_SERVER_ATTESTATION',capital_permission:'0R',not_public_key_signature:true,key_version_aware_verification:true,historical_keys_required_for_verification:true},
  truth_label:'VAULT_BACKED_VERSIONED_SERVER_HMAC_ATTESTATION_NOT_PUBLIC_KEY_SIGNATURE'
};
function attestationSurvivorSnapshot(){
  const captured=Date.parse(ATTESTATION_SURVIVOR_CAPTURED_AT);
  if(!Number.isFinite(captured))return null;
  const ageMs=Math.max(0,Date.now()-captured);
  if(ageMs>ATTESTATION_SURVIVOR_MAX_AGE_MS)return null;
  return {...ATTESTATION_SURVIVOR_SNAPSHOT,source_mode:'VERIFIED_SNAPSHOT_FALLBACK',observed_at:ATTESTATION_SURVIVOR_CAPTURED_AT,fallback_age_minutes:Number((ageMs/60000).toFixed(1)),fallback_expires_at:new Date(captured+ATTESTATION_SURVIVOR_MAX_AGE_MS).toISOString()};
}

const KEY_LIFECYCLE_SURVIVOR_CAPTURED_AT='2026-09-28T08:22:41.857379Z';
const KEY_LIFECYCLE_SURVIVOR_MAX_AGE_MS=6*60*60*1000;
const KEY_LIFECYCLE_SURVIVOR_SNAPSHOT={
  ok:true,
  version:'v109-attestation-key-lifecycle-v1',
  state:'KEY_LIFECYCLE_HEALTHY',
  counts:{keys:2,active_keys:1,retired_keys:1,missing_vault_keys:0,attestations:24},
  keys:[
    {key_name:'tfa_v108_attestation_hmac_v1',version:1,status:'RETIRED',attestation_count:16,vault_secret_present:true,activated_at:'2026-09-28T08:15:02.79337Z',retired_at:'2026-09-28T08:21:47.895472Z'},
    {key_name:'tfa_v108_attestation_hmac_v2',version:2,status:'ACTIVE',attestation_count:8,vault_secret_present:true,activated_at:'2026-09-28T08:21:47.895609Z',retired_at:null}
  ],
  rotation:{history_preserved:true,rotation_function:'service_role_only',automatic_rotation:false,old_keys_retained_for_historical_verification:true},
  governance:{capital_permission:'0R',key_material_storage:'SUPABASE_VAULT',secret_values_exposed:false,key_metadata_public_safe:true},
  truth_label:'VERSIONED_VAULT_KEY_LIFECYCLE_AND_HISTORICAL_ATTESTATION_CONTINUITY'
};
function keyLifecycleSurvivorSnapshot(){
  const captured=Date.parse(KEY_LIFECYCLE_SURVIVOR_CAPTURED_AT);
  if(!Number.isFinite(captured))return null;
  const ageMs=Math.max(0,Date.now()-captured);
  if(ageMs>KEY_LIFECYCLE_SURVIVOR_MAX_AGE_MS)return null;
  return {...KEY_LIFECYCLE_SURVIVOR_SNAPSHOT,source_mode:'VERIFIED_SNAPSHOT_FALLBACK',observed_at:KEY_LIFECYCLE_SURVIVOR_CAPTURED_AT,fallback_age_minutes:Number((ageMs/60000).toFixed(1)),fallback_expires_at:new Date(captured+KEY_LIFECYCLE_SURVIVOR_MAX_AGE_MS).toISOString()};
}

const CHECKPOINT_SURVIVOR_CAPTURED_AT='2026-09-28T09:30:35.488761Z';
const CHECKPOINT_SURVIVOR_MAX_AGE_MS=6*60*60*1000;
const CHECKPOINT_SURVIVOR_SNAPSHOT={
  ok:true,
  version:'v110-provenance-checkpoint-root-v1',
  state:'GLOBAL_CHECKPOINT_VERIFIED',
  counts:{checkpoints:2,hmac_failures:0,chain_link_failures:0,payload_hash_failures:0,missing_historical_keys:0,uncheckpointed_attestations:0},
  latest_checkpoint:{id:2,key_name:'tfa_v108_attestation_hmac_v2',module_count:8,receipt_count:32,attestation_count:32,checkpointed_at:'2026-09-28T09:30:32.042967Z',latest_receipt_at:'2026-09-28T09:05:00.373877Z',latest_attestation_at:'2026-09-28T09:07:00.114438Z',checkpoint_sha256:'24b4694334e4bb2bfc5e4d4ee474c107ea2b880ebecd7cc390900c62b27c5de0',previous_checkpoint_sha256:'2d829cc019980e7902428eb78c54468876be811641aee7815a1c88ee88f10cb3',checkpoint_hmac_sha256:'f9f26fe9880ba834f9abcb53f6b10f999aaebec5f7b9f8762ad1f47c950d298f'},
  freshness:{lag_seconds:1411.928529,latest_checkpoint_at:'2026-09-28T09:30:32.042967Z',latest_attestation_at:'2026-09-28T09:07:00.114438Z'},
  scheduler:{cadence:'HOURLY_MINUTE_10',depends_on_receipts:'HOURLY_MINUTE_05',depends_on_attestations:'HOURLY_MINUTE_07',gateway_dependency:false},
  governance:{append_only:true,updates_blocked:true,deletes_blocked:true,checkpoint_hash:'SHA256',checkpoint_attestation:'HMAC_SHA256_SERVER_ATTESTATION',key_version_aware:true,not_public_key_signature:true,capital_permission:'0R'},
  truth_label:'GLOBAL_HASH_CHAINED_HMAC_ATTESTED_PROVENANCE_CHECKPOINT_NOT_EXTERNAL_PUBLIC_KEY_ANCHOR'
};
function checkpointSurvivorSnapshot(){
  const captured=Date.parse(CHECKPOINT_SURVIVOR_CAPTURED_AT);
  if(!Number.isFinite(captured))return null;
  const ageMs=Math.max(0,Date.now()-captured);
  if(ageMs>CHECKPOINT_SURVIVOR_MAX_AGE_MS)return null;
  return {...CHECKPOINT_SURVIVOR_SNAPSHOT,source_mode:'VERIFIED_SNAPSHOT_FALLBACK',observed_at:CHECKPOINT_SURVIVOR_CAPTURED_AT,fallback_age_minutes:Number((ageMs/60000).toFixed(1)),fallback_expires_at:new Date(captured+CHECKPOINT_SURVIVOR_MAX_AGE_MS).toISOString()};
}

async function githubExternalAnchor(timeout=6000){
  const base='https://raw.githubusercontent.com/youngshekeh/youngshekeh/the-father-analytics-audit/anchors';
  const hourKey=(offsetHours=0)=>new Date(Date.now()-offsetHours*60*60*1000).toISOString().slice(0,13);
  const readAnchor=async(url)=>{
    try{
      const r=await fetch(url,{
        headers:{Accept:'application/json','Cache-Control':'no-cache','User-Agent':'THE-FATHER-ANALYTICS/112.1'},
        cache:'no-store',
        signal:AbortSignal.timeout(Math.min(timeout,3500))
      });
      const body=await r.json().catch(()=>null);
      const root=String(body?.checkpoint?.checkpoint_sha256??'');
      const proofHash=String(body?.external_anchor?.source_proof_sha256??'');
      if(!r.ok||!body||!/^[a-f0-9]{64}$/i.test(root)||!/^[a-f0-9]{64}$/i.test(proofHash))return null;
      return {...body,ok:true,source_url:url};
    }catch{return null}
  };

  // Prefer immutable, deterministic hourly proofs. Current + prior two hours
  // cover schedule jitter while keeping every object content-addressable by time.
  const hourlyUrls=[0,1,2].map(offset=>`${base}/heartbeats/${hourKey(offset)}.json`);
  const hourly=(await Promise.all(hourlyUrls.map(readAnchor)))
    .filter(Boolean)
    .sort((a,b)=>Date.parse(String(b?.external_anchor?.last_verified_at??''))-Date.parse(String(a?.external_anchor?.last_verified_at??'')));
  if(hourly[0])return {...hourly[0],source_mode:'IMMUTABLE_HOURLY_HEARTBEAT'};

  // Backwards-compatible fallback only. Freshness governance still fails closed
  // if this mutable pointer is stale or lacks V112 heartbeat metadata.
  const latestUrl=`${base}/latest.json?heartbeat_minute=${Math.floor(Date.now()/60000)}`;
  const latest=await readAnchor(latestUrl);
  if(latest)return {...latest,source_mode:'MUTABLE_LATEST_FALLBACK'};

  return {ok:false,state:'UNAVAILABLE',source:'GITHUB_AUDIT_BRANCH'};
}

async function supabaseRpc(name,timeout=5000){
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
      method:'POST',
      headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json',Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/102.0'},
      body:'{}',
      cache:'no-store',
      signal:AbortSignal.timeout(timeout)
    });
    const body=await r.json().catch(()=>null);
    if(!r.ok||!body)return {ok:false,state:'UNAVAILABLE',source:`Supabase RPC ${name}`,http_status:r.status};
    return body;
  }catch(error){return {ok:false,state:'UNAVAILABLE',source:`Supabase RPC ${name}`,error:String(error).slice(0,120)}}
}

async function quantAccountabilityEdge(timeout=7000){
  try{
    const r=await fetch(`${SUPABASE_URL}/functions/v1/quant-accountability-state`,{
      method:'POST',
      headers:{
        Authorization:`Bearer ${LEGACY_ANON_JWT}`,
        apikey:PUBLISHABLE_KEY,
        'Content-Type':'application/json',
        Accept:'application/json',
        'User-Agent':'THE-FATHER-ANALYTICS/97.1'
      },
      body:'{}',
      cache:'no-store',
      signal:AbortSignal.timeout(timeout)
    });
    const body=await r.json().catch(()=>null);
    if(!r.ok||!body?.ok)return {ok:false,state:'UNAVAILABLE',source:'Supabase Edge direct-Postgres accountability lane',http_status:r.status};
    return body;
  }catch(error){return {ok:false,state:'UNAVAILABLE',source:'Supabase Edge direct-Postgres accountability lane',error:String(error).slice(0,120)}}
}

async function read(path,timeout=9000){
  const started=Date.now();
  try{
    const response=await fetch(BASE+path,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/87.0'},
      cache:'no-store',
      signal:AbortSignal.timeout(timeout)
    });
    const body=await response.json().catch(()=>null);
    return {ok:response.ok&&!!body,status:response.status,latency_ms:Date.now()-started,body};
  }catch(error){
    return {ok:false,status:0,latency_ms:Date.now()-started,body:null,error:String(error).slice(0,160)};
  }
}
const pause=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
function safe(v,fallback='WITHHELD'){return v===null||v===undefined||v===''?fallback:v}
function label(state){
  return String(state||'WITHHELD').replaceAll('_',' ');
}
function stableJson(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(stableJson).join(',')+']';
  const keys=Object.keys(value).sort();
  return '{'+keys.map(k=>JSON.stringify(k)+':'+stableJson(value[k])).join(',')+'}';
}
async function sha256Hex(value){
  try{
    if(!globalThis.crypto?.subtle)return null;
    const bytes=new TextEncoder().encode(stableJson(value));
    const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  }catch{return null}
}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}

  // Mission Brief consumes research state. It does not run the full regression
  // suite internally; V78 is verified by a separate client-side channel.
  let [auto,day,liquidity,zones,confluence,breakout,tournament,quality,quota,marketAssets,macroEvidence,trendEvidence,cotGold,ratesEvidence,treasuryFunding,volEvidence,seasonality,forecastErrorState,executionQualityState,forecastSettlementState,benchmarkReputationState,calibrationStructureState,scenarioEvState,portfolioRiskState,forecastCoverageState,provenanceReceiptState,provenanceAttestationState,keyLifecycleState,checkpointState,externalAnchorRaw]=await Promise.all([
    read('/api/autonomous-state'),
    read('/api/gold-day-state'),
    read('/api/gold-liquidity-state-machine',10000),
    read('/api/gold-mtf-zones',10000),
    read('/api/gold-mtf-confluence',11000),
    read('/api/gold-breakout-acceptance',11000),
    read('/api/research-model-tournament'),
    read('/api/data-quality-sentinel'),
    read('/api/quota-probe'),
    Promise.all(MARKET_ASSETS.map(marketQuote)),
    Promise.all([
      worldBankLatest('WLD','NY.GDP.MKTP.KD.ZG','World GDP growth'),
      worldBankLatest('WLD','FP.CPI.TOTL.ZG','World inflation'),
      worldBankLatest('NG','NY.GDP.MKTP.KD.ZG','Nigeria GDP growth'),
      worldBankLatest('NG','FP.CPI.TOTL.ZG','Nigeria inflation'),
      worldBankLatest('SSF','NY.GDP.MKTP.KD.ZG','Sub-Saharan Africa GDP growth'),
      marketQuote({id:'usdngn',name:'USD/NGN',symbol:'NGN=X',kind:'fx',precision:2})
    ]),
    Promise.all([
      worldBankLatest('WLD','IT.NET.USER.ZS','Internet users'),
      worldBankLatest('WLD','GB.XPD.RSDV.GD.ZS','R&D expenditure'),
      worldBankLatest('WLD','EG.ELC.RNEW.ZS','Renewable electricity output'),
      worldBankLatest('WLD','IP.PAT.RESD','Resident patent applications'),
      marketQuote({id:'nvda',name:'NVIDIA',symbol:'NVDA',kind:'cash_equity',precision:2}),
      marketQuote({id:'botz',name:'Robotics & AI ETF',symbol:'BOTZ',kind:'cash_etf',precision:2}),
      marketQuote({id:'icln',name:'Clean Energy ETF',symbol:'ICLN',kind:'cash_etf',precision:2}),
      marketQuote({id:'btc-trend',name:'Bitcoin',symbol:'BTC-USD',kind:'crypto',precision:0}),
      arxivActivity('cs.AI','AI research activity',7),
      arxivActivity('cs.RO','Robotics research activity',7),
      cryptoGlobal()
    ]),
    cftcGoldPositioning(),
    Promise.all([
      treasuryCurve10Y('nominal'),
      treasuryCurve10Y('real')
    ]),
    treasuryFundingPulse(),
    Promise.all([
      cboeVolIndex('VIX','Cboe VIX'),
      cboeVolIndex('GVZ','Cboe Gold ETF Volatility Index'),
      cboeVolIndex('VVIX','Cboe VVIX'),
      cboeVolIndex('SKEW','Cboe SKEW')
    ]),
    goldSeasonality(),
    supabaseRpc('get_v96_forecast_error_state'),
    supabaseRpc('get_v97_execution_quality_state'),
    supabaseRpc('get_v101_forecast_settlement_state'),
    supabaseRpc('get_v102_benchmark_reputation_state'),
    supabaseRpc('get_v103_calibration_structure_state'),
    supabaseRpc('get_v98_scenario_ev_state'),
    supabaseRpc('get_v99_portfolio_risk_readiness'),
    supabaseRpc('get_v104_forecast_coverage_governance_state'),
    supabaseRpc('get_v107_provenance_ledger_state'),
    supabaseRpc('get_v108_provenance_attestation_state'),
    supabaseRpc('get_v109_attestation_key_lifecycle_state'),
    supabaseRpc('get_v110_provenance_checkpoint_state'),
    githubExternalAnchor()
  ]);

  let accountabilitySourceMode='POSTGREST_RPC';
  let accountabilityObservedAt=null;
  let accountabilityFallbackAgeMinutes=null;
  if(!forecastErrorState?.ok || !executionQualityState?.ok){
    const edgeAccountability=await quantAccountabilityEdge();
    if(edgeAccountability?.ok){
      forecastErrorState=edgeAccountability.forecast_error;
      executionQualityState=edgeAccountability.execution_latency;
      accountabilitySourceMode=edgeAccountability.source_mode??'DIRECT_POSTGRES_EDGE_FUNCTION';
      accountabilityObservedAt=edgeAccountability.observed_at??null;
    }else{
      const survivor=quantSurvivorSnapshot();
      if(survivor?.ok){
        forecastErrorState=survivor.forecast_error;
        executionQualityState=survivor.execution_latency;
        accountabilitySourceMode=survivor.source_mode;
        accountabilityObservedAt=survivor.observed_at;
        accountabilityFallbackAgeMinutes=survivor.fallback_age_minutes;
      }else{
        accountabilitySourceMode='EVIDENCE_GATED';
      }
    }
  }

  let settlementSourceMode='POSTGREST_RPC';
  let settlementObservedAt=null;
  let settlementFallbackAgeMinutes=null;
  let settlementFallbackExpiresAt=null;
  if(!forecastSettlementState?.ok){
    const fallback=settlementSurvivorSnapshot();
    if(fallback?.ok){
      forecastSettlementState=fallback;
      settlementSourceMode=fallback.source_mode;
      settlementObservedAt=fallback.observed_at;
      settlementFallbackAgeMinutes=fallback.fallback_age_minutes;
      settlementFallbackExpiresAt=fallback.fallback_expires_at;
    }else settlementSourceMode='EVIDENCE_GATED';
  }

  let benchmarkSourceMode='POSTGREST_RPC';
  let benchmarkObservedAt=null;
  let benchmarkFallbackAgeMinutes=null;
  let benchmarkFallbackExpiresAt=null;
  if(!benchmarkReputationState?.ok){
    const fallback=benchmarkSurvivorSnapshot();
    if(fallback?.ok){
      benchmarkReputationState=fallback;
      benchmarkSourceMode=fallback.source_mode;
      benchmarkObservedAt=fallback.observed_at;
      benchmarkFallbackAgeMinutes=fallback.fallback_age_minutes;
      benchmarkFallbackExpiresAt=fallback.fallback_expires_at;
    }else benchmarkSourceMode='EVIDENCE_GATED';
  }

  let calibrationStructureSourceMode='POSTGREST_RPC';
  let calibrationStructureObservedAt=null;
  let calibrationStructureFallbackAgeMinutes=null;
  let calibrationStructureFallbackExpiresAt=null;
  if(!calibrationStructureState?.ok){const fallback=calibrationStructureSurvivorSnapshot();if(fallback?.ok){calibrationStructureState=fallback;calibrationStructureSourceMode=fallback.source_mode;calibrationStructureObservedAt=fallback.observed_at;calibrationStructureFallbackAgeMinutes=fallback.fallback_age_minutes;calibrationStructureFallbackExpiresAt=fallback.fallback_expires_at;}else calibrationStructureSourceMode='EVIDENCE_GATED';}

  let riskStackSourceMode='POSTGREST_RPC';
  let riskStackObservedAt=null;
  let riskStackFallbackAgeMinutes=null;
  let riskStackFallbackExpiresAt=null;
  if(!scenarioEvState?.ok || !portfolioRiskState?.ok){const fallback=riskStackSurvivorSnapshot();if(fallback?.ok){scenarioEvState=fallback.scenario_ev;portfolioRiskState=fallback.portfolio_risk;riskStackSourceMode=fallback.source_mode;riskStackObservedAt=fallback.observed_at;riskStackFallbackAgeMinutes=fallback.fallback_age_minutes;riskStackFallbackExpiresAt=fallback.fallback_expires_at;}else riskStackSourceMode='EVIDENCE_GATED';}

  let forecastCoverageSourceMode='POSTGREST_RPC';
  let forecastCoverageObservedAt=null;
  let forecastCoverageFallbackAgeMinutes=null;
  let forecastCoverageFallbackExpiresAt=null;
  if(!forecastCoverageState?.ok){const fallback=forecastCoverageSurvivorSnapshot();if(fallback?.ok){forecastCoverageState=fallback;forecastCoverageSourceMode=fallback.source_mode;forecastCoverageObservedAt=fallback.observed_at;forecastCoverageFallbackAgeMinutes=fallback.fallback_age_minutes;forecastCoverageFallbackExpiresAt=fallback.fallback_expires_at;}else forecastCoverageSourceMode='EVIDENCE_GATED';}

  let receiptLedgerSourceMode='POSTGREST_RPC';
  let receiptLedgerObservedAt=null;
  let receiptLedgerFallbackAgeMinutes=null;
  let receiptLedgerFallbackExpiresAt=null;
  if(!provenanceReceiptState?.ok){
    const fallback=receiptLedgerSurvivorSnapshot();
    if(fallback?.ok){
      provenanceReceiptState=fallback;
      receiptLedgerSourceMode=fallback.source_mode;
      receiptLedgerObservedAt=fallback.observed_at;
      receiptLedgerFallbackAgeMinutes=fallback.fallback_age_minutes;
      receiptLedgerFallbackExpiresAt=fallback.fallback_expires_at;
    }else receiptLedgerSourceMode='EVIDENCE_GATED';
  }

  let attestationSourceMode='POSTGREST_RPC';
  let attestationObservedAt=null;
  let attestationFallbackAgeMinutes=null;
  let attestationFallbackExpiresAt=null;
  if(!provenanceAttestationState?.ok){
    const fallback=attestationSurvivorSnapshot();
    if(fallback?.ok){
      provenanceAttestationState=fallback;
      attestationSourceMode=fallback.source_mode;
      attestationObservedAt=fallback.observed_at;
      attestationFallbackAgeMinutes=fallback.fallback_age_minutes;
      attestationFallbackExpiresAt=fallback.fallback_expires_at;
    }else attestationSourceMode='EVIDENCE_GATED';
  }

  let keyLifecycleSourceMode='POSTGREST_RPC';
  let keyLifecycleObservedAt=null;
  let keyLifecycleFallbackAgeMinutes=null;
  let keyLifecycleFallbackExpiresAt=null;
  if(!keyLifecycleState?.ok){
    const fallback=keyLifecycleSurvivorSnapshot();
    if(fallback?.ok){
      keyLifecycleState=fallback;
      keyLifecycleSourceMode=fallback.source_mode;
      keyLifecycleObservedAt=fallback.observed_at;
      keyLifecycleFallbackAgeMinutes=fallback.fallback_age_minutes;
      keyLifecycleFallbackExpiresAt=fallback.fallback_expires_at;
    }else keyLifecycleSourceMode='EVIDENCE_GATED';
  }

  let checkpointSourceMode='POSTGREST_RPC';
  let checkpointObservedAt=null;
  let checkpointFallbackAgeMinutes=null;
  let checkpointFallbackExpiresAt=null;
  if(!checkpointState?.ok){
    const fallback=checkpointSurvivorSnapshot();
    if(fallback?.ok){
      checkpointState=fallback;
      checkpointSourceMode=fallback.source_mode;
      checkpointObservedAt=fallback.observed_at;
      checkpointFallbackAgeMinutes=fallback.fallback_age_minutes;
      checkpointFallbackExpiresAt=fallback.fallback_expires_at;
    }else checkpointSourceMode='EVIDENCE_GATED';
  }

  const externalAnchorState=(()=>{
    const current=checkpointState?.latest_checkpoint??{};
    const anchor=externalAnchorRaw?.ok?externalAnchorRaw:null;
    const currentRoot=String(current?.checkpoint_sha256??'');
    const externalRoot=String(anchor?.checkpoint?.checkpoint_sha256??'');
    const currentCheckpointMs=Date.parse(String(current?.checkpointed_at??''));
    const anchorCheckpointMs=Date.parse(String(anchor?.checkpoint?.checkpointed_at??''));
    const anchoredAt=anchor?.external_anchor?.anchored_at??null;
    const lastVerifiedAt=anchor?.external_anchor?.last_verified_at??anchoredAt;
    const anchoredMs=Date.parse(String(anchoredAt??''));
    const verifiedMs=Date.parse(String(lastVerifiedAt??''));
    const anchorAgeMinutes=Number.isFinite(anchoredMs)?Math.max(0,(Date.now()-anchoredMs)/60000):null;
    const ageMinutes=Number.isFinite(verifiedMs)?Math.max(0,(Date.now()-verifiedMs)/60000):null;
    const expiresAt=Number.isFinite(verifiedMs)?new Date(verifiedMs+90*60*1000).toISOString():null;
    const sourceProofSha=String(anchor?.external_anchor?.source_proof_sha256??'');
    const metadataValid=Boolean(
      anchor?.ok &&
      /^[a-f0-9]{64}$/i.test(externalRoot) &&
      /^[a-f0-9]{64}$/i.test(sourceProofSha) &&
      anchoredAt &&
      lastVerifiedAt
    );

    let rootState='UNAVAILABLE';
    if(metadataValid){
      if(externalRoot===currentRoot&&currentRoot) rootState='MATCH';
      else if(Number.isFinite(anchorCheckpointMs)&&Number.isFinite(currentCheckpointMs)&&anchorCheckpointMs<currentCheckpointMs) rootState='PENDING_NEWER_CHECKPOINT';
      else rootState='ROOT_MISMATCH';
    }
    const heartbeatState=metadataValid
      ? (ageMinutes!==null&&ageMinutes<=90?'FRESH':'STALE')
      : 'UNAVAILABLE';
    const state=heartbeatState==='STALE'?'STALE':rootState;
    const healthy=heartbeatState==='FRESH'&&(rootState==='MATCH'||rootState==='PENDING_NEWER_CHECKPOINT');
    return {
      ok:healthy,
      version:'v112-external-anchor-heartbeat-state-v1',
      state,
      root_state:rootState,
      heartbeat_state:heartbeatState,
      provider:'GitHub Actions',
      repository:'youngshekeh/youngshekeh',
      branch:'the-father-analytics-audit',
      workflow:'TFA Provenance External Anchor',
      anchored_at:anchoredAt,
      last_verified_at:lastVerifiedAt,
      verification_count:Number(anchor?.external_anchor?.verification_count??0)||null,
      anchor_age_minutes:anchorAgeMinutes===null?null:Number(anchorAgeMinutes.toFixed(1)),
      age_minutes:ageMinutes===null?null:Number(ageMinutes.toFixed(1)),
      freshness_expires_at:expiresAt,
      current_checkpoint:{
        checkpoint_id:current?.id??null,
        checkpointed_at:current?.checkpointed_at??null,
        checkpoint_sha256:currentRoot||null
      },
      external_anchor:{
        checkpoint_id:anchor?.checkpoint?.checkpoint_id??null,
        checkpointed_at:anchor?.checkpoint?.checkpointed_at??null,
        checkpoint_sha256:externalRoot||null,
        previous_checkpoint_sha256:anchor?.checkpoint?.previous_checkpoint_sha256??null,
        checkpoint_hmac_sha256:anchor?.checkpoint?.checkpoint_hmac_sha256??null,
        key_name:anchor?.checkpoint?.key_name??null,
        source_proof_sha256:sourceProofSha||null,
        anchored_at:anchoredAt,
        last_verified_at:lastVerifiedAt,
        verification_count:Number(anchor?.external_anchor?.verification_count??0)||null
      },
      comparison:{
        roots_match:Boolean(currentRoot&&externalRoot&&currentRoot===externalRoot),
        anchor_is_older_checkpoint:Boolean(Number.isFinite(anchorCheckpointMs)&&Number.isFinite(currentCheckpointMs)&&anchorCheckpointMs<currentCheckpointMs),
        expected_schedule_gap_minutes:5
      },
      governance:{
        second_system_timestamp:true,
        public_key_signature:false,
        external_anchor_can_grant_capital:false,
        stale_or_mismatch_fails_closed:true,
        capital_permission:'0R'
      },
      truth_label:'GITHUB_SECOND_SYSTEM_CHECKPOINT_ANCHOR_WITH_REVERIFICATION_HEARTBEAT_NOT_PUBLIC_KEY_DIGITAL_SIGNATURE'
    };
  })();

  const dataQuality=safe(quality.body?.state);
  if(dataQuality==='PASS' && liquidity.body?.state?.phase==='DATA_GATED'){
    await pause(250);
    const retry=await read(`/api/gold-liquidity-state-machine?brief_retry=${Date.now()}`,10000);
    if(retry.ok && retry.body?.state?.phase && retry.body.state.phase!=='DATA_GATED') liquidity=retry;
  }

  const phase=safe(liquidity.body?.state?.phase,confluence.body?.intraday?.phase??day.body?.day_state?.day_state);
  const price=liquidity.body?.price??confluence.body?.price??day.body?.current?.price??null;
  const breakoutState=safe(breakout.body?.dominant_state);
  const mtf=safe(zones.body?.composite?.state,confluence.body?.multi_timeframe?.state);
  const confluenceGated=confluence.body?.intraday?.phase==='DATA_GATED';
  const tension=confluenceGated?'CONFLUENCE_RECHECK_PENDING':safe(confluence.body?.confluence?.tension);
  const runtimeRestricted=quota.body?.restricted===true;
  const consensus=safe(tournament.body?.tournament?.consensus);
  const below=confluence.body?.confluence?.nearest_below_cluster??null;
  const above=confluence.body?.confluence?.nearest_above_cluster??null;
  const marketBreadthState=marketBreadth(marketAssets);

  const [worldGdp,worldInflation,nigeriaGdp,nigeriaInflation,ssaGdp,usdNgn]=macroEvidence;
  const pp=(a,b)=>a?.ok&&b?.ok&&a?.value!==null&&b?.value!==null?Number((a.value-b.value).toFixed(2)):null;
  const macroPulse={
    structural:[worldGdp,worldInflation,nigeriaGdp,nigeriaInflation,ssaGdp],
    market_proxy:usdNgn,
    comparisons:{
      nigeria_growth_vs_world_pp:pp(nigeriaGdp,worldGdp),
      nigeria_inflation_vs_world_pp:pp(nigeriaInflation,worldInflation),
      ssa_growth_vs_world_pp:pp(ssaGdp,worldGdp)
    },
    truth_label:'OFFICIAL_STRUCTURAL_DATA_PLUS_SEPARATE_MARKET_PROXY',
    note:'World Bank values are annual structural observations, not current-month estimates.'
  };
  const [
    internetUsers,rdSpend,renewableOutput,residentPatents,
    nvda,botz,icln,btcTrend,
    aiResearch,roboticsResearch,crypto
  ]=trendEvidence;
  const trendStructural=[internetUsers,rdSpend,renewableOutput,residentPatents];
  const trendResearch=[aiResearch,roboticsResearch];
  const trendProxies=[nvda,botz,icln,btcTrend];
  const usableTrendProxies=trendProxies.filter(x=>x?.ok&&['FRESH','DELAYED'].includes(x?.freshness));
  const trendUp=usableTrendProxies.filter(x=>x.direction==='UP').length;
  const trendDown=usableTrendProxies.filter(x=>x.direction==='DOWN').length;
  const trendFlat=usableTrendProxies.filter(x=>x.direction==='FLAT').length;
  const trendAttentionState=usableTrendProxies.length<2
    ? 'LIMITED_FRESH_SIGNAL'
    : trendUp>trendDown?'PROXY_BREADTH_POSITIVE'
      : trendDown>trendUp?'PROXY_BREADTH_NEGATIVE':'PROXY_BREADTH_MIXED';
  const trendsPulse={
    structural:trendStructural,
    research:trendResearch,
    market_proxies:trendProxies,
    digital_assets:crypto,
    proxy_attention:{
      state:trendAttentionState,
      usable:usableTrendProxies.length,
      total:trendProxies.length,
      up:trendUp,
      down:trendDown,
      flat:trendFlat
    },
    truth_label:'STRUCTURAL_ADOPTION_PLUS_RESEARCH_ACTIVITY_PLUS_MARKET_ATTENTION_PLUS_DIGITAL_ASSET_BREADTH',
    note:'Structural adoption, research activity, market attention and digital-asset breadth are separate evidence classes. Research activity is not momentum; market prices are not adoption proof.'
  };

  const [nominal10y,real10y]=ratesEvidence;
  const nominalMap=new Map((nominal10y?.observations||[]).map(r=>[r.date,r.value]));
  const realMap=new Map((real10y?.observations||[]).map(r=>[r.date,r.value]));
  const commonDates=[...nominalMap.keys()].filter(d=>realMap.has(d)).sort();
  const commonDate=commonDates.at(-1)??null;
  const priorCommonDate=commonDates.at(-2)??null;
  const commonNominal=commonDate?nominalMap.get(commonDate):null;
  const commonReal=commonDate?realMap.get(commonDate):null;
  const priorNominal=priorCommonDate?nominalMap.get(priorCommonDate):null;
  const priorReal=priorCommonDate?realMap.get(priorCommonDate):null;
  const commonBreakeven=commonNominal!==null&&commonNominal!==undefined&&commonReal!==null&&commonReal!==undefined
    ?Number((commonNominal-commonReal).toFixed(2)):null;
  const priorBreakeven=priorNominal!==null&&priorNominal!==undefined&&priorReal!==null&&priorReal!==undefined
    ?Number((priorNominal-priorReal).toFixed(2)):null;
  const breakeven10y=commonDate?{
    ok:true,label:'10Y breakeven inflation',date:commonDate,value:commonBreakeven,
    prior_date:priorCommonDate,prior_value:priorBreakeven,
    source:'Derived: U.S. Treasury nominal 10Y minus Treasury real 10Y',
    truth_label:'DERIVED_SAME_DATE_NOMINAL_MINUS_REAL'
  }:{ok:false,label:'10Y breakeven inflation',state:'UNAVAILABLE',source:'Derived from U.S. Treasury curves'};
  const bps=(a,b)=>a!==null&&a!==undefined&&b!==null&&b!==undefined?Number(((a-b)*100).toFixed(1)):null;
  const realImpulse=bps(commonReal,priorReal);
  const nominalImpulse=bps(commonNominal,priorNominal);
  const breakevenImpulse=bps(commonBreakeven,priorBreakeven);
  const realYieldState=realImpulse===null?'WITHHELD':realImpulse>=5?'REAL_YIELD_TIGHTENING':realImpulse<=-5?'REAL_YIELD_EASING':'REAL_YIELD_STABLE';
  const auctionState=treasuryFunding?.summary?.state??'UNAVAILABLE';
  const fundingWatch=auctionState==='BROAD_DEMAND_SOFTENING'&&realYieldState==='REAL_YIELD_TIGHTENING'
    ?'RATES_AND_AUCTION_PRESSURE_WATCH'
    :auctionState==='BROAD_DEMAND_SOFTENING'?'AUCTION_DEMAND_SOFTENING_WATCH'
      :realYieldState==='REAL_YIELD_TIGHTENING'?'REAL_YIELD_TIGHTENING':'NO_BROAD_PRESSURE_SIGNAL';
  const ratesFundingPulse={
    rates:{
      nominal_10y:nominal10y,real_10y:real10y,breakeven_10y:breakeven10y,
      aligned_date:commonDate,prior_aligned_date:priorCommonDate,
      aligned_values:{nominal_10y:commonNominal,real_10y:commonReal,breakeven_10y:commonBreakeven},
      daily_change_bps:{nominal:nominalImpulse,real:realImpulse,breakeven:breakevenImpulse},
      decomposition_gap_bps:commonNominal!==null&&commonReal!==null&&commonBreakeven!==null?Number(((commonNominal-commonReal-commonBreakeven)*100).toFixed(1)):null,
      state:realYieldState
    },
    treasury_funding:treasuryFunding,
    composite:{state:fundingWatch},
    truth_label:'US_TREASURY_RATE_DECOMPOSITION_PLUS_OFFICIAL_AUCTION_DEMAND',
    note:'Nominal and real yields come from official U.S. Treasury daily curves. Breakeven is the same-date nominal-minus-real difference. Auction demand is descriptive and does not by itself establish systemic funding stress.'
  };

  const [vix,gvz,vvix,skew]=volEvidence;
  const volScale=gvz?.ok&&typeof gvz.value==='number'?gvz.value:null;
  const oneDayPct=volScale!==null?Number((volScale/Math.sqrt(252)).toFixed(2)):null;
  const oneWeekPct=volScale!==null?Number((volScale*Math.sqrt(5/252)).toFixed(2)):null;
  const goldOneDay=oneDayPct!==null&&price!==null?Number((price*oneDayPct/100).toFixed(1)):null;
  const goldOneWeek=oneWeekPct!==null&&price!==null?Number((price*oneWeekPct/100).toFixed(1)):null;
  const compositeVolState=gvz?.regime==='EXTREME'?'GOLD_VOL_EXTREME':
    gvz?.regime==='ELEVATED'?'GOLD_VOL_ELEVATED':
      vvix?.regime==='EXTREME'||vvix?.regime==='ELEVATED'?'VOL_OF_VOL_ELEVATED':
        vix?.regime==='EXTREME'||vix?.regime==='ELEVATED'?'EQUITY_VOL_ELEVATED':
          'VOLATILITY_NORMAL_OR_SUPPRESSED';
  const volatilityIntelligence={
    indices:{vix,gvz,vvix,skew},
    gold_volatility_scale:{
      annualized_pct:volScale,
      one_day_pct:oneDayPct,
      one_week_pct:oneWeekPct,
      one_day_gold_price_units:goldOneDay,
      one_week_gold_price_units:goldOneWeek,
      reference_gold_price:price,
      methodology:'GVZ annualized implied volatility divided by sqrt(252); weekly scale uses sqrt(5/252). Applied to Gold shadow price only as an approximate magnitude scale.',
      truth_label:'VOLATILITY_SCALE_NOT_DIRECTIONAL_PROBABILITY'
    },
    composite:{state:compositeVolState},
    unavailable:{
      dealer_gamma:'WITHHELD_NO_VERIFIED_STRIKE_LEVEL_DEALER_POSITIONING',
      gold_skew:'WITHHELD_NO_VERIFIED_GOLD_STRIKE_LEVEL_SKEW_FEED',
      gold_term_structure:'WITHHELD_NO_VERIFIED_GOLD_EXPIRY_CURVE_FEED',
      options_implied_direction_probability:'WITHHELD_NEEDS_STRIKE_LEVEL_OPTIONS_DISTRIBUTION'
    },
    truth_label:'OFFICIAL_CBOE_OPTIONS_DERIVED_VOLATILITY_INDICES',
    note:'VIX, GVZ, VVIX and SKEW describe different options markets. GVZ supplies a Gold ETF volatility scale; SKEW is an equity tail-risk index. None of these alone provides Gold direction probability or dealer gamma.'
  };

  const forecastHorizons=Array.isArray(forecastErrorState?.horizons)?forecastErrorState.horizons:[];
  const executionDelays=Array.isArray(executionQualityState?.delays)?executionQualityState.delays:[];
  const forecastThreshold=Number(forecastErrorState?.sample_policy?.minimum_nonflat_sample_for_public_accuracy??20);
  const latencyThreshold=Number(executionQualityState?.sample_policy?.minimum_sample_for_stable_latency_estimate??30);
  const maxForecastSample=forecastHorizons.reduce((m,h)=>Math.max(m,Number(h?.nonflat_sample??0)),0);
  const maxLatencySample=executionDelays.reduce((m,h)=>Math.max(m,Number(h?.sample_size??0)),0);
  const forecastMature=forecastHorizons.length>0&&forecastHorizons.every(h=>Number(h?.nonflat_sample??0)>=forecastThreshold);
  const latencyMature=executionDelays.length>0&&executionDelays.every(h=>Number(h?.sample_size??0)>=latencyThreshold);
  const learningState=forecastErrorState?.ok&&executionQualityState?.ok
    ? (forecastMature&&latencyMature?'MATURE_REVIEW_READY':'CLOSED_LOOP_EARLY_SAMPLE')
    : 'LEARNING_EVIDENCE_GATED';
  const freshnessModule=(id,sourceMode,observedAt,expiresAt,fallbackAgeMinutes,ok=true)=>{
    const mode=String(sourceMode??'EVIDENCE_GATED');
    if(!ok||mode==='EVIDENCE_GATED')return {id,state:'EVIDENCE_GATED',source_mode:mode,observed_at:observedAt??null,expires_at:expiresAt??null,age_minutes:fallbackAgeMinutes??null,remaining_minutes:null};
    if(mode==='GITHUB_EXTERNAL_ANCHOR'){
      const expiryMs=Date.parse(expiresAt??'');
      const remaining=Number.isFinite(expiryMs)?Math.max(0,(expiryMs-Date.now())/60000):0;
      const age=Number(fallbackAgeMinutes??0);
      return {id,state:remaining>0?'LIVE':'EVIDENCE_GATED',source_mode:mode,observed_at:observedAt??null,expires_at:expiresAt??null,age_minutes:Number(age.toFixed(1)),remaining_minutes:Number(remaining.toFixed(1))};
    }
    if(mode!=='VERIFIED_SNAPSHOT_FALLBACK')return {id,state:'LIVE',source_mode:mode,observed_at:observedAt??null,expires_at:null,age_minutes:null,remaining_minutes:null};
    const expiryMs=Date.parse(expiresAt??'');
    const remaining=Number.isFinite(expiryMs)?Math.max(0,(expiryMs-Date.now())/60000):0;
    const age=Number(fallbackAgeMinutes??0);
    const life=Math.max(1,age+remaining);
    const used=age/life;
    const state=remaining<=0?'EVIDENCE_GATED':used>=0.8?'SURVIVOR_CRITICAL':used>=0.5?'SURVIVOR_AGING':'SURVIVOR_FRESH';
    return {id,state,source_mode:mode,observed_at:observedAt??null,expires_at:expiresAt??null,age_minutes:Number(age.toFixed(1)),remaining_minutes:Number(remaining.toFixed(1)),life_used_pct:Number((used*100).toFixed(1))};
  };
  const evidenceFreshnessModules=[
    freshnessModule('V96_V97_ACCOUNTABILITY',accountabilitySourceMode,accountabilityObservedAt,accountabilitySourceMode==='VERIFIED_SNAPSHOT_FALLBACK'?new Date(Date.parse(QUANT_SURVIVOR_CAPTURED_AT)+QUANT_SURVIVOR_MAX_AGE_MS).toISOString():null,accountabilityFallbackAgeMinutes,Boolean(forecastErrorState?.ok&&executionQualityState?.ok)),
    freshnessModule('V101_SETTLEMENT',settlementSourceMode,settlementObservedAt,settlementFallbackExpiresAt,settlementFallbackAgeMinutes,Boolean(forecastSettlementState?.ok)),
    freshnessModule('V102_BENCHMARK',benchmarkSourceMode,benchmarkObservedAt,benchmarkFallbackExpiresAt,benchmarkFallbackAgeMinutes,Boolean(benchmarkReputationState?.ok)),
    freshnessModule('V103_CALIBRATION_STRUCTURE',calibrationStructureSourceMode,calibrationStructureObservedAt,calibrationStructureFallbackExpiresAt,calibrationStructureFallbackAgeMinutes,Boolean(calibrationStructureState?.ok)),
    freshnessModule('V98_V99_RISK_STACK',riskStackSourceMode,riskStackObservedAt,riskStackFallbackExpiresAt,riskStackFallbackAgeMinutes,Boolean(scenarioEvState?.ok&&portfolioRiskState?.ok)),
    freshnessModule('V104_FORECAST_COVERAGE',forecastCoverageSourceMode,forecastCoverageObservedAt,forecastCoverageFallbackExpiresAt,forecastCoverageFallbackAgeMinutes,Boolean(forecastCoverageState?.ok)),
    freshnessModule('V107_PROVENANCE_RECEIPT_LEDGER',receiptLedgerSourceMode,receiptLedgerObservedAt,receiptLedgerFallbackExpiresAt,receiptLedgerFallbackAgeMinutes,Boolean(provenanceReceiptState?.ok)),
    freshnessModule('V108_SERVER_ATTESTATION',attestationSourceMode,attestationObservedAt,attestationFallbackExpiresAt,attestationFallbackAgeMinutes,Boolean(provenanceAttestationState?.ok)),
    freshnessModule('V109_KEY_LIFECYCLE',keyLifecycleSourceMode,keyLifecycleObservedAt,keyLifecycleFallbackExpiresAt,keyLifecycleFallbackAgeMinutes,Boolean(keyLifecycleState?.ok)),
    freshnessModule('V110_GLOBAL_CHECKPOINT',checkpointSourceMode,checkpointObservedAt,checkpointFallbackExpiresAt,checkpointFallbackAgeMinutes,Boolean(checkpointState?.ok)),
    freshnessModule('V112_EXTERNAL_ANCHOR_HEARTBEAT','GITHUB_EXTERNAL_ANCHOR',externalAnchorState.last_verified_at,externalAnchorState.freshness_expires_at,externalAnchorState.age_minutes,Boolean(externalAnchorState.ok))
  ];
  const freshnessCounts={
    total:evidenceFreshnessModules.length,
    live:evidenceFreshnessModules.filter(x=>x.state==='LIVE').length,
    survivor_fresh:evidenceFreshnessModules.filter(x=>x.state==='SURVIVOR_FRESH').length,
    survivor_aging:evidenceFreshnessModules.filter(x=>x.state==='SURVIVOR_AGING').length,
    survivor_critical:evidenceFreshnessModules.filter(x=>x.state==='SURVIVOR_CRITICAL').length,
    evidence_gated:evidenceFreshnessModules.filter(x=>x.state==='EVIDENCE_GATED').length
  };
  const expiring=evidenceFreshnessModules.filter(x=>typeof x.remaining_minutes==='number'&&x.remaining_minutes>=0).sort((a,b)=>a.remaining_minutes-b.remaining_minutes);
  const evidenceFreshnessState=freshnessCounts.evidence_gated>0?'EVIDENCE_GATED'
    :freshnessCounts.survivor_critical>0?'SURVIVOR_CRITICAL'
      :freshnessCounts.survivor_aging>0?'SURVIVOR_AGING'
        :(freshnessCounts.survivor_fresh>0?'SURVIVOR_FRESH':'LIVE');
  const evidenceFreshness={
    ok:freshnessCounts.evidence_gated===0,
    version:'v105-evidence-freshness-survivor-resilience-v1',
    state:evidenceFreshnessState,
    counts:freshnessCounts,
    modules:evidenceFreshnessModules,
    next_expiry:expiring[0]??null,
    governance:{
      freshness_can_grant_capital:false,
      freshness_can_only_preserve_or_reduce_permission:true,
      stale_or_missing_evidence_fails_closed:true,
      capital_permission:'0R'
    },
    truth_label:'RUNTIME_EVIDENCE_FRESHNESS_AND_FALLBACK_RESILIENCE_NOT_MODEL_PERFORMANCE'
  };

  const provenanceManifestSources=[
    {id:'V96_V97_ACCOUNTABILITY',source_rpc:['get_v96_forecast_error_state','get_v97_execution_quality_state'],source_mode:accountabilitySourceMode,captured_at:accountabilityObservedAt,truth_label:'EMPIRICAL_FORECAST_ERROR_PLUS_EXECUTION_LATENCY_PROXY',payload:{forecast_error:forecastErrorState,execution_latency:executionQualityState}},
    {id:'V101_SETTLEMENT',source_rpc:['get_v101_forecast_settlement_state'],source_mode:settlementSourceMode,captured_at:settlementObservedAt,truth_label:forecastSettlementState?.truth_label??null,payload:forecastSettlementState},
    {id:'V102_BENCHMARK',source_rpc:['get_v102_benchmark_reputation_state'],source_mode:benchmarkSourceMode,captured_at:benchmarkObservedAt,truth_label:benchmarkReputationState?.truth_label??null,payload:benchmarkReputationState},
    {id:'V103_CALIBRATION_STRUCTURE',source_rpc:['get_v103_calibration_structure_state'],source_mode:calibrationStructureSourceMode,captured_at:calibrationStructureObservedAt,truth_label:calibrationStructureState?.truth_label??null,payload:calibrationStructureState},
    {id:'V98_V99_RISK_STACK',source_rpc:['get_v98_scenario_ev_state','get_v99_portfolio_risk_readiness'],source_mode:riskStackSourceMode,captured_at:riskStackObservedAt,truth_label:'RESEARCH_EV_PLUS_PORTFOLIO_RISK_READINESS',payload:{scenario_ev:scenarioEvState,portfolio_risk:portfolioRiskState}},
    {id:'V104_FORECAST_COVERAGE',source_rpc:['get_v104_forecast_coverage_governance_state'],source_mode:forecastCoverageSourceMode,captured_at:forecastCoverageObservedAt,truth_label:forecastCoverageState?.truth_label??null,payload:forecastCoverageState}
  ];
  const provenanceFingerprints=await Promise.all(provenanceManifestSources.map(async source=>({
    id:source.id,
    source_rpc:source.source_rpc,
    source_mode:source.source_mode,
    captured_at:source.captured_at??null,
    truth_label:source.truth_label,
    algorithm:'SHA-256',
    payload_scope:'PUBLIC_SAFE_AGGREGATE',
    sha256:await sha256Hex(source.payload)
  })));
  const fingerprintedCount=provenanceFingerprints.filter(x=>typeof x.sha256==='string'&&x.sha256.length===64).length;
  const provenanceIntegrityState=fingerprintedCount===provenanceFingerprints.length?'ALL_FINGERPRINTED'
    :fingerprintedCount>0?'PARTIAL_FINGERPRINT_COVERAGE':'HASH_RUNTIME_UNAVAILABLE';
  const provenanceManifest={
    ok:fingerprintedCount===provenanceFingerprints.length,
    version:'v106-snapshot-integrity-provenance-v1',
    state:provenanceIntegrityState,
    algorithm:'SHA-256',
    fingerprints:provenanceFingerprints,
    counts:{total:provenanceFingerprints.length,fingerprinted:fingerprintedCount,unfingerprinted:provenanceFingerprints.length-fingerprintedCount},
    governance:{
      fingerprints_are_content_addresses:true,
      fingerprints_are_not_digital_signatures:true,
      provenance_can_grant_capital:false,
      missing_fingerprint_fails_integrity_gate:true,
      capital_permission:'0R'
    },
    truth_label:'CONTENT_ADDRESSED_PUBLIC_SAFE_EVIDENCE_PROVENANCE_NOT_AUTHOR_SIGNATURE'
  };

  const quantAccountability={
    state:learningState,
    source_mode:accountabilitySourceMode,
    observed_at:accountabilityObservedAt,
    fallback_age_minutes:accountabilityFallbackAgeMinutes,
    fallback_expires_at:accountabilitySourceMode==='VERIFIED_SNAPSHOT_FALLBACK'?new Date(Date.parse(QUANT_SURVIVOR_CAPTURED_AT)+QUANT_SURVIVOR_MAX_AGE_MS).toISOString():null,
    forecast_error:forecastErrorState,
    execution_latency:executionQualityState,
    settlement_readiness:forecastSettlementState,
    settlement_source_mode:settlementSourceMode,
    settlement_observed_at:settlementObservedAt,
    settlement_fallback_age_minutes:settlementFallbackAgeMinutes,
    settlement_fallback_expires_at:settlementFallbackExpiresAt,
    benchmark_reputation:benchmarkReputationState,
    benchmark_source_mode:benchmarkSourceMode,
    benchmark_observed_at:benchmarkObservedAt,
    benchmark_fallback_age_minutes:benchmarkFallbackAgeMinutes,
    benchmark_fallback_expires_at:benchmarkFallbackExpiresAt,
    calibration_structure:calibrationStructureState,
    calibration_structure_source_mode:calibrationStructureSourceMode,
    calibration_structure_observed_at:calibrationStructureObservedAt,
    calibration_structure_fallback_age_minutes:calibrationStructureFallbackAgeMinutes,
    calibration_structure_fallback_expires_at:calibrationStructureFallbackExpiresAt,
    scenario_ev:scenarioEvState,
    portfolio_risk:portfolioRiskState,
    risk_stack_source_mode:riskStackSourceMode,
    risk_stack_observed_at:riskStackObservedAt,
    risk_stack_fallback_age_minutes:riskStackFallbackAgeMinutes,
    risk_stack_fallback_expires_at:riskStackFallbackExpiresAt,
    forecast_coverage:forecastCoverageState,
    forecast_coverage_source_mode:forecastCoverageSourceMode,
    forecast_coverage_observed_at:forecastCoverageObservedAt,
    forecast_coverage_fallback_age_minutes:forecastCoverageFallbackAgeMinutes,
    forecast_coverage_fallback_expires_at:forecastCoverageFallbackExpiresAt,
    evidence_freshness:evidenceFreshness,
    provenance_manifest:provenanceManifest,
    provenance_receipt_ledger:provenanceReceiptState,
    provenance_receipt_source_mode:receiptLedgerSourceMode,
    provenance_receipt_observed_at:receiptLedgerObservedAt,
    provenance_receipt_fallback_age_minutes:receiptLedgerFallbackAgeMinutes,
    provenance_receipt_fallback_expires_at:receiptLedgerFallbackExpiresAt,
    provenance_attestation:provenanceAttestationState,
    provenance_attestation_source_mode:attestationSourceMode,
    provenance_attestation_observed_at:attestationObservedAt,
    provenance_attestation_fallback_age_minutes:attestationFallbackAgeMinutes,
    provenance_attestation_fallback_expires_at:attestationFallbackExpiresAt,
    attestation_key_lifecycle:keyLifecycleState,
    attestation_key_lifecycle_source_mode:keyLifecycleSourceMode,
    attestation_key_lifecycle_observed_at:keyLifecycleObservedAt,
    attestation_key_lifecycle_fallback_age_minutes:keyLifecycleFallbackAgeMinutes,
    attestation_key_lifecycle_fallback_expires_at:keyLifecycleFallbackExpiresAt,
    provenance_checkpoint:checkpointState,
    provenance_checkpoint_source_mode:checkpointSourceMode,
    provenance_checkpoint_observed_at:checkpointObservedAt,
    provenance_checkpoint_fallback_age_minutes:checkpointFallbackAgeMinutes,
    provenance_checkpoint_fallback_expires_at:checkpointFallbackExpiresAt,
    external_anchor:externalAnchorState,
    publication_gates:{
      public_accuracy:forecastMature?'REVIEW_READY':'WITHHELD',
      forecast_threshold:forecastThreshold,
      max_nonflat_sample:maxForecastSample,
      latency_stability:latencyMature?'REVIEW_READY':'EARLY_SAMPLE',
      latency_threshold:latencyThreshold,
      max_latency_sample:maxLatencySample,
      brier:forecastSettlementState?.brier_publication_state??'WITHHELD_PENDING_RESOLVED_PROBABILITY_OUTCOMES',
      capital_permission:'0R',
      learning_state:learningState,
      brier_state:forecastSettlementState?.brier_publication_state??'WITHHELD_PENDING_RESOLVED_PROBABILITY_OUTCOMES',
      signal_reputation:benchmarkReputationState?.signal_reputation_state??'WITHHELD',
      forecast_coverage:forecastCoverageState?.coverage_gates?.generalization_readiness??'WITHHELD',
      evidence_freshness:evidenceFreshnessState,
      provenance_integrity:provenanceIntegrityState,
      provenance_receipt_chain:provenanceReceiptState?.state??'WITHHELD',
      server_attestation:provenanceAttestationState?.state??'WITHHELD',
      attestation_key_lifecycle:keyLifecycleState?.state??'WITHHELD',
      provenance_checkpoint:checkpointState?.state??'WITHHELD',
      external_anchor:externalAnchorState.root_state,
      external_anchor_heartbeat:externalAnchorState.heartbeat_state
    },
    truth_label:'EMPIRICAL_FORECAST_ERROR_PLUS_EXECUTION_LATENCY_PROXY',
    note:'Observed learning evidence is descriptive and sample-gated. Execution latency is a signal-to-later-price proxy, not realized broker slippage, spread, commission, market impact or fill quality.'
  };

  const changeParts=[];
  if(price!==null)changeParts.push(`Gold shadow proxy ${Number(price).toFixed(1)}`);
  changeParts.push(label(phase));
  if(breakoutState!=='WITHHELD')changeParts.push(label(breakoutState));
  if(mtf!=='WITHHELD')changeParts.push(label(mtf));

  const desks=[
    {id:'macro',name:'MACRO & WORLD ECONOMY',state:'RATES + MACRO LIVE',detail:`10Y real ${commonReal??'n/a'}% · breakeven ${commonBreakeven??'n/a'}% · ${fundingWatch.replaceAll('_',' ')}`,href:'/world-economy/'},
    {id:'markets',name:'GLOBAL MARKETS',state:dataQuality==='PASS'&&phase!=='DATA_GATED'&&phase!=='WITHHELD'?'LIVE + VOL':'EVIDENCE-GATED',detail:`${label(phase)} · ${label(breakoutState)} · ${compositeVolState.replaceAll('_',' ')}`,href:'/live-markets/'},
    {id:'flows',name:'FLOWS & POSITIONING',state:cotGold?.ok?'COT VERIFIED':'EVIDENCE-GATED',detail:cotGold?.ok?`Gold COT ${String(cotGold.report_date).slice(0,10)} · Managed net ${cotGold.groups?.[0]?.net?.toLocaleString?.()??'n/a'}`:'COT · systematic flows · seasonality · money flow',href:'/live-markets/'},
    {id:'quant',name:'QUANT & CALIBRATION',state:forecastErrorState?.ok&&executionQualityState?.ok&&forecastSettlementState?.ok&&benchmarkReputationState?.ok&&forecastCoverageState?.ok?'EVIDENCE LEARNING':'EVIDENCE-GATED',detail:`V96 errors · V97 latency · V101 settlement · V102 ${String(benchmarkReputationState?.benchmark_state??'gated').replaceAll('_',' ')} · V104 ${String(forecastCoverageState?.coverage_gates?.generalization_readiness??'gated').replaceAll('_',' ')} · V105 ${String(evidenceFreshnessState).replaceAll('_',' ')} · V106 ${String(provenanceIntegrityState).replaceAll('_',' ')} · V110 ${String(checkpointState?.state??'gated').replaceAll('_',' ')} · V111 ${String(externalAnchorState.root_state).replaceAll('_',' ')} · V112 ${String(externalAnchorState.heartbeat_state).replaceAll('_',' ')} · accuracy ${forecastMature?'review-ready':'withheld'}`,href:'/status/'},
    {id:'risk',name:'RISK & PORTFOLIO',state:portfolioRiskState?.ok?'OBSERVATION ONLY · 0R':'EVIDENCE-GATED',detail:portfolioRiskState?.ok?`${portfolioRiskState.blockers?.length??0} active blockers · multi-asset ${portfolioRiskState.multi_asset_portfolio_ready?'ready':'not calibrated'} · capital 0R`:'Risk readiness unavailable',href:'/status/'},
    {id:'solutions',name:'TRENDS & SOLUTIONS',state:'EVIDENCE PULSE',detail:`${trendStructural.filter(x=>x?.ok).length}/4 structural · ${trendResearch.filter(x=>x?.ok).length}/2 research feeds · ${usableTrendProxies.length}/4 fresh proxies`,href:'/global-trends/'}
  ];

  const engines=[
    ['WHAT CHANGED?™','ACTIVE','Decision compression'],
    ['Day-State / Lifecycle','ACTIVE',label(day.body?.day_state?.day_state)],
    ['Multi-Timeframe State Machine','ACTIVE',label(phase)],
    ['Breakout Quality','ACTIVE',label(breakoutState)],
    ['False-Breakout Detector','ACTIVE',safe(breakout.body?.downside?.false_breakout_risk,'MONITORING')],
    ['Liquidity Heat Map','ACTIVE',below&&above?`${below.center} ↔ ${above.center}`:'WITHHELD'],
    ['CRT / AMD','FRAMEWORK','Evidence-gated structure engine'],
    ['SMC / FVG / Order Blocks','FRAMEWORK','Proxy layer only where data supports it'],
    ['COT / Institutional Positioning',cotGold?.ok?'ACTIVE':'EVIDENCE-GATED',cotGold?.ok?`Gold report ${String(cotGold.report_date).slice(0,10)} · official weekly CFTC`:'No fabricated positioning'],
    ['Seasonality & Cycles',seasonality?.ok?'ACTIVE':'EVIDENCE-GATED',seasonality?.ok?`${seasonality.month.label} ${seasonality.month.state.replaceAll('_',' ')} · ${seasonality.quarter.label} ${seasonality.quarter.state.replaceAll('_',' ')}`:'Historical context unavailable'],
    ['Forecast Ledger','ACTIVE',forecastErrorState?.ok?`V96 error reviews live · max non-flat n ${maxForecastSample}/${forecastThreshold}`:'Learning review unavailable'],
    ['Signal Reputation',benchmarkReputationState?.signal_reputation_state==='WITHHELD_SAMPLE_TOO_SMALL'?'LEARNING':'ACTIVE',benchmarkReputationState?.ok?`${String(benchmarkReputationState.signal_reputation_state??'WITHHELD').replaceAll('_',' ')} · ${benchmarkReputationState.counts?.reputation_sample_reached??0}/${benchmarkReputationState.counts?.models??0} models at reputation sample`:'Evidence gated'],
    ['Benchmark / Baseline Comparison',benchmarkReputationState?.ok?'ACTIVE':'EVIDENCE-GATED',benchmarkReputationState?.ok?`${benchmarkReputationState.benchmark_policy?.baseline_name??'NO_SKILL_50'} ${benchmarkReputationState.benchmark_policy?.baseline_accuracy_pct??50}% · ${benchmarkReputationState.counts?.human_review_eligible??0} human-review eligible · ${String(benchmarkReputationState.benchmark_state??'WITHHELD').replaceAll('_',' ')}`:'Benchmark evidence unavailable'],
    ['Calibration Structure',calibrationStructureState?.ok?'ACTIVE':'EVIDENCE-GATED',calibrationStructureState?.ok?`${calibrationStructureState.ledger?.total??0} forecasts · avg p ${calibrationStructureState.ledger?.average_probability??'n/a'}% · ${String(calibrationStructureState.concentration?.direction_state??'WITHHELD').replaceAll('_',' ')} · ${String(calibrationStructureState.concentration?.horizon_state??'WITHHELD').replaceAll('_',' ')}`:'Calibration structure unavailable'],
    ['Forecast Coverage Governance',forecastCoverageState?.ok?'ACTIVE':'EVIDENCE-GATED',forecastCoverageState?.ok?`${String(forecastCoverageState.coverage_gates?.direction_coverage??'WITHHELD').replaceAll('_',' ')} · ${String(forecastCoverageState.coverage_gates?.horizon_coverage??'WITHHELD').replaceAll('_',' ')} · ${String(forecastCoverageState.coverage_gates?.confidence_band_coverage??'WITHHELD').replaceAll('_',' ')} · ${String(forecastCoverageState.coverage_gates?.generalization_readiness??'WITHHELD').replaceAll('_',' ')}`:'Coverage evidence unavailable'],
    ['Evidence Freshness & Survivor Resilience',evidenceFreshness.ok?'ACTIVE':'EVIDENCE-GATED',`${String(evidenceFreshness.state).replaceAll('_',' ')} · ${freshnessCounts.live} live · ${freshnessCounts.survivor_fresh+freshnessCounts.survivor_aging+freshnessCounts.survivor_critical} fallback · ${freshnessCounts.evidence_gated} gated · next expiry ${evidenceFreshness.next_expiry?.remaining_minutes??'n/a'}m`],
    ['Autonomous Health Orchestrator','ACTIVE','Critical-lane health · retry recovery · degradation isolation · fail-closed governance · no capital authority'],
    ['Snapshot Integrity & Provenance',provenanceManifest.ok?'ACTIVE':'EVIDENCE-GATED',`${String(provenanceIntegrityState).replaceAll('_',' ')} · ${fingerprintedCount}/${provenanceFingerprints.length} SHA-256 fingerprints · content address, not signature`],
    ['Provenance Receipt Ledger',provenanceReceiptState?.ok?'ACTIVE':'EVIDENCE-GATED',provenanceReceiptState?.ok?`${String(provenanceReceiptState.state??'WITHHELD').replaceAll('_',' ')} · ${provenanceReceiptState.counts?.receipts??0} receipts · ${provenanceReceiptState.counts?.modules??0} modules · hourly chain`:'Receipt ledger unavailable'],
    ['Server-Attested Provenance',provenanceAttestationState?.ok?'ACTIVE':'EVIDENCE-GATED',provenanceAttestationState?.ok?`${String(provenanceAttestationState.state??'WITHHELD').replaceAll('_',' ')} · ${provenanceAttestationState.counts?.verified_attestations??0}/${provenanceAttestationState.counts?.attestations??0} verified · Vault-backed HMAC · not public-key signature`:'Attestation evidence unavailable'],
    ['Attestation Key Lifecycle',keyLifecycleState?.ok?'ACTIVE':'EVIDENCE-GATED',keyLifecycleState?.ok?`${String(keyLifecycleState.state??'WITHHELD').replaceAll('_',' ')} · ${keyLifecycleState.counts?.keys??0} keys · ${keyLifecycleState.counts?.active_keys??0} active · ${keyLifecycleState.counts?.retired_keys??0} retired · history preserved`:'Key lifecycle unavailable'],
    ['Global Provenance Checkpoint',checkpointState?.ok?'ACTIVE':'EVIDENCE-GATED',checkpointState?.ok?`${String(checkpointState.state??'WITHHELD').replaceAll('_',' ')} · ${checkpointState.counts?.checkpoints??0} checkpoints · ${checkpointState.counts?.chain_link_failures??0} broken links · ${checkpointState.counts?.uncheckpointed_attestations??0} unattested heads · root ${String(checkpointState.latest_checkpoint?.checkpoint_sha256??'').slice(0,12)}…`:'Checkpoint evidence unavailable'],
    ['External GitHub Checkpoint Anchor',externalAnchorState.root_state==='MATCH'||externalAnchorState.root_state==='PENDING_NEWER_CHECKPOINT'?'ACTIVE':'EVIDENCE-GATED',`${String(externalAnchorState.root_state).replaceAll('_',' ')} · immutable anchor ${externalAnchorState.anchor_age_minutes??'n/a'}m old · root ${String(externalAnchorState.external_anchor?.checkpoint_sha256??'').slice(0,12)}… · second-system timestamp, not public-key signature`],
    ['External Anchor Verification Heartbeat',externalAnchorState.heartbeat_state==='FRESH'?'ACTIVE':'EVIDENCE-GATED',`${String(externalAnchorState.heartbeat_state).replaceAll('_',' ')} · last verified ${externalAnchorState.age_minutes??'n/a'}m ago · ${externalAnchorState.verification_count??'n/a'} independent checks · stale after 90m · cannot grant capital`],
    ['Forecast Error Attribution',forecastErrorState?.ok?'ACTIVE':'EVIDENCE-GATED',forecastErrorState?.ok?`${forecastHorizons.length} horizons · MFE/MAE integrity checks · public accuracy withheld`:'No verified review'],
    ['Execution Latency Quality',executionQualityState?.ok?'ACTIVE':'EVIDENCE-GATED',executionQualityState?.ok?`${executionDelays.length} delay buckets · max n ${maxLatencySample}/${latencyThreshold} · realized costs excluded`:'No verified review'],
    ['Forecast Settlement Readiness',forecastSettlementState?.ok?'ACTIVE':'EVIDENCE-GATED',forecastSettlementState?.ok?`${forecastSettlementState.counts?.publication_integrity_verified??0}/${forecastSettlementState.counts?.total??0} publications verified · nearest ${forecastSettlementState.days_to_nearest_horizon??'n/a'}d · ${String(forecastSettlementState.settlement_state??'WITHHELD').replaceAll('_',' ')}`:'Settlement evidence unavailable'],
    ['Brier Calibration',forecastSettlementState?.counts?.brier_scored>0?'ACTIVE':'GATED',String(forecastSettlementState?.brier_publication_state??'WITHHELD_NO_RESOLVED_OUTCOMES').replaceAll('_',' ')],
    ['Expected Value Engine',scenarioEvState?.ok?'LEARNING':'EVIDENCE-GATED',scenarioEvState?.ok?`Research proxy live · 60m ${scenarioEvState.horizons?.find?.(h=>h.horizon_minutes===60)?.empirical_ev_proxy_bps??'n/a'} bps · 120m ${scenarioEvState.horizons?.find?.(h=>h.horizon_minutes===120)?.empirical_ev_proxy_bps??'n/a'} bps · publication withheld`:'EV evidence unavailable'],
    ['Portfolio Risk',portfolioRiskState?.ok?'OBSERVATION ONLY':'EVIDENCE-GATED',portfolioRiskState?.ok?`${String(portfolioRiskState.state??'OBSERVATION_ONLY_0R').replaceAll('_',' ')} · ${portfolioRiskState.blockers?.length??0} blockers · multi-asset ${portfolioRiskState.multi_asset_portfolio_ready?'ready':'not ready'}`:'Risk readiness unavailable'],
    ['Source Provenance','ACTIVE','Evidence trail + immutable snapshots'],
    ['Freshness Decay','ACTIVE','Stale inputs fail closed'],
    ['Adventure Map','ACTIVE SURFACE','Kid-friendly regime storytelling'],
    ['Institutional Matrix','ACTIVE SURFACE','Professional command visualization'],
    ['Global Trends Evidence Pulse','ACTIVE','Structural adoption + research activity + market attention + digital-asset breadth'],
    ['Real Yield & Breakeven','ACTIVE',commonDate?`10Y real ${commonReal}% · breakeven ${commonBreakeven}% · ${commonDate}`:'WITHHELD'],
    ['Treasury Auction / Funding','ACTIVE',treasuryFunding?.latest?`${treasuryFunding.latest.term} BTC ${treasuryFunding.latest.bid_to_cover} · ${treasuryFunding.summary.state.replaceAll('_',' ')}`:'WITHHELD'],
    ['Options / Volatility Intelligence','ACTIVE',gvz?.ok?`GVZ ${gvz.value} · ${gvz.regime} · ${compositeVolState.replaceAll('_',' ')}`:'WITHHELD']
  ].map(([name,state,detail])=>({name,state,detail}));

  const checkpointProofRequested=String(req.query?.proof??'')==='checkpoint';
  if(checkpointProofRequested){
    const cp=checkpointState?.latest_checkpoint??{};
    res.setHeader('Cache-Control','public, max-age=20, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({
      ok:Boolean(checkpointState?.ok),
      version:'v111-external-anchor-proof-v1',
      generated_at:new Date().toISOString(),
      source:'THE_FATHER_ANALYTICS_PRODUCTION',
      source_mode:checkpointSourceMode,
      observed_at:checkpointObservedAt,
      fallback_age_minutes:checkpointFallbackAgeMinutes,
      fallback_expires_at:checkpointFallbackExpiresAt,
      state:checkpointState?.state??'EVIDENCE_GATED',
      checkpoint:{
        checkpoint_id:cp?.id??null,
        checkpointed_at:cp?.checkpointed_at??null,
        checkpoint_sha256:cp?.checkpoint_sha256??null,
        previous_checkpoint_sha256:cp?.previous_checkpoint_sha256??null,
        checkpoint_hmac_sha256:cp?.checkpoint_hmac_sha256??null,
        key_name:cp?.key_name??null,
        module_count:cp?.module_count??null,
        receipt_count:cp?.receipt_count??null,
        attestation_count:cp?.attestation_count??null,
        latest_receipt_at:cp?.latest_receipt_at??null,
        latest_attestation_at:cp?.latest_attestation_at??null
      },
      integrity:{
        checkpoints:checkpointState?.counts?.checkpoints??0,
        payload_hash_failures:checkpointState?.counts?.payload_hash_failures??0,
        hmac_failures:checkpointState?.counts?.hmac_failures??0,
        chain_link_failures:checkpointState?.counts?.chain_link_failures??0,
        missing_historical_keys:checkpointState?.counts?.missing_historical_keys??0,
        uncheckpointed_attestations:checkpointState?.counts?.uncheckpointed_attestations??0
      },
      governance:{
        external_anchor_input_only:true,
        public_key_signature:false,
        append_only_source:Boolean(checkpointState?.governance?.append_only),
        action_permitted:'WAIT',
        capital_permission:'0R'
      },
      truth_label:'PUBLIC_SAFE_V110_CHECKPOINT_PROOF_FOR_EXTERNAL_ANCHOR_NOT_PUBLIC_KEY_SIGNATURE'
    });
  }

  res.setHeader('Cache-Control','public, max-age=20, s-maxage=60, stale-while-revalidate=120');
  return res.status(200).json({
    ok:true,
    version:'v113-unified-intelligence-experience-v1',
    generated_at:new Date().toISOString(),
    truth_label:'PUBLIC_SAFE_MISSION_BRIEF',
    what_changed:{
      headline:changeParts.join(' · '),
      price,
      phase,
      breakout_state:breakoutState,
      model_consensus:consensus,
      multi_timeframe_state:mtf,
      confluence_tension:tension,
      data_quality:dataQuality,
      qa_state:'SEPARATE_CLIENT_CHANNEL',
      qa_score:null,
      canonical_runtime:runtimeRestricted?'RESTRICTED':'AVAILABLE',
      nearest_below:below,
      nearest_above:above
    },
    command_tape:[
      {label:'DATA QUALITY',value:dataQuality},
      {label:'AUTONOMOUS QA',value:'VERIFYING SEPARATELY'},
      {label:'AUTONOMOUS HEALTH',value:'VERIFYING SEPARATELY'},
      {label:'GOLD PHASE',value:label(phase)},
      {label:'BREAKOUT',value:label(breakoutState)},
      {label:'MODEL CONSENSUS',value:label(consensus)},
      {label:'MTF LOCATION',value:label(mtf)},
      {label:'CAPITAL',value:'WAIT · 0R'},
      {label:'RUNTIME',value:runtimeRestricted?'SURVIVOR MODE':'CANONICAL'}
    ],
    global_market_dashboard:{assets:marketAssets,breadth:marketBreadthState},
    macro_evidence_pulse:macroPulse,
    global_trends_evidence_pulse:trendsPulse,
    flows_positioning_evidence:{gold_cot:cotGold},
    rates_funding_intelligence:ratesFundingPulse,
    volatility_intelligence:volatilityIntelligence,
    gold_seasonality_cycle_context:seasonality,
    quant_accountability:quantAccountability,
    six_desks:desks,
    engine_registry:engines,
    calibration:{
      public_accuracy:forecastMature?'REVIEW_READY':'WITHHELD',
      reason:forecastMature?'Forecast horizon samples crossed the minimum threshold; aggregate publication still requires review.':`Forecast error evidence is live, but public accuracy remains withheld until each horizon reaches n=${forecastThreshold}. Current maximum non-flat sample is n=${maxForecastSample}.`,
      qa_score:null,
      automatic_promotion:false,
      capital_permission:'0R'
    },
    governance:{
      action_permitted:'WAIT',
      capital_permission:'0R',
      automatic_execution:false,
      automatic_risk_increase:false,
      rule:'Elite presentation never overrides evidence gates.'
    }
  });
}
