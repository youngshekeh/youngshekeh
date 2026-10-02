const SOURCE=/^[A-Z0-9_-]{3,64}$/;
const SYMBOL=/^XAUUSD[A-Za-z0-9._-]{0,16}$/;
const MESSAGES={
  invalid_bridge_configuration:'Use a 1–80 character label, an uppercase source code and an XAUUSD provider symbol.',
  active_bridge_already_exists:'An active live-market bridge already exists for this source. Revoke it before creating another.',
  bridge_conflict:'The live-market bridge conflicts with an existing credential.',
  invalid_session:'The owner session is invalid or expired.',
  aal2_required:'Verify MFA before managing live-market credentials.',
  owner_only:'This session is not an active owner session.',
  live_bridge_create_unavailable:'Live-market bridge enrollment is unavailable.',
  live_bridge_status_unavailable:'Live-market bridge status is unavailable.',
  live_bridge_revoke_unavailable:'Live-market bridge revocation is unavailable.',
  transport_unavailable:'The bridge-control request did not complete.'
};
export const liveMarketBridgeMessage=e=>MESSAGES[e]||'Live-market bridge control is unavailable. Orders remain OFF and capital remains 0R.';
export function prepareLiveMarketBridgeCreate({label,sourceCode,providerSymbol}){
  const bridge_label=String(label||'').trim(),source_code=String(sourceCode||'').trim(),provider_symbol=String(providerSymbol||'').trim();
  if(bridge_label.length<1||bridge_label.length>80||!SOURCE.test(source_code)||!SYMBOL.test(provider_symbol))
    return{ok:false,error:'invalid_bridge_configuration',message:liveMarketBridgeMessage('invalid_bridge_configuration')};
  return{ok:true,payload:{action:'create',bridge_label,source_code,provider_symbol}};
}
export function liveMarketBridgeInstallSnippet(result){
  if(result?.ok!==true||!Number.isSafeInteger(result.bridge_id)||result.bridge_id<=0
    ||typeof result.bridge_key!=='string'||!/^tfa_live_[A-Za-z0-9_-]{40,80}$/.test(result.bridge_key)
    ||typeof result.provider_symbol!=='string'||!SYMBOL.test(result.provider_symbol))return'';
  return[
    '# PowerShell · read-only live XAUUSD market data',
    'Invoke-WebRequest https://thefatheranalytics.com/downloads/mt5-live-market-bridge.py -OutFile .\\mt5-live-market-bridge.py',
    'python -m pip install MetaTrader5==5.0.6231',
    '$env:TFA_LIVE_BRIDGE_ID="'+result.bridge_id+'"',
    '$env:TFA_LIVE_BRIDGE_KEY="'+result.bridge_key+'"',
    '$env:TFA_MT5_SYMBOL="'+result.provider_symbol+'"',
    'python .\\mt5-live-market-bridge.py'
  ].join('\n');
}
