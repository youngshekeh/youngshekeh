#!/usr/bin/env node
// Run locally on an explicit redacted aggregate snapshot. No network or DB writes.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {assessProviderPressure,supportPacket} from '../src/provider-incident-packet.mjs';
const [source,target='incident-evidence-v227']=process.argv.slice(2);
if(!source){
  console.error('Usage: node scripts/v227-provider-support.mjs <redacted-aggregate.json> [output-directory]');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(resolve(source),'utf8'));
    const assessment=assessProviderPressure(input);
    mkdirSync(resolve(target),{recursive:true});
    writeFileSync(join(resolve(target),'supabase-support-escalation.md'),supportPacket(assessment));
    writeFileSync(join(resolve(target),'launch-blocker-verdict.json'),JSON.stringify(assessment,null,2)+'\n');
    console.log('V227 read-only support packet generated; commercial launch remains NOT_CERTIFIED');
  }catch{
    console.error('Input evidence rejected. No incident claim or recovery certificate generated.');
    process.exitCode=2;
  }
}
