#!/usr/bin/env node
// V214 Continuity Vault: backup the exact committed source, never live secrets or customer data.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const out = resolve(process.argv[2] || 'continuity-artifacts');
function git(...args){return execFileSync('git',args,{encoding:'utf8',maxBuffer:15*1024*1024}).trim()}
export function unsafePath(path){
  const segments=String(path).split('/');
  return segments.some(s=>(
    /^\.env($|\.)/i.test(s)&&!/^\.env\.example$/i.test(s)||
    /^(id_rsa|id_ed25519|credentials\.json|secrets\.json|service-account\.json)$/i.test(s)||
    /\.(pem|p12|pfx|key)$/i.test(s)
  ));
}
export function inspectPaths(paths){
  const names=paths.filter(Boolean);
  const unsafe=names.filter(unsafePath);
  if(unsafe.length)throw new Error('Source snapshot rejected: files with private-key or credential-looking names are tracked. Audit repository before backup.');
  return {tracked_files:names.length, checked_for_sensitive_filenames:true};
}
function sha256(file){return createHash('sha256').update(readFileSync(file)).digest('hex')}
export function createSnapshot(){
  const paths=git('ls-files','-z').split('\0').filter(Boolean);
  const audit=inspectPaths(paths);
  const sha=git('rev-parse','HEAD');
  const remote=git('config','--get','remote.origin.url');
  // The CI workflow checks out the exact event commit. Never capture a moving branch head.
  if(process.env.GITHUB_SHA&&process.env.GITHUB_SHA!==sha)
    throw new Error('Refuse archive: checked-out source differs from GitHub event commit');
  mkdirSync(out,{recursive:true});
  const tar=join(out,'tfa-source.tar');
  const archive=spawnSync('git',['archive','--format=tar','--output='+tar,sha],{encoding:'utf8'});
  if(archive.status!==0)throw new Error('Failed to archive committed source');
  const gzip=spawnSync('gzip',['-n','-f','-9',tar],{encoding:'utf8'});
  if(gzip.status!==0)throw new Error('Failed to compress committed source');
  const zip=tar+'.gz';
  if(!existsSync(zip)||statSync(zip).size<500)throw new Error('Source archive is empty or missing');
  const payload={
    schema:'the-father-continuity-v214',
    capture_kind:'git_committed_source_only',
    captured_at_utc:new Date().toISOString(),
    repository:'youngshekeh/youngshekeh',
    source_sha:sha,
    source_url:'https://github.com/youngshekeh/youngshekeh/tree/'+sha,
    source_archive:'tfa-source.tar.gz',
    source_archive_sha256:sha256(zip),
    source_archive_size_bytes:statSync(zip).size,
    tracked_files:audit.tracked_files,
    sensitive_name_guard_passed:audit.checked_for_sensitive_filenames,
    excludes:['uncommitted edits','Supabase database records','Supabase Storage objects','runtime Edge Function code not checked into Git','Vercel/Supabase/AppDeploy environment secrets','provider payment records','live application state'],
    warnings:[
      'Repository code alone is NOT a full-stack restoration.',
      'Supabase backups and Storage objects must be verified separately; never publish a customer-data dump to a public repository.',
      'A READY website does not prove fresh market feeds, full billing acceptance, or a healthy autonomous kernel.',
      'Production capital policy stays WAIT / 0R. Never enable live trades during recovery.'
    ]
  };
  writeFileSync(join(out,'source-manifest.json'),JSON.stringify(payload,null,2)+'\n');
  console.log('V214 continuity snapshot OK '+sha.slice(0,12)+' '+audit.tracked_files+' committed files');
  return payload;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+resolve(process.argv[1])).href){
  try{createSnapshot()}catch(error){console.error(error instanceof Error?error.message:'Backup failed');process.exitCode=1}
}
