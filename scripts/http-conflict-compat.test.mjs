// Offline HTTP boundary regressions: synthetic fetch, real pinned/bundled SDK; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {losslessFetch,losslessJSONText} from '../src/lossless-json.js';
const project='https://abcdefghijklmnopqrst.supabase.co';
const rest=project+'/rest/v1/rpc/save_my_preferences';
const payload='{"code":"PT409","message":"version conflict","details":"cleanup_only","hint":null,"version":9223372036854775807,"negative":-9223372036854775808,"safe":9007199254740991,"fraction":1.25,"exponent":1e3,"nested":{"code":"PT409"}}';
async function boundary({body=payload,status=409,url=rest,type='application/json',input=url}={}){
 const original=new Response(body,{status,statusText:'Conflict',headers:{'content-type':type,'x-request-id':'synthetic','content-length':'999','content-encoding':'identity'}});
 const response=await losslessFetch(project,async()=>original)(input);
 return {response,original,text:await response.text()};
}
test('exact project REST HTTP409 JSON object maps only code and preserves HTTP/error/bigint data',async()=>{
 for(const input of [rest,new URL(rest),new Request(rest)]){
  const {response,text}=await boundary({input});
  assert.equal(response.status,409);assert.equal(response.statusText,'Conflict');
  assert.equal(response.headers.get('x-request-id'),'synthetic');
  assert.equal(response.headers.has('content-length'),false);assert.equal(response.headers.has('content-encoding'),false);
  assert.deepEqual(JSON.parse(text),{...JSON.parse(losslessJSONText(payload)),code:'40001'});
 }
});
test('adapter requires a JSON media type, not a content-type substring',async()=>{
 for(const type of ['application/notjson','text/jsonish','application/json-seq']){
  const {text}=await boundary({type});assert.equal(text,losslessJSONText(payload));
 }
 for(const type of ['application/json; charset=utf-8','application/problem+json','application/vnd.pgrst.object+json']){
  const {text}=await boundary({type});assert.equal(JSON.parse(text).code,'40001');
 }
});
for(const status of [200,201,400,401,403,404,422,500,503])test(`HTTP${status} is never remapped by code/prose`,async()=>{
 const {response,text}=await boundary({status});assert.equal(response.status,status);assert.equal(text,losslessJSONText(payload));
});
for(const [name,url,type] of [
 ['other origin','https://other.invalid/rest/v1/rpc/x','application/json'],
 ['lookalike origin','https://abcdefghijklmnopqrst.supabase.co.attacker.invalid/rest/v1/x','application/json'],
 ['other port','https://abcdefghijklmnopqrst.supabase.co:444/rest/v1/x','application/json'],
 ['Auth',project+'/auth/v1/user','application/json'],
 ['Storage',project+'/storage/v1/object/x','application/json'],
 ['nonREST',project+'/rest/v10/x','application/json'],
 ['REST lookalike',project+'/rest/v1x/x','application/json'],
 ['nonJSON',rest,'text/plain']
])test(`${name} keeps original Response and body`,async()=>{
 const {response,original,text}=await boundary({url,type});assert.equal(response,original);assert.equal(text,payload);
});
for(const body of [
 'null','true','false','0','"PT409"','[]','[{"code":"PT409"}]','[{"code":"PT409"},{"code":"PT409"}]',
 '{}','{"code":409,"message":"PT409 conflict"}','{"code":"pt409"}','{"code":"PT409 "}',
 '{"code":"40001","message":"real serialization failure","details":"cleanup_only"}',
 '{"code":"42501","message":"PT409 conflict"}','{"nested":{"code":"PT409"}}'
])test(`HTTP409 guard payload ${body}`,async()=>{
 const {text}=await boundary({body});assert.equal(text,losslessJSONText(body));
});
for(const body of ['','{','{"code":"PT409",','{"code":"PT409","n":01}','{"code":"PT409","n":1.}'])test(`malformed JSON remains downstream parse failure: ${body}`,async()=>{
 const {text}=await boundary({body});assert.equal(text,losslessJSONText(body));assert.throws(()=>JSON.parse(text),SyntaxError);
});
test('mapped error preserves all non-code tokens, escaped keys, nested values and duplicate-key semantics',async()=>{
 for(const body of [
  ' { "code" : "PT409", "tiny":1e-400, "huge":1e400, "negativeZero":-0, "exact":0.1234567890123456789 } ',
  '{"nested":{"code":"PT409","text":"} \\\" code"},"rows":[{"code":"PT409"}],"code":"PT409"}',
  String.raw`{"c\u006fde":"PT409","message":"PT409"}`,
  '{"code":"42501","code":"PT409","message":"real detail"}'
 ]){
  const {text}=await boundary({body});
  const last=body.lastIndexOf('"PT409"');
  // For these fixtures the final PT409 value is the root code except escaped-key/message case.
  const expected=body.includes('c\\u006fde')?body.replace(':"PT409"',':"40001"'):body.slice(0,last)+'"40001"'+body.slice(last+7);
  assert.equal(text,expected);
  assert.equal(JSON.parse(text).code,'40001');
 }
});
test('transport and body read failures propagate unchanged, not blanket-caught',async()=>{
 const failure=Error('synthetic network failure');
 await assert.rejects(losslessFetch(project,async()=>{throw failure})(rest),e=>e===failure);
 const readFailure=Error('synthetic body failure');const response=new Response('{}',{status:409,headers:{'content-type':'application/json'}});
 response.text=async()=>{throw readFailure};await assert.rejects(losslessFetch(project,async()=>response)(rest),e=>e===readFailure);
});
test('actual bundled app loadClient + pinned SDK returns legacy error.code40001 with real status409',async()=>{
 const bundled=await build({stdin:{contents:"export {loadClient} from './src/transport.js';",resolveDir:fileURLToPath(new URL('..',import.meta.url)),sourcefile:'http-conflict-sdk-entry.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const {loadClient}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
 const oldFetch=globalThis.fetch,oldDocument=globalThis.document;let client,body=payload,status=409;const requests=[];
 globalThis.document={baseURI:'https://app-offline.invalid/'};
 globalThis.fetch=async(input,init)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);requests.push(url.href);
  if(url.href==='https://app-offline.invalid/public-config.json')return new Response(JSON.stringify({supabaseUrl:project,publishableKey:'sb_publishable_abcdefghijklmnopqrstuvwxyz'}));
  assert.equal(url.origin,project);assert.equal(url.pathname,'/rest/v1/rpc/save_my_preferences');assert.equal(init.method,'POST');
  return new Response(body,{status,headers:{'content-type':'application/json'}});
 };
 try{
  client=await loadClient();client.auth.getSession=async()=>({data:{session:null},error:null});
  let result=await client.rpc('save_my_preferences',{});
  assert.equal(result.status,409);assert.equal(result.data,null);assert.equal(result.error.code,'40001');
  assert.equal(result.error.message,'version conflict');assert.equal(result.error.details,'cleanup_only');assert.equal(result.error.hint,null);
  assert.equal(result.error.version,'9223372036854775807');assert.equal(result.error.negative,'-9223372036854775808');assert.equal(result.error.safe,9007199254740991);assert.equal(result.error.fraction,1.25);assert.equal(result.error.exponent,1000);
  for(const code of ['40001','42501']){body=JSON.stringify({code,message:'real error',details:'unchanged',hint:null});result=await client.rpc('save_my_preferences',{});assert.equal(result.status,409);assert.equal(result.error.code,code);assert.equal(result.error.details,'unchanged');}
  body=payload;status=401;result=await client.rpc('save_my_preferences',{});assert.equal(result.status,401);assert.equal(result.error.code,'PT409');
  status=403;result=await client.rpc('save_my_preferences',{});assert.equal(result.status,403);assert.equal(result.error.code,'PT409');
  status=200;result=await client.rpc('save_my_preferences',{});assert.equal(result.error,null);assert.equal(result.data.code,'PT409');assert.equal(result.data.version,'9223372036854775807');assert.equal(result.data.negative,'-9223372036854775808');assert.equal(result.data.safe,9007199254740991);assert.equal(result.data.fraction,1.25);assert.equal(result.data.exponent,1000);
  assert.equal(requests.length,7);
 }finally{client?.auth.stopAutoRefresh();globalThis.fetch=oldFetch;globalThis.document=oldDocument;}
});
