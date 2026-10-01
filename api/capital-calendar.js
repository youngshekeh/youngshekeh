const BLS_ICS='https://www.bls.gov/schedule/news_release/bls.ics';
const FED_SOURCE='https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
const BEA_SOURCE='https://www.bea.gov/news/schedule/';

function unfold(text){return text.replace(/\r?\n[ \t]/g,'')}
function clean(v=''){return v.replace(/\\,/g,',').replace(/\\n/g,' ').replace(/\\;/g,';').trim()}
function nthWeekday(year,month,weekday,n){const first=new Date(Date.UTC(year,month-1,1));const delta=(weekday-first.getUTCDay()+7)%7;return 1+delta+(n-1)*7}
function isUsEasternDst(y,m,d){const marchSecondSunday=nthWeekday(y,3,0,2);const novemberFirstSunday=nthWeekday(y,11,0,1);if(m<3||m>11)return false;if(m>3&&m<11)return true;if(m===3)return d>=marchSecondSunday;return d<novemberFirstSunday}
function parseEtDate(raw){const m=String(raw||'').match(/(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?/);if(!m)return null;const [,y,mo,d,h='00',mi='00',s='00']=m;const naive=`${y}-${mo}-${d}T${h}:${mi}:${s}`;const offset=isUsEasternDst(Number(y),Number(mo),Number(d))?'-04:00':'-05:00';return {local:naive,datetime:`${naive}${offset}`}}
function classify(title){const t=title.toLowerCase();if(/consumer price|employment situation|producer price|job openings|employment cost|fomc/.test(t))return'HIGH';if(/import and export|productivity|real earnings|state employment/.test(t))return'MEDIUM';return'LOW'}
function short(title){if(/consumer price/i.test(title))return'CPI';if(/employment situation/i.test(title))return'NFP';if(/producer price/i.test(title))return'PPI';if(/job openings/i.test(title))return'JOLTS';if(/fomc/i.test(title))return'FOMC';return title.slice(0,28)}
function parseBls(text){const blocks=unfold(text).split('BEGIN:VEVENT').slice(1);const events=[];for(const block of blocks){const dt=(block.match(/DTSTART[^:]*:([^\r\n]+)/)||[])[1];const summary=(block.match(/SUMMARY:([^\r\n]+)/)||[])[1];if(!dt||!summary)continue;const parsed=parseEtDate(dt);if(!parsed)continue;const title=clean(summary);events.push({id:`bls-${dt}-${title}`.slice(0,180),datetime:parsed.datetime,timezone:'America/New_York',title,short:short(title),impact:classify(title),country:'US',source:'U.S. Bureau of Labor Statistics',source_url:BLS_ICS,notes:'Official scheduled release; time represented in U.S. Eastern Time.'})}return events}
function blsFallbackEvents(){const base=[
['2026-10-02T08:30:00-04:00','Employment Situation · September 2026','NFP','HIGH','https://www.bls.gov/schedule/2026/10_sched.htm'],
['2026-10-14T08:30:00-04:00','Consumer Price Index · September 2026','CPI','HIGH','https://www.bls.gov/schedule/2026/10_sched.htm'],
['2026-10-15T08:30:00-04:00','Producer Price Index · September 2026','PPI','HIGH','https://www.bls.gov/schedule/2026/10_sched.htm'],
['2026-10-30T08:30:00-04:00','Employment Cost Index · Q3 2026','ECI','HIGH','https://www.bls.gov/schedule/2026/10_sched.htm'],
['2026-11-03T10:00:00-05:00','Job Openings and Labor Turnover Survey · September 2026','JOLTS','HIGH','https://www.bls.gov/schedule/2026/11_sched.htm'],
['2026-11-06T08:30:00-05:00','Employment Situation · October 2026','NFP','HIGH','https://www.bls.gov/schedule/2026/11_sched.htm'],
['2026-11-10T08:30:00-05:00','Consumer Price Index · October 2026','CPI','HIGH','https://www.bls.gov/schedule/2026/11_sched.htm'],
['2026-11-13T08:30:00-05:00','Producer Price Index · October 2026','PPI','HIGH','https://www.bls.gov/schedule/2026/11_sched.htm'],
['2026-12-01T10:00:00-05:00','Job Openings and Labor Turnover Survey · October 2026','JOLTS','HIGH','https://www.bls.gov/schedule/2026/12_sched.htm'],
['2026-12-04T08:30:00-05:00','Employment Situation · November 2026','NFP','HIGH','https://www.bls.gov/schedule/2026/12_sched.htm'],
['2026-12-10T08:30:00-05:00','Consumer Price Index · November 2026','CPI','HIGH','https://www.bls.gov/schedule/2026/12_sched.htm'],
['2026-12-15T08:30:00-05:00','Producer Price Index · November 2026','PPI','HIGH','https://www.bls.gov/schedule/2026/12_sched.htm']
];return base.map(([datetime,title,s,impact,source_url])=>({id:`bls-fallback-${datetime}-${s}`,datetime,timezone:'America/New_York',title,short:s,impact,country:'US',source:'U.S. Bureau of Labor Statistics',source_url,notes:'Official BLS 2026 release schedule fallback used when the live BLS ICS endpoint rejects server access.'}))}
function fedEvents(){const base=[
['2026-10-07T14:00:00-04:00','FOMC Minutes · September 15-16 Meeting','FOMC Minutes'],
['2026-10-27T14:00:00-04:00','FOMC Meeting · Day 1','FOMC'],
['2026-10-28T14:00:00-04:00','FOMC Policy Decision + Press Conference Window','FOMC'],
['2026-11-18T14:00:00-05:00','FOMC Minutes · October 27-28 Meeting','FOMC Minutes'],
['2026-12-08T14:00:00-05:00','FOMC Meeting · Day 1','FOMC'],
['2026-12-09T14:00:00-05:00','FOMC Policy Decision + Press Conference Window','FOMC']
];return base.map(([datetime,title,s])=>({id:`fed-${datetime}`,datetime,timezone:'America/New_York',title,short:s,impact:'HIGH',country:'US',source:'Federal Reserve',source_url:FED_SOURCE,notes:'Official meeting/minutes schedule. The displayed 14:00 ET is a dashboard event window, not a claim that every meeting-day activity occurs exactly then.'}))}
function beaEvents(){const base=[
['2026-10-06T08:30:00-04:00','U.S. International Trade in Goods and Services · August 2026','TRADE','MEDIUM'],
['2026-10-29T08:30:00-04:00','GDP · Advance Estimate · Q3 2026','GDP','HIGH'],
['2026-10-29T08:30:00-04:00','Personal Income and Outlays · September 2026','PCE','HIGH'],
['2026-11-04T08:30:00-05:00','U.S. International Trade in Goods and Services · September 2026','TRADE','MEDIUM'],
['2026-11-25T08:30:00-05:00','GDP · Second Estimate + Corporate Profits · Q3 2026','GDP','HIGH'],
['2026-11-25T08:30:00-05:00','Personal Income and Outlays · October 2026','PCE','HIGH'],
['2026-12-08T08:30:00-05:00','U.S. International Trade in Goods and Services · October 2026','TRADE','MEDIUM'],
['2026-12-23T08:30:00-05:00','GDP · Third Estimate + Corporate Profits · Q3 2026','GDP','HIGH'],
['2026-12-23T08:30:00-05:00','Personal Income and Outlays · November 2026','PCE','HIGH']
];return base.map(([datetime,title,s,impact])=>({id:`bea-${datetime}-${s}`,datetime,timezone:'America/New_York',title,short:s,impact,country:'US',source:'U.S. Bureau of Economic Analysis',source_url:BEA_SOURCE,notes:'Official BEA release schedule.'}))}
export default async function handler(req,res){res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=3600');res.setHeader('X-TFA-Engine','V167-CALENDAR');if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,state:'METHOD_NOT_ALLOWED',events:[]})}let bls=[],blsOk=false,detail='';try{const r=await fetch(BLS_ICS,{headers:{'User-Agent':'THE-FATHER-ANALYTICS-V167.1/1.0',Accept:'text/calendar'},signal:AbortSignal.timeout(8000)});if(r.ok){bls=parseBls(await r.text());blsOk=bls.length>0}else detail=`BLS returned ${r.status}`}catch(e){detail=String(e).slice(0,140)}const blsFallbackUsed=!blsOk;if(blsFallbackUsed)bls=blsFallbackEvents();const now=Date.now()-7*864e5;const events=[...bls,...fedEvents(),...beaEvents()].filter(x=>new Date(x.datetime).getTime()>=now).sort((a,b)=>new Date(a.datetime)-new Date(b.datetime));return res.status(200).json({ok:events.length>0,state:blsOk?'LIVE_OFFICIAL_SCHEDULES':'OFFICIAL_STATIC_FALLBACK_ACTIVE',generated_at:new Date().toISOString(),detail:blsOk?`Parsed ${bls.length} BLS scheduled releases plus Federal Reserve and BEA official events.`:`BLS ICS unavailable (${detail}); verified BLS 2026 schedule fallback plus Federal Reserve and BEA official events are active.`,events,source_health:{bls_ics:blsOk?'LIVE':'BLOCKED',bls_official_fallback:blsFallbackUsed?'ACTIVE':'STANDBY',federal_reserve:'OFFICIAL_SCHEDULE',bea:'OFFICIAL_SCHEDULE'},governance:{trading_permission:false,event_proximity_is_context_only:true}})}
