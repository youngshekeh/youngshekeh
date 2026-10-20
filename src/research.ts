import {buildEnquiry} from './research-enquiry.mjs';
const form=document.getElementById('research-form') as HTMLFormElement;
const error=document.getElementById('research-error');
const preview=document.getElementById('research-preview');
const previewText=document.getElementById('research-preview-text');
const link=document.getElementById('research-email-link') as HTMLAnchorElement;
const copy=document.getElementById('research-copy') as HTMLButtonElement;
let draft:string|null=null;
function collect(){
  const values=Object.fromEntries(new FormData(form).entries()) as Record<string,string|boolean>;
  values.consent=(form.elements.namedItem('consent') as HTMLInputElement)?.checked===true;
  return values;
}
function reset(){
  draft=null;
  if(preview)preview.hidden=true;
  if(copy)copy.disabled=true;
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
