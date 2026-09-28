const BASE='https://thefatheranalytics.com';
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
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}

  // Mission Brief consumes research state. It does not run the full regression
  // suite internally; V78 is verified by a separate client-side channel.
  let [auto,day,liquidity,zones,confluence,breakout,tournament,quality,quota,marketAssets,macroEvidence,trendEvidence,cotGold,ratesEvidence,treasuryFunding]=await Promise.all([
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
    treasuryFundingPulse()
  ]);

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

  const changeParts=[];
  if(price!==null)changeParts.push(`Gold shadow proxy ${Number(price).toFixed(1)}`);
  changeParts.push(label(phase));
  if(breakoutState!=='WITHHELD')changeParts.push(label(breakoutState));
  if(mtf!=='WITHHELD')changeParts.push(label(mtf));

  const desks=[
    {id:'macro',name:'MACRO & WORLD ECONOMY',state:'RATES + MACRO LIVE',detail:`10Y real ${commonReal??'n/a'}% · breakeven ${commonBreakeven??'n/a'}% · ${fundingWatch.replaceAll('_',' ')}`,href:'/world-economy/'},
    {id:'markets',name:'GLOBAL MARKETS',state:dataQuality==='PASS'&&phase!=='DATA_GATED'&&phase!=='WITHHELD'?'LIVE RESEARCH':'EVIDENCE-GATED',detail:`${label(phase)} · ${label(breakoutState)}`,href:'/live-markets/'},
    {id:'flows',name:'FLOWS & POSITIONING',state:cotGold?.ok?'COT VERIFIED':'EVIDENCE-GATED',detail:cotGold?.ok?`Gold COT ${String(cotGold.report_date).slice(0,10)} · Managed net ${cotGold.groups?.[0]?.net?.toLocaleString?.()??'n/a'}`:'COT · systematic flows · seasonality · money flow',href:'/live-markets/'},
    {id:'quant',name:'QUANT & CALIBRATION',state:'VERIFYING QA',detail:'Separate regression channel · forecast ledger · Brier · MFE/MAE',href:'/status/'},
    {id:'risk',name:'RISK & PORTFOLIO',state:'0R FIREWALL',detail:'Scenario EV · position sizing · execution cost · capital permission',href:'/status/'},
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
    ['Seasonality & Cycles','EVIDENCE-GATED','Historical context requires verified sample'],
    ['Forecast Ledger','ACTIVE','Immutable outcomes + calibration'],
    ['Signal Reputation','LEARNING','Sample thresholds enforced'],
    ['Expected Value Engine','GATED','No EV without empirical inputs'],
    ['Portfolio Risk','GATED','Capital permission remains 0R'],
    ['Source Provenance','ACTIVE','Evidence trail + immutable snapshots'],
    ['Freshness Decay','ACTIVE','Stale inputs fail closed'],
    ['Adventure Map','ACTIVE SURFACE','Kid-friendly regime storytelling'],
    ['Institutional Matrix','ACTIVE SURFACE','Professional command visualization'],
    ['Global Trends Evidence Pulse','ACTIVE','Structural adoption + research activity + market attention + digital-asset breadth'],
    ['Real Yield & Breakeven','ACTIVE',commonDate?`10Y real ${commonReal}% · breakeven ${commonBreakeven}% · ${commonDate}`:'WITHHELD'],
    ['Treasury Auction / Funding','ACTIVE',treasuryFunding?.latest?`${treasuryFunding.latest.term} BTC ${treasuryFunding.latest.bid_to_cover} · ${treasuryFunding.summary.state.replaceAll('_',' ')}`:'WITHHELD']
  ].map(([name,state,detail])=>({name,state,detail}));

  res.setHeader('Cache-Control','public, max-age=20, s-maxage=60, stale-while-revalidate=120');
  return res.status(200).json({
    ok:true,
    version:'v93-unified-intelligence-experience-v2',
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
    six_desks:desks,
    engine_registry:engines,
    calibration:{
      public_accuracy:'WITHHELD',
      reason:'Empirical outcome samples have not reached publication thresholds.',
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
