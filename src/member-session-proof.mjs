// V284: pure, fail-closed adapter for live member-session v12 response.
// This function does not authenticate a user: the browser must first
// receive Supabase Auth JWT, then server-side /member-session verdict.
const PAID_PLANS=new Set(['pro','executive','business','enterprise']);
const uid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function assessMemberSession(data,now=Date.now()){
 const bad=Object.freeze({authenticated:false,paid_or_owner:false,
  label:'NOT VERIFIED',description:'Private member-session evidence unavailable.'});
 if(data?.ok!==true||data?.version!=='member-session-v12-strict-paid-term'
  ||!uid(data?.user?.id))return bad;
 const owner=data.is_owner===true&&data.access_state==='owner';
 const term=Date.parse(String(data.subscription?.current_period_end??''));
 const paid=data.is_owner===false&&data.access_state==='granted'
  &&PAID_PLANS.has(data.subscription?.plan_id)
  &&['active','trialing','canceled'].includes(data.subscription?.status)
  &&data.subscription?.period_valid===true
  &&Number.isFinite(term)&&term>now;
 const limited=data.is_owner===false&&data.access_state==='limited';
 if(!owner&&!paid&&!limited)return bad;
 const label=owner?'OWNER / MEMBER':paid?'MEMBER · PAID':'LIMITED / FREE';
 const description=owner?'Server-side owner identity verified. MFA/AAL2 is still required in Owner Command.'
  :paid?'Paid period currently verified by member-session · '+String(data.subscription.plan_name||data.subscription.plan_id).slice(0,60)
  :'Account authenticated. No paid research entitlement verified.';
 return Object.freeze({authenticated:true,paid_or_owner:owner||paid,
  is_owner:owner,access_state:owner?'owner':paid?'granted':'limited',
  label,description});
}
