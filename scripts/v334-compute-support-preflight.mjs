#!/usr/bin/env node
// Offline-only support checkpoint. It cannot connect to production and cannot
// perform a resize. The checked-in evidence purposely contains no credentials.
import {readFileSync} from 'node:fs';
import {assessNanoMicroPreflightV334,assessNanoMicroPostflightV334}
 from '../src/v334-micro-compute-upgrade-acceptance.mjs';
const source=JSON.parse(readFileSync(new URL(
 '../docs/operations/evidence/v334-20261027-supabase-compute-support.json',
 import.meta.url),'utf8'));
const preflight=assessNanoMicroPreflightV334({
 project:{project_ref:source.project_ref,
  control_plane_status:source.project_control_plane},
 pricing:{plan:'Pro',nano_micro_same_rate:true},
 backup:{project_ref:source.project_ref,
  latest_backup_exists:source.backup_inventory_verified},
 operations:{owner_approved_downtime:source.operator_resize_approval_verified}
});
const post=assessNanoMicroPostflightV334({
 project:{project_ref:source.project_ref,
  control_plane_status:source.project_control_plane},
 preflight,
 resize:{project_ref:source.project_ref,
  compute_size:source.actual_compute_size,
  completed:source.resize_completed_verified}
});
const safe={
 project_ref:source.project_ref,
 provider_reported_multiple_resources_exhausted:true,
 support_suggests_nano_to_micro:true,
 database_project_compute_currently_confirmed:source.current_compute_dashboard_observation?.compute_size==='t4g.nano',
 nano_micro_same_displayed_hourly_price:source.current_compute_dashboard_observation?.nano_hourly_price_usd===source.current_compute_dashboard_observation?.micro_hourly_price_usd,
 source_is_owner_dashboard_screenshot:true,
 project_backup_inventory_verified:source.backup_inventory_verified===true,
 backed_up_project_restore_verified:source.isolated_restore_verified,
 pre_resize_state:preflight.state,
 pre_resize_blockers:preflight.blockers,
 post_resize_state:post.state,
 post_resize_blockers:post.blockers,
 commercial_activation_permitted:false,
 automatic_trading_permitted:false,
 capital_permission:'0R'
};
if(preflight.state!=='NO_RESIZE_YET'||post.state!=='RESIZE_ACCEPTANCE_HOLD'
 ||preflight.governance.automatic_resize_permitted!==false)
 throw Error('V334_FAIL_CLOSED_SUPPORT_EVIDENCE_REQUIRED');
process.stdout.write(JSON.stringify(safe,null,2)+'\n');
process.stdout.write('V334_COMPUTE_SUPPORT_RECOVERY_HOLD_RECORDED\n');
