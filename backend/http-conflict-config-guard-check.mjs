import assert from'node:assert/strict';import{createRequire}from'node:module';import{readFileSync}from'node:fs';
const require=createRequire(process.env.CONNECTION_TEST_PACKAGE_JSON),{PGlite}=require('@electric-sql/pglite');const root=process.env.CONNECTION_SOURCE_ROOT;assert(root);const read=f=>readFileSync(root+'/backend/'+f,'utf8');const db=new PGlite();let checks=0;
const snapshot=async()=>JSON.stringify((await db.query("select n.nspname,p.proname,p.oid,pg_get_functiondef(p.oid) definition,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','app_private') order by n.nspname,p.proname,p.oid")).rows);
const variants=[['NULL proconfig','ALTER FUNCTION public.finalize_avatar(uuid) RESET ALL'],['nonempty search_path',"ALTER FUNCTION public.finalize_avatar(uuid) SET search_path TO public"],['SECURITY INVOKER','ALTER FUNCTION public.finalize_avatar(uuid) SECURITY INVOKER'],['missing function','DROP FUNCTION public.finalize_avatar(uuid)'],['overloaded function','CREATE FUNCTION public.finalize_avatar(integer) RETURNS void LANGUAGE plpgsql AS $probe$ BEGIN RETURN; END $probe$'],['other config without search_path','ALTER FUNCTION public.finalize_avatar(uuid) RESET ALL;ALTER FUNCTION public.finalize_avatar(uuid) SET statement_timeout TO 1000']];
try{
 const fixture=read('local-check.mjs').match(/const fixtureSQL=`([\s\S]*?)`;/)?.[1];assert(fixture);await db.exec(fixture);
 for(const stage of['original','already-patched'])for(const[label,mutation]of variants){
  await db.exec('DROP FUNCTION IF EXISTS public.finalize_avatar(integer)');for(const f of['001_shared_app.sql','002_profile_thoughts.sql','003_web_push.sql'])await db.exec(read(f));if(stage==='already-patched')await db.exec(read('004_http_business_conflicts.sql'));
  await db.exec(mutation);const before=await snapshot();let error;
  try{await db.exec(read('004_http_business_conflicts.sql'));}catch(e){error=e;await db.exec('ROLLBACK');}
  assert.equal(error?.code,'P0001',`${stage}: must reject ${label}; got ${error?.code??'accepted'}`);checks++;
  assert.match(error.message,label==='missing function'||label==='overloaded function'?/Missing\/overloaded reviewed conflict function/:/Unsafe reviewed conflict function configuration/);checks++;
  assert.equal(await snapshot(),before,`${stage}: atomic rollback must preserve all original definitions including the deliberately unsafe last target`);checks++;
 }
 console.log(JSON.stringify({passed:true,checks,configuration_cases:variants.length,body_stages:2,scope:'Actual isolated PostgreSQL; no cloud configuration mutation'}));
}finally{await db.close();}
