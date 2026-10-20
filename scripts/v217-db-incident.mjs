#!/usr/bin/env node
// Safe local support packet. Only a locally supplied JSON evidence snapshot is read;
// this program never connects to a production database or prints raw source logs.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {summarizeIncident,assessDatabaseRecovery,supportSummary} from '../src/db-incident-acceptance.mjs';
const [source,target='incident-evidence']=process.argv.slice(2);
if(!source){
 console.error('Usage: node scripts/v217-db-incident.mjs <private-snapshot.json> [output-directory]');
 process.exit(2);
}
try{
 const input=JSON.parse(readFileSync(resolve(source),'utf8'));
 const now=Date.parse(String(input.observed_at||''));
 if(!Number.isFinite(now))throw new Error('Snapshot must contain a valid observed_at timestamp');
 const incident=summarizeIncident(input.events,now);
 const verdict=assessDatabaseRecovery({...input,incident},now);
 mkdirSync(resolve(target),{recursive:true});
 writeFileSync(join(resolve(target),'support-summary.md'),supportSummary(incident)+'\n');
 writeFileSync(join(resolve(target),'launch-verdict.json'),JSON.stringify(verdict,null,2)+'\n');
 console.log(JSON.stringify({state:verdict.state,blockers:verdict.blockers,
   summary:'support-summary.md',verdict:'launch-verdict.json'}));
 if(verdict.state!=='READY_FOR_OPERATOR_FINAL_QA')process.exitCode=1;
}catch(error){
 console.error('Evidence rejected. No recovery has been certified.');
 process.exitCode=2;
}
