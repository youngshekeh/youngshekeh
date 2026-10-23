export const GOLD_EVIDENCE_MAX_AGE_MS=600000;
// A market quote or HTTP success alone cannot establish readable model evidence.
export function goldEvidenceView(evidence,confidence,now=Date.now()){
 const state=evidence?.calibration?.performance_state??evidence?.performance_state;
 const timestamp=Date.parse(evidence?.generated_at);
 const current=Number.isFinite(timestamp)&&timestamp<=now+1000&&now-timestamp<=GOLD_EVIDENCE_MAX_AGE_MS;
 const known=typeof state==='string'&&state.trim().length>0&&state.length<=100;
 const unavailable=!known||/UNKNOWN|UNAVAILABLE|RESTRICTED|ERROR|FAIL|PENDING|UNVERIFIED|INSUFFICIENT|NOT_READY|WITHHELD/i.test(state);
 if(evidence?.ok!==true||!current||unavailable)return {
  state:state==='EVIDENCE_STORE_UNAVAILABLE'?state:'EVIDENCE UNAVAILABLE',
  confidence:null,
  copy:'Current model evidence is not verified. Probability, confidence, EV, MFE/MAE and signal reputation are withheld.'
 };
 return {state,confidence:typeof confidence==='number'&&Number.isFinite(confidence)&&confidence>=0&&confidence<=100?confidence:null,
  copy:'Current evidence response received. Review its sample and calibration status before drawing conclusions; a response does not establish a calibrated edge.'};
}
