// Read-only projection of the existing publication ledger. Never writes or scores forecasts.
export function unavailableLedger(reason='SOURCE_UNAVAILABLE'){
 return {version:'forecast-ledger-health-v1',status:'UNAVAILABLE',reason,research_only:true,live_orders:false,capital_permission:'0R',counts:null,performance:null,eye_capture:'NOT_CONNECTED',canonical_write_performed:false};
}
const count=x=>Number.isSafeInteger(x)&&x>=0;
export function curateLedger(body,now=Date.now()){
 if(body?.ok!==true||body.state==='EVIDENCE_STORE_UNAVAILABLE'||body.incident?.active===true)return unavailableLedger('EVIDENCE_STORE_UNAVAILABLE');
 const at=Date.parse(body.generated_at),s=body.summary;
 if(!Number.isFinite(at)||at>now+5000||now-at>120000)return unavailableLedger('STALE_OR_INVALID_EVIDENCE');
 if(!s||![s.total_forecasts,s.open_forecasts,s.resolved_forecasts,s.brier_scored,s.directional_scored].every(count))return unavailableLedger('INVALID_OR_MISSING_COUNTS');
 if(s.open_forecasts+s.resolved_forecasts!==s.total_forecasts||s.brier_scored>s.resolved_forecasts||s.directional_scored>s.resolved_forecasts)return unavailableLedger('INCONSISTENT_COUNTS');
 // Preserve counts, but do not promote the upstream's aggregate numbers into validated model performance.
 // Outcome-level validation, population definition and Directional Eye attribution are not supplied here.
 return {...unavailableLedger(null),status:'PUBLICATION_COUNTS_AVAILABLE',observed_at:new Date(at).toISOString(),expires_at:new Date(at+120000).toISOString(),received_at:new Date(now).toISOString(),source:'Existing public-track-record service',
  counts:{total:s.total_forecasts,open:s.open_forecasts,resolved:s.resolved_forecasts,brier_scored:s.brier_scored,directional_scored:s.directional_scored},
  scoring_status:s.resolved_forecasts===0?'NO_RESOLVED_OUTCOMES':'OUTCOME_VALIDATION_REQUIRED',
  scope:'Existing publication forecasts only. Counts do not establish Eye capture, immutability verification, accuracy, calibration or trading edge.'};
}
export function currentLedger(packet,now=Date.now()){
 if(packet?.version!=='forecast-ledger-health-v1'||packet.status!=='PUBLICATION_COUNTS_AVAILABLE'||packet.research_only!==true||packet.live_orders!==false||packet.capital_permission!=='0R')return null;
 const at=Date.parse(packet.observed_at),expiry=Date.parse(packet.expires_at);
 return Number.isFinite(at)&&Number.isFinite(expiry)&&at<=now+5000&&now-at<=120000&&now<expiry&&expiry<=at+120000?packet:null;
}
