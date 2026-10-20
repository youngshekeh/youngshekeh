// V219: private-by-default research scoping, used only on the customer's device.
// Requested deliverables are questions for quotation, not accepted orders.
export const DELIVERABLES=Object.freeze({
  'executive-decision-memo':'Executive decision memo',
  'sources-methodology-register':'Sources and methodology register',
  'market-data-tables':'Market and sector data tables',
  'scenario-risk-matrix':'Scenario and risk matrix',
  'forecast-validation':'Forecast assumptions and validation',
  'dashboard-prototype':'Research dashboard prototype',
  'stakeholder-briefing':'Stakeholder briefing materials'
});
export const DATA_ACCESS=Object.freeze({
  'to-agree':'To agree during scoping',
  'public-sources-only':'Publicly available sources only',
  'client-supplied-data':'Client-provided data (subject to permissions)',
  'research-discovery':'Researcher to identify available datasets'
});
export const CONFIDENTIALITY=Object.freeze({
  'standard':'Standard pre-contract enquiry',
  'nda-requested':'Confidentiality agreement requested before sharing sensitive data'
});
export const DELIVERY_FORMAT=Object.freeze({
  'to-agree':'To be agreed',
  'written-report':'Written report or decision memo',
  'data-workbook':'Data workbook',
  'dashboard-concept':'Dashboard concept or prototype',
  'presentation':'Stakeholder presentation'
});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export function scopeAnnex(values={}){
  const raw=values.deliverables;
  // FormData.getAll returns an array, but older enquiry integrations may omit it.
  // Never manufacture customer choices when no boxes were selected.
  const selected=raw===undefined||raw===null?[]:Array.isArray(raw)?raw:[raw];
  const delivery=values.dataAccess??'to-agree';
  const nda=values.confidentiality??'standard';
  const output=values.deliveryFormat??'to-agree';
  const errors=[];
  if(selected.length>4)errors.push('Choose no more than four proposed deliverables.');
  if(selected.some(id=>typeof id!=='string'||!own(DELIVERABLES,id)))
    errors.push('Choose only the listed research deliverables.');
  if(typeof delivery!=='string'||!own(DATA_ACCESS,delivery))
    errors.push('Choose a supported data access option.');
  if(typeof nda!=='string'||!own(CONFIDENTIALITY,nda))
    errors.push('Choose a supported confidentiality option.');
  if(typeof output!=='string'||!own(DELIVERY_FORMAT,output))
    errors.push('Choose a supported delivery format.');
  if(new Set(selected).size!==selected.length)
    errors.push('Choose each proposed deliverable only once.');
  if(errors.length)return Object.freeze({ok:false,errors});
  return Object.freeze({ok:true,errors:[],
    lines:Object.freeze([
      'PROPOSED RESEARCH SCOPE (NOT AN ACCEPTED CONTRACT)',
      'Requested deliverables: '+(selected.length?selected.map(id=>DELIVERABLES[id]).join('; '):'To be agreed during scoping'),
      'Requested data access: '+DATA_ACCESS[delivery],
      'Confidentiality: '+CONFIDENTIALITY[nda],
      'Preferred delivery format: '+DELIVERY_FORMAT[output],
      '',
      'Scope verification: data access rights, source provenance, research methodology,',
      'deliverables, review rounds, IP/licensing, delivery schedule, quotation, taxes',
      'and any confidentiality agreement must be confirmed in writing.',
      'No payment, data access grant, financial recommendation or delivery',
      'commitment is created by preparing or downloading this request.'
    ])
  });
}
