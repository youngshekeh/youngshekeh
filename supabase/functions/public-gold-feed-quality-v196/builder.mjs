const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const ms=v=>{const t=Date.parse(String(v||''));return Number.isFinite(t)?t:null};
const sec=(a,b)=>Math.max(0,Math.round((a-b)/1000));

export function buildGoldFeedQuality({now=new Date(),ticks=[]}={}){
  const nowMs=now.getTime();
  const rows=(Array.isArray(ticks)?ticks:[])
    .map(x=>({...x,_obs:ms(x?.observed_at),_recv:ms(x?.received_at),_seq:num(x?.sequence)}))
    .filter(x=>x._obs!==null&&x._recv!==null&&x._seq!==null)
    .sort((a,b)=>a._obs-b._obs);
  const latest=rows.at(-1)??null;
  const latestAge=latest?sec(nowMs,latest._obs):null;
  const ticks60=rows.filter(x=>nowMs-x._obs<=60_000).length;
  const ticks5m=rows.filter(x=>nowMs-x._obs<=300_000).length;
  const recent=rows.filter(x=>nowMs-x._obs<=60_000);
  const spanSeconds=recent.length>=2?Math.max(0,Math.round((recent.at(-1)._obs-recent[0]._obs)/1000)):0;
  const monotonic=rows.length>0&&(rows.length===1||rows.every((x,i)=>i===0||x._seq>rows[i-1]._seq));
  const latestLag=latest?Math.max(0,Math.round((latest._recv-latest._obs)/1000)):null;
  const freshness=latestAge!==null&&latestAge<=5;
  const cadence=ticks60>=3&&spanSeconds>=5;
  const terminal=latest?.terminal_connected===true;
  const relay=String(latest?.relay_version||'')==='v186.0';
  const mt5=String(latest?.mt5_package_version||'')==='5.0.6231';
  const windows=String(latest?.os_family||'').toLowerCase()==='windows';
  const bid=num(latest?.bid),ask=num(latest?.ask),spread=num(latest?.spread_usd);
  const spreadValid=bid!==null&&ask!==null&&ask>=bid&&spread!==null&&spread>=0;
  const mode=['DEMO','REAL'].includes(String(latest?.trade_mode||''));
  const lagOk=latestLag!==null&&latestLag<=5;

  let score=0;
  if(freshness)score+=25;
  if(cadence)score+=20;
  if(monotonic)score+=15;
  if(terminal)score+=10;
  if(relay&&mt5&&windows)score+=10;
  if(spreadValid)score+=10;
  if(mode)score+=5;
  if(lagOk)score+=5;

  const hardPass=freshness&&cadence&&monotonic&&terminal&&relay&&mt5&&windows&&spreadValid&&mode&&lagOk;
  let state='NO_TICKS';
  if(latest){
    if(!freshness)state='FEED_STALE';
    else if(!cadence)state='PROBATION_WARMING';
    else if(!hardPass)state='FEED_QUALITY_DEGRADED';
    else state='LIVE_FEED_QUALITY_PASS';
  }

  return{
    ok:true,
    version:'v196-gold-feed-quality-v1',
    generated_at:now.toISOString(),
    symbol:'XAUUSD',
    state,
    deterministic_quality_score:score,
    gates:{
      freshness:{pass:freshness,latest_tick_age_seconds:latestAge,threshold_seconds:5},
      cadence:{pass:cadence,ticks_60s:ticks60,ticks_5m:ticks5m,span_60s_seconds:spanSeconds,minimum_ticks_60s:3,minimum_span_seconds:5},
      sequence_integrity:{pass:monotonic,rule:'STRICTLY_INCREASING'},
      terminal_connected:{pass:terminal},
      relay_contract:{pass:relay&&mt5&&windows,relay_version:latest?.relay_version??null,mt5_package_version:latest?.mt5_package_version??null,os_family:latest?.os_family??null},
      transport_lag:{pass:lagOk,latest_lag_seconds:latestLag,threshold_seconds:5},
      quote_integrity:{pass:spreadValid,spread_usd:spreadValid?spread:null},
      trade_mode:{pass:mode,mode:mode?latest?.trade_mode:null}
    },
    evidence:{
      valid_ticks_examined:rows.length,
      latest_observed_at:latest?.observed_at??null,
      latest_received_at:latest?.received_at??null
    },
    privacy:{
      bridge_id_public:false,
      sequence_public:false,
      payload_hash_public:false,
      account_number_public:false
    },
    governance:{
      quality_score_not_probability:true,
      probation_required:true,
      market_data_only:true,
      feed_quality_cannot_grant_trade_permission:true,
      automatic_execution:false,
      machine_execution_allowed:false,
      live_order_submission_enabled:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  };
}
