export default function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }
  const environment=String(process.env.VERCEL_ENV??process.env.VERCEL_TARGET_ENV??'UNKNOWN');
  const gitBranch=String(process.env.VERCEL_GIT_COMMIT_REF??'UNKNOWN');
  const gitSha=String(process.env.VERCEL_GIT_COMMIT_SHA??'');
  const deploymentId=String(process.env.VERCEL_DEPLOYMENT_ID??'');
  const shaValid=/^[a-f0-9]{40}$/i.test(gitSha);
  const metadataComplete=environment!=='UNKNOWN'&&gitBranch!=='UNKNOWN'&&shaValid;
  const productionSourceVerified=
    environment==='production'&&
    gitBranch==='the-father-analytics-deploy'&&
    shaValid;
  const state=environment==='production'
    ? (productionSourceVerified?'PRODUCTION_SOURCE_VERIFIED':'PRODUCTION_SOURCE_MISMATCH')
    : (metadataComplete?'NON_PRODUCTION_SOURCE':'METADATA_WITHHELD');

  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Provenance','VERCEL_RUNTIME');
  return res.status(200).json({
    ok:environment==='production'?productionSourceVerified:metadataComplete,
    version:'v115-release-attestation-bridge-v1',
    state,
    environment,
    git_branch:gitBranch,
    git_commit_sha:shaValid?gitSha:null,
    git_commit_short:shaValid?gitSha.slice(0,12):null,
    deployment_id:deploymentId||null,
    expected_production_branch:'the-father-analytics-deploy',
    build_policy:'GITHUB_CI_FEATURE_BRANCHES_THEN_VERCEL_PRODUCTION_BRANCH',
    governance:{
      metadata_only:true,
      release_metadata_can_grant_capital:false,
      production_branch_mismatch_fails_closed:true,
      automatic_execution:false,
      capital_permission:'0R'
    },
    truth_label:'VERCEL_RUNTIME_RELEASE_PROVENANCE_NOT_CODE_CORRECTNESS_NOT_FORECAST_ACCURACY'
  });
}
