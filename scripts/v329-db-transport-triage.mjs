#!/usr/bin/env node
// V329 operator triage from a CHECKED-IN REDACTED aggregate. No network,
// tokens, secrets, writes, direct SQL or actions on production.
// A historical log window is never a current recovery clearance.
import {readFileSync} from 'node:fs';
import {
 assessDatabaseTransportV329,makeRedactedTransportSupportV329
} from '../src/v329-database-transport-evidence.mjs';
const snapshot=JSON.parse(readFileSync(
 new URL('../docs/operations/evidence/v329-20261027-redacted-sql-transport.json',
 import.meta.url),'utf8'));
const result=assessDatabaseTransportV329({
 snapshot,
 management_sql_samples:[], // No successful reads in verified 08:35 window.
 postgrest_probe:{ok:false},
 control_plane:{status:'ACTIVE_HEALTHY'}
});
const summary=makeRedactedTransportSupportV329(snapshot,result);
process.stdout.write(summary+'\n');
if(result.state!=='DATABASE_RECOVERY_HOLD'
 ||result.governance.billing_activation_permitted!==false
 ||result.governance.trading_activation_permitted!==false)
 throw new Error('V329_FAILURE_TO_HOLD');
process.stdout.write('V329_PUBLIC_LAUNCH_DATABASE_HOLD_RECORDED\n');
