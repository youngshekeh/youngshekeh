import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const ORIGIN='http://127.0.0.1:4173',now=Date.now(),at=t=>new Date(t).toISOString();
let requested=0,unsafe=0;
const diagnostic={
 ok:true,version:'v258-readonly-recovery-triage-v1',
 generated_at:at(now),state:'DATABASE INCIDENT REPORTED',
 checks:{
  auth_http:{state:'TIMEOUT',http_status:0,transport_reachable:false,service_ready:false},
  postgrest_http:{state:'HTTP RESPONDED',http_status:200,transport_reachable:true,service_ready:false},
  readiness_source_current:true,database_incident_reported:true,
  database_incident_code:'POSTGREST_RUNTIME_UNAVAILABLE',
  blockers:['database_incident','auth_runtime']
 },
 limitations:{auth_http_does_not_prove_login:true,postgrest_http_does_not_prove_database_queries:true},
 private_actions_executed:0,database_jobs_modified:0,
 governance:{action_permitted:'WAIT',capital_permission:'0R',
  live_order_submission_enabled:false,commercial_launch_certified:false}
};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.__copiedSupportReports=[];
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
   writeText:async text=>{window.__copiedSupportReports.push(text)}
  }});
 });
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/public-recovery-triage'){
   requested++;
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(diagnostic)});
  }
  if(/order|broker-submit|payment|kernel|alter_job/.test(path))unsafe++;
  return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});
 });
 await page.route('**/functions/v1/**',route=>route.fulfill({
  status:200,contentType:'application/json',
  body:JSON.stringify({ok:true,state:'BUILD_HOLD',generated_at:at(now),
   database_incident:{active:true,code:'POSTGREST_RUNTIME_UNAVAILABLE'},
   hard_blockers:['database_incident','auth_runtime','runtime_baseline','billing_preflight'],
   acceptance_pending:[],external_unknowns:[]})
 }));
 const pageResponse=await page.goto(ORIGIN+'/status/',{waitUntil:'domcontentloaded'});
 assert.equal(pageResponse?.status(),200);
 const state=page.locator('#recovery-triage');
 assert.match(await state.innerText(),/NOT CHECKED/);
 assert.equal(requested,0,'no diagnostic probe on page load');
 assert.equal(await page.locator('#support-escalation-prepare').isDisabled(),true,
  'support report must be disabled before source verification');
 assert.equal(await page.locator('#support-escalation-report').isHidden(),true);
 assert.deepEqual(await page.evaluate(()=>window.__copiedSupportReports),[]);
 await page.locator('#recovery-triage-check').click();
 await page.waitForFunction(()=>document.getElementById('recovery-triage')?.textContent?.includes('DATABASE INCIDENT REPORTED'));
 assert.equal(requested,1);
 await page.locator('#support-escalation-prepare').waitFor({state:'visible'});
 assert.equal(await page.locator('#support-escalation-prepare').isEnabled(),true);
 await page.locator('#support-escalation-prepare').click();
 await page.waitForFunction(()=>document.getElementById('support-escalation-report')?.value?.includes('Supabase Pro project in eu-west-1'));
 const copies=await page.evaluate(()=>window.__copiedSupportReports);
 assert.equal(copies.length,1,'operator click creates one copy only');
 assert.match(copies[0],/Auth HTTP transport: TIMEOUT/);
 assert.match(copies[0],/PostgREST HTTP transport: HTTP RESPONDED \(HTTP 200\)/);
 assert.match(copies[0],/No passwords, API secrets, session data or customer records/);
 assert.doesNotMatch(copies[0],/PRIVATE_SECRET|secret_key|DATABASE_URL/);
 assert.equal(await page.locator('#support-escalation-report').isVisible(),true);
 assert.match(await page.locator('#support-escalation-state').innerText(),/NO TICKET HAS BEEN SUBMITTED/);
 assert.equal(requested,1,'copy cannot re-probe the upstream service');
 const detail=await page.locator('#recovery-triage-detail').innerText();
 assert.match(detail,/Auth HTTP: TIMEOUT/);
 assert.match(detail,/PostgREST HTTP: HTTP RESPONDED/);
 assert.match(detail,/This does not certify a SQL query/);
 assert.match(await state.innerText(),/LAUNCH HOLD/);
 assert.equal(unsafe,0);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({
  name:'V258_V259_REAL_CHROMIUM_READONLY_RECOVERY_AND_ESCALATION',result:'PASS',
  support_report_copies:1,support_tickets_sent:0,
  diagnostic_requests:requested,unsafe_requests:unsafe,
  private_launch:'HOLD',db_changed:false,cron_changed:false,live_orders:false,
  limitation:'mocked public responses, no real Supabase repair or actual login certification'
 }));
}finally{await browser.close()}
