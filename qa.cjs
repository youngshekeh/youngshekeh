const fs=require('fs');
const path=require('path');
const root=__dirname;
const must=['index.html','access.html','member.html','owner.html','status.html','common.js','access.js','member.js','owner.js','_worker.js','vercel.json','wrangler.toml','health.json'];
const fail=[];
for(const f of must)if(!fs.existsSync(path.join(root,f)))fail.push(`missing ${f}`);
for(const f of ['vercel.json','health.json','package.json']){try{JSON.parse(fs.readFileSync(path.join(root,f),'utf8'))}catch(e){fail.push(`invalid JSON ${f}: ${e.message}`)}}
const worker=fs.readFileSync(path.join(root,'_worker.js'),'utf8');
const common=fs.readFileSync(path.join(root,'common.js'),'utf8');
const access=fs.readFileSync(path.join(root,'access.js'),'utf8');
const member=fs.readFileSync(path.join(root,'member.js'),'utf8');
const owner=fs.readFileSync(path.join(root,'owner.js'),'utf8');
if(!worker.includes("'/__tfa/health'"))fail.push('worker gateway health route missing');
for(const p of ['/auth/v1/','/functions/v1/','/rest/v1/','/storage/v1/'])if(!worker.includes(p))fail.push(`worker proxy missing ${p}`);
if(!worker.includes("connect-src 'self' https://checkout.flutterwave.com"))fail.push('production CSP is not same-origin-first');
if(!common.includes('USE_GATEWAY'))fail.push('common.js same-origin gateway selection missing');
if(!access.includes('gatewayHealth'))fail.push('access gateway health diagnostic missing');
if(!member.includes('signInWithPassword'))fail.push('member password login missing');
if(!owner.includes('owner-mfa-actions'))fail.push('owner MFA path missing');
for(const [f,src] of [['access.js',access],['member.js',member],['owner.js',owner],['_worker.js',worker]])if(/\?(?:t|ts|timestamp)=\$?\{?Date\.now\(\)/.test(src))fail.push(`${f} contains timestamp cachebuster`);
const htmlChecks={'member.html':['signInForm','signUpForm','forgotForm','resetForm'],'owner.html':['ownerLogin','ownerForgot','mfaForm'],'access.html':['accessPill']};
for(const [file,ids] of Object.entries(htmlChecks)){const t=fs.readFileSync(path.join(root,file),'utf8');for(const id of ids)if(!t.includes(`id="${id}"`))fail.push(`${file} missing #${id}`)}
for(const file of fs.readdirSync(root).filter(x=>x.endsWith('.html'))){const t=fs.readFileSync(path.join(root,file),'utf8');if(/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(t))fail.push(`${file} contains inline script blocked by production CSP`)}
for(const file of ['app.js','status.js','live-markets.js','gold-live.js','access.js','member.js','owner.js']){const p=path.join(root,file);if(!fs.existsSync(p))continue;const t=fs.readFileSync(p,'utf8');if(t.includes("common.js?v=52.1.0"))fail.push(`${file} still imports stale v52.1 common runtime`)}
const vercel=fs.readFileSync(path.join(root,'vercel.json'),'utf8');if(!vercel.includes('"/__tfa/health"'))fail.push('Vercel health fallback route missing');
if(fail.length){console.error('QA FAILED\n- '+fail.join('\n- '));process.exit(1)}
console.log('QA PASS: v52.2 same-origin gateway, CSP and runtime-cache contract are internally consistent.');
