// V293: statutory/provider rights must be verified before end-user BTC quotes.
// Coinbase August 7 2026 Market Data Terms restrict use in third-party end-user
// applications. Open API access != redistribution/display authorization.
// Do not accept a client-supplied "licensed" flag or environment auto-unlock.
export const PUBLIC_BTC_DISPLAY_RIGHTS_VERIFIED=false;
export const BTC_PUBLIC_DATA_HOLD=Object.freeze({
  asset:'BTC',display_rights:'UNVERIFIED',public_quote_allowed:false,
  commercial_redistribution_approved:false,
  policy:'LICENSED_DATA_PROVIDER_REQUIRED',
  provider_reference:'https://www.coinbase.com/legal/market_data',
  provider_terms_as_of:'2026-08-07'
});
export function publiclyDisplayableBitcoin(_packet){
  return null; // Must not display BTC from unlicensed public spot sources.
}
