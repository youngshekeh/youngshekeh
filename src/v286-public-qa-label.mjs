// V286: public-facing QA summaries are informational, not private release proofs.
// The dashboard must never present an old score or a 200 response as acceptance.
export function homeQaLabel(score) {
  const value=typeof score==='string'?score:
    (typeof score==='number'&&Number.isFinite(score)?String(score):'');
  const clean=value.replace(/[\r\n\t]/g,' ').replace(/\s+/g,' ').trim().slice(0,44);
  if(!clean||/^(unknown|unavailable|withheld|verifying|not certified|n\/a)$/i.test(clean)){
    return 'NOT CERTIFIED';
  }
  return clean+' · NOT CERTIFIED';
}
