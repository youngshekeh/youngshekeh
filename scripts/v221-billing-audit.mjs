#!/usr/bin/env node
// Read a manually gathered PII-free snapshot, never query a database.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {evaluateEntitlementEvidence,describeAudit} from '../src/billing-entitlement-audit.mjs';
const [source,out='billing-acceptance-evidence']=process.argv.slice(2);
if(!source){console.error('Usage: node scripts/v221-billing-audit.mjs <aggregate-snapshot.json> [output-directory]');process.exit(2)}
try{
 const input=JSON.parse(readFileSync(resolve(source),'utf8'));
 // The historical snapshot is checked relative to its own immutable observed_at.
 // Neither a newly generated timestamp nor a successful CLI exit makes it live.
 const at=Date.parse(String(input.observed_at||''));
 if(!Number.isFinite(at))throw new Error('missing operator timestamp');
 const result=evaluateEntitlementEvidence(input,at);
 mkdirSync(resolve(out),{recursive:true});
 writeFileSync(join(resolve(out),'entitlement-audit.json'),JSON.stringify(result,null,2)+'\n');
 writeFileSync(join(resolve(out),'entitlement-audit.txt'),describeAudit(result)+'\n');
 console.log(JSON.stringify({state:result.state,reason:result.reason,read_only:true,at:result.at}));
 if(result.state==='LAUNCH_HOLD')process.exitCode=1;
}catch{
 console.error('Evidence rejected. No billing release certified.');
 process.exitCode=2;
}
