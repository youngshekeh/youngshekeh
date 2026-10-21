#!/usr/bin/env node
// Offline-only report generation from already redacted aggregated evidence.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {evaluateV230,createSupportMessage} from '../src/v230-provider-recovery.mjs';
const [src,out='v230-support-packet']=process.argv.slice(2);
if(!src){console.error('Usage: node scripts/v230-provider-escalation.mjs <redacted.json> [dir]');process.exitCode=2;}
else{
 try{
  const data=JSON.parse(readFileSync(resolve(src),'utf8'));
  const verdict=evaluateV230(data);
  mkdirSync(resolve(out),{recursive:true});
  writeFileSync(join(resolve(out),'support-ticket-draft.md'),createSupportMessage(verdict));
  writeFileSync(join(resolve(out),'verified-incident.json'),JSON.stringify(verdict,null,2)+'\n');
  console.log('V230 packet written locally. Ticket NOT submitted. Launch NOT CERTIFIED.');
 }catch{console.error('Invalid evidence: packet NOT generated.');process.exitCode=2;}
}
