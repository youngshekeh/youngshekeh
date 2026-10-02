const SOURCE=/^[A-Z0-9_-]{3,64}$/;
const SYMBOL=/^XAUUSD[A-Za-z0-9._-]{0,16}$/;
const MESSAGES={
  invalid_bridge_configuration:'Use a 1–80 character label, a safe uppercase source code and an XAUUSD provider symbol.',
  active_bridge_already_exists:'An active bridge already exists for this source. Revoke it before creating another.',
  bridge_conflict:'The bridge could not be created because its identity conflicts with an existing record.',
  invalid_session:'The owner session has expired or is invalid. Sign in again.',
  aal2_required:'Verify MFA again before managing bridge credentials.',
  owner_only:'This session is not an active owner session.',
  bridge_create_unavailable:'Bridge enrollment is unavailable. No credential was created.',
  bridge_status_unavailable:'Bridge status is unavailable.',
  bridge_revoke_unavailable:'Bridge revocation is unavailable.',
  transport_unavailable:'The bridge control request did not complete.'
};
export function bridgeControlMessage(error){return MESSAGES[error]||'Bridge control is unavailable. Production trading remains locked.';}
export function prepareBridgeCreate({label,sourceCode,providerSymbol}){
  const bridge_label=String(label||'').trim();
  const source_code=String(sourceCode||'').trim();
  const provider_symbol=String(providerSymbol||'').trim();
  if(bridge_label.length<1||bridge_label.length>80||!SOURCE.test(source_code)||!SYMBOL.test(provider_symbol)){
    return{ok:false,error:'invalid_bridge_configuration',message:bridgeControlMessage('invalid_bridge_configuration')};
  }
  return{ok:true,payload:{action:'create',bridge_label,source_code,provider_symbol}};
}
export function bridgeInstallSnippet(result){
  if(result?.ok!==true||!Number.isSafeInteger(result.bridge_id)||result.bridge_id<=0
    ||typeof result.bridge_key!=='string'||!/^tfa_demo_[A-Za-z0-9_-]{40,80}$/.test(result.bridge_key)
    ||typeof result.provider_symbol!=='string'||!SYMBOL.test(result.provider_symbol))return'';
  return[
    '# PowerShell · keep this key private',
    '$env:TFA_BRIDGE_ID="'+result.bridge_id+'"',
    '$env:TFA_BRIDGE_KEY="'+result.bridge_key+'"',
    '$env:TFA_MT5_SYMBOL="'+result.provider_symbol+'"',
    'python scripts/mt5-demo-bridge.py'
  ].join('\n');
}
