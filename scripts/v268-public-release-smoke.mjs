// V268 production smoke: no credentials, database SQL or trading actions.
import {assessV268PublicRelease,V268_ENDPOINTS,V268_EXPECTED_BRANCH,V268_ORIGIN}
 from '../src/v268-public-release-smoke.mjs';
const SHA=String(process.env.TFA_EXPECTED_SHA||process.env.GITHUB_SHA||'').toLowerCase();
const attempts=12,intervalMs=15000,budgetMs=12500;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function probe(key){
 const url=new URL(V268_ENDPOINTS[key],V268_ORIGIN);
 try{
  const response=await fetch(url,{
   method:'GET',headers:{Accept:key==='page'?'text/html':'application/json',
    'User-Agent':'TFA-V268-PUBLIC-RELEASE-SMOKE/1.0'},
   redirect:'error',cache:'no-store',signal:AbortSignal.timeout(budgetMs)
  });
  if(key==='page'){
   await response.body?.cancel?.().catch(()=>null);
   return {status:response.status,body:null};
  }
  const body=await response.json().catch(()=>null);
  return {status:response.status,body};
 }catch{return {status:0,body:null};}
}
if(!/^[a-f0-9]{40}$/.test(SHA)){
 console.error('V268_NOT_VERIFIED: missing/invalid expected 40-character production commit');
 process.exitCode=1;
}else{
 let release=null;
 for(let i=0;i<attempts;i++){
  release=await probe('release');
  if(release.status===200&&release.body?.git_commit_sha===SHA
    &&release.body?.git_branch===V268_EXPECTED_BRANCH)break;
  if(i<attempts-1)await wait(intervalMs);
 }
 const keys=Object.keys(V268_ENDPOINTS).filter(key=>key!=='release');
 const results=await Promise.all(keys.map(probe));
 const probes={release,...Object.fromEntries(keys.map((key,i)=>[key,results[i]]))};
 const verdict=assessV268PublicRelease(probes,{expectedSha:SHA});
 // Only safe booleans, status codes and fixed taxonomy reach CI logs.
 console.log(JSON.stringify(verdict,null,2));
 if(!verdict.public_research_pass)process.exitCode=1;
}
