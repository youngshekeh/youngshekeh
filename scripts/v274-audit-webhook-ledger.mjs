#!/usr/bin/env node
// V274 consumes locally supplied, de-identified aggregate JSON. No network or writes.
import {readFileSync} from 'node:fs';
import {assessAggregateReconciliation} from '../src/v274-webhook-fulfillment-audit.mjs';
const file=process.argv[2];
if(!file){console.error('Usage: node scripts/v274-audit-webhook-ledger.mjs <operator-aggregate.json>');process.exitCode=2}
else{
 try{
  const input=JSON.parse(readFileSync(file,'utf8'));
  const result=assessAggregateReconciliation(input,Date.now());
  console.log(JSON.stringify(result,null,2));
  if(result.state!=='LAUNCH_HOLD')process.exitCode=2;
 }catch{
  console.error('Audit refused: unavailable or malformed evidence. No payment actions.');
  process.exitCode=2;
 }
}
