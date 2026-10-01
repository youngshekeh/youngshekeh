const FIELDS = new Set(['mode','asset','provenance','source_code','provider_symbol','sequence','observed_at','bid','ask','broker_verified','execution_grade','live_order_submission_enabled']);
const MESSAGES = {
  owner_mfa_required: 'Verify the owner session and MFA before submitting a demo quote.',
  busy: 'A quote submission is already in progress.',
  invalid_json: 'Paste a JSON quote object from the demo source.',
  body_too_large: 'The quote must be smaller than 16 KB.',
  unexpected_fields: 'Remove extra fields. Never paste passwords, tokens or broker credentials.',
  paper_boundary_required: 'Use PAPER_DEMO, XAUUSD and BROKER_DEMO_USER_SUPPLIED. Verification and live-order flags must be false.',
  invalid_source_or_symbol: 'Use a 3–64 character source code with uppercase letters, digits, underscore or hyphen, and an XAUUSD provider symbol.',
  invalid_sequence: 'The source sequence must be a positive safe integer.',
  invalid_bid_ask: 'Bid and ask must be numbers, with positive bid, ask above bid and spread no greater than 2% of bid.',
  invalid_timestamp: 'Use the source observation time as an ISO timestamp with an explicit timezone.',
  future_quote: 'The source observation time is in the future. Check the source clock.',
  stale_quote: 'The quote is at least 10 seconds old. Obtain a new source quote; do not change an old timestamp.',
  invalid_session: 'The owner session has expired or is invalid. Sign in again.',
  aal2_required: 'Verify MFA again before submitting a quote.',
  owner_only: 'This session is not an active owner session.',
  conflicting_replay: 'That source sequence already has a different quote. Obtain the next source event.',
  out_of_order_quote: 'The source sequence or observation time is older than the last accepted quote.',
  paper_intake_rate_limit: 'This source accepts at most one new quote per second. No automatic retry was sent.',
  quote_rejected: 'The server rejected the quote. Check its source values and obtain a fresh event.',
  session_changed: 'The owner session changed during submission. No receipt is displayed for the new session.',
  unverified_receipt: 'No valid paper receipt was confirmed. Refresh status before retrying the identical source event.',
  transport_unavailable: 'No receipt was confirmed. Refresh status before retrying; never change the original event timestamp.',
};
export function paperQuoteMessage(error) {
  return MESSAGES[error] || 'Paper quote intake is unavailable. No receipt was confirmed; refresh status before retrying.';
}
const failure = error => ({ok:false,error,message:paperQuoteMessage(error)});

export function preparePaperQuote(text, now = Date.now()) {
  if (typeof text !== 'string') return failure('invalid_json');
  if (new TextEncoder().encode(text).length > 16384) return failure('body_too_large');
  let q;
  try {q=JSON.parse(text);} catch {return failure('invalid_json');}
  if (!q || typeof q !== 'object' || Array.isArray(q)) return failure('invalid_json');
  if (Object.keys(q).some(key=>!FIELDS.has(key))) return failure('unexpected_fields');
  if (q.mode!=='PAPER_DEMO' || q.asset!=='XAUUSD' || q.provenance!=='BROKER_DEMO_USER_SUPPLIED'
    || ['broker_verified','execution_grade','live_order_submission_enabled'].some(key=>key in q && q[key]!==false)) return failure('paper_boundary_required');
  if (typeof q.source_code!=='string' || !/^[A-Z0-9_-]{3,64}$/.test(q.source_code)
    || typeof q.provider_symbol!=='string' || !/^XAUUSD[A-Za-z0-9._-]{0,16}$/.test(q.provider_symbol)) return failure('invalid_source_or_symbol');
  if (!Number.isSafeInteger(q.sequence) || q.sequence<=0) return failure('invalid_sequence');
  if (typeof q.bid!=='number' || typeof q.ask!=='number' || !Number.isFinite(q.bid) || !Number.isFinite(q.ask)
    || q.bid<=0 || q.ask<=q.bid || q.ask-q.bid>q.bid*.02) return failure('invalid_bid_ask');
  if (typeof q.observed_at!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(q.observed_at)
    || !Number.isFinite(Date.parse(q.observed_at)) || !Number.isFinite(now)) return failure('invalid_timestamp');
  const age=now-Date.parse(q.observed_at);
  if (age<0) return failure('future_quote');
  if (age>=10000) return failure('stale_quote');
  // Only the quote contract leaves the browser. Preserve the source timestamp and sequence.
  const quote={mode:'PAPER_DEMO',asset:'XAUUSD',provenance:'BROKER_DEMO_USER_SUPPLIED'};
  for (const key of ['source_code','provider_symbol','sequence','observed_at','bid','ask']) quote[key]=q[key];
  return {ok:true,quote};
}

export function createPaperQuoteSubmitter({getSession,send,now=Date.now}) {
  let busy=false;
  return {
    async submit(text) {
      const session=getSession();
      if (!session?.token || session.owner!==true || session.mfa!==true) return failure('owner_mfa_required');
      if (busy) return failure('busy');
      const draft=preparePaperQuote(text,now());
      if (!draft.ok) return draft;
      busy=true;
      try {
        const receipt=await send(draft.quote);
        const current=getSession();
        if (current?.token!==session.token || current?.owner!==true || current?.mfa!==true) return failure('session_changed');
        if (receipt?.ok!==true) return failure(receipt?.error || 'unverified_receipt');
        if (receipt.mode!=='PAPER_DEMO' || receipt.capital_permission!=='0R' || receipt.execution_grade!==false
          || receipt.broker_verified!==false || receipt.live_order_submission_enabled!==false
          || receipt.governance?.capital_permission!=='0R' || receipt.governance?.live_order_submission_enabled!==false
          || receipt.governance?.action_permitted!=='WAIT' || receipt.governance?.paper_quotes_can_unlock_capital!==false
          || !Number.isSafeInteger(receipt.receipt_id) || receipt.receipt_id<=0
          || !(receipt.state==='PAPER_QUOTE_RECORDED' && receipt.inserted===true
            || receipt.state==='DUPLICATE_ALREADY_RECORDED' && receipt.inserted===false)) return failure('unverified_receipt');
        return {ok:true,receipt_id:receipt.receipt_id,inserted:receipt.inserted,
          observed_at:draft.quote.observed_at,expires_at:new Date(Date.parse(draft.quote.observed_at)+10000).toISOString()};
      } catch (error) {
        return failure(error?.data?.error || 'transport_unavailable');
      } finally {busy=false;}
    },
  };
}
