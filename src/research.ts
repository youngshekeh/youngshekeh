import {buildEnquiry} from './research-enquiry.mjs';
const form=document.getElementById('research-form') as HTMLFormElement;
const error=document.getElementById('research-error');
const preview=document.getElementById('research-preview');
const previewText=document.getElementById('research-preview-text');
const link=document.getElementById('research-email-link') as HTMLAnchorElement;
const copy=document.getElementById('research-copy') as HTMLButtonElement;
const download=document.getElementById('research-download') as HTMLButtonElement;
// Only known plan IDs prefill a local email enquiry; no submission occurs.
const enquiryPlan=new URLSearchParams(window.location.search).get('plan')?.toLowerCase()||'';
if(['pro','executive','business','enterprise'].includes(enquiryPlan)&&form){
 const select=form.elements.namedItem('service') as HTMLSelectElement|null;
 const focus=form.elements.namedItem('focus') as HTMLInputElement|null;
 if(select)select.value='membership-or-licensing';
 if(focus&&!focus.value)focus.value='Membership enquiry: '+enquiryPlan.toUpperCase();
}
let draft:string|null=null;
function collect(){
  const data=new FormData(form);
  const values=Object.fromEntries(data.entries()) as Record<string,string|string[]|boolean>;
  values.deliverables=data.getAll('deliverables').map(String);
  values.consent=(form.elements.namedItem('consent') as HTMLInputElement)?.checked===true;
  return values;
}
function reset(){
  draft=null;
  if(preview)preview.hidden=true;
  if(copy)copy.disabled=true;
  if(download)download.disabled=true;
  if(error)error.textContent='';
}
form?.addEventListener('input',reset);
form?.addEventListener('change',reset);
form?.addEventListener('submit',(event)=>{
  event.preventDefault();
  const enquiry=buildEnquiry(collect());
  if(!enquiry.ok){
    if(error)error.textContent=(enquiry.errors||[]).join(' ');
    return;
  }
  draft=enquiry.copyText||'';
  if(previewText)previewText.textContent=draft;
  if(copy)copy.disabled=false;
  if(download)download.disabled=false;
  if(preview)preview.hidden=false;
  if(link){
    const canOpen=Number(enquiry.mailtoLength)<1800;
    link.hidden=!canOpen;
    if(canOpen)link.href=enquiry.href;
    else if(error)error.textContent='Your full brief is too long for a reliable email link. Use Copy full brief and send it from your email application.';
  }
  preview?.scrollIntoView({behavior:'smooth',block:'nearest'});
});
copy?.addEventListener('click',async()=>{
  if(!draft)return;
  try{
    await navigator.clipboard.writeText(draft);
    if(error)error.textContent='Full brief copied. Paste it into a new email addressed to the company and press Send.';
  }catch{
    if(error)error.textContent='Clipboard access was denied. Select and copy the visible brief below manually.';
  }
});

download?.addEventListener('click',()=>{
  // All personal details remain on the visitor's device. A click creates one
  // text file locally; no browser storage or network call is performed.
  if(!draft)return;
  const blob=new Blob([draft],{type:'text/plain;charset=utf-8'});
  const objectUrl=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=objectUrl;
  anchor.download='the-father-research-enquiry.txt';
  anchor.click();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),1500);
  if(error)error.textContent='Your brief was prepared as a local text file. It has not been sent. Email it to the research team to request a quotation.';
});
