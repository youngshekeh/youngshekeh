// Private-by-default, client-only research enquiry builder.
// This module does not send, store, or transmit contact details.
import {scopeAnnex} from './research-scope.mjs';
export const ENQUIRY_DESTINATION='thefatherintelligence@gmail.com';
export const SERVICE_IDS=Object.freeze([
  'macro-market-research',
  'africa-economy-intelligence',
  'custom-data-analysis',
  'enterprise-decision-research',
  'membership-or-licensing'
]);
const SERVICE_NAMES=Object.freeze({
  'macro-market-research':'Global Macro & Market Research',
  'africa-economy-intelligence':'Nigeria & Africa Economy Intelligence',
  'custom-data-analysis':'Custom Data Analysis & Reporting',
  'enterprise-decision-research':'Enterprise Decision Intelligence',
  'membership-or-licensing':'Membership or Intelligence Licensing'
});
export function clean(value,limit=300){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit);
}
export function validateEnquiry(values){
  const name=clean(values?.name,90);
  const email=clean(values?.email,180);
  const request=clean(values?.service,100);
  const goal=clean(values?.goal,500);
  const consent=values?.consent===true;
  const errors=[];
  if(name.length<2)errors.push('Enter your name.');
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||email.length>180)errors.push('Enter a valid email address.');
  if(!SERVICE_IDS.includes(request))errors.push('Choose a research service.');
  if(goal.length<15)errors.push('Describe the research question or decision in at least 15 characters.');
  if(!consent)errors.push('Confirm you want to prepare a research enquiry.');
  return Object.freeze({ok:errors.length===0,errors});
}
export function buildEnquiry(values){
  const result=validateEnquiry(values);
  if(!result.ok)return Object.freeze({ok:false,errors:result.errors});
  const scope=scopeAnnex(values);
  if(!scope.ok)return Object.freeze({ok:false,errors:scope.errors});
  const service=clean(values.service);
  const name=clean(values.name,90);
  const email=clean(values.email,180);
  const company=clean(values.company,120)||'Not specified';
  const focus=clean(values.focus,180)||'To discuss';
  const timeline=clean(values.timeline,100)||'Flexible';
  const budget=clean(values.budget,100)||'To be quoted';
  const goal=clean(values.goal,500);
  const notes=clean(values.notes,650)||'None provided';
  const subject='THE FATHER ANALYTICS | Research enquiry | '+SERVICE_NAMES[service];
  const body=[
    'THE FATHER ANALYTICS - COMMERCIAL RESEARCH ENQUIRY',
    '',
    'Service: '+SERVICE_NAMES[service],
    'Contact: '+name,
    'Reply email: '+email,
    'Organization: '+company,
    'Market / geography: '+focus,
    'Research question / business decision: '+goal,
    'Preferred timeline: '+timeline,
    'Indicative budget (not a quote): '+budget,
    'Additional context: '+notes,
    '',
    ...scope.lines,
    '',
    'Please confirm feasibility, deliverables, timeline, confidentiality and a quotation before any payment.',
    'This enquiry is not a subscription purchase, trade order or guaranteed service commitment.'
  ].join('\n');
  const href='mailto:'+ENQUIRY_DESTINATION+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  return Object.freeze({ok:true,subject,body,href,mailtoLength:href.length,copyText:subject+'\n\n'+body});
}
