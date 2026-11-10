"""B1 R1-R4 regression: actual production dist, real SDK/Chromium, FAKE HTTP only."""
import asyncio,importlib.util,json,traceback,uuid
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('b1',ROOT/'scripts/profile-b1-browser.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
OUT=ROOT.parent/'execution/step-28-b1-browser.json'
class Fixture(b.Fixture):
 def __init__(self):super().__init__();self.signal_reads=0;self.tamper=None
 async def json(self,route,data,*args,**kwargs):
  if '/sync_signals?' in route.request.url:
   self.signal_reads+=1;data={**data,'revision':9007199254740992 if self.signal_reads==1 else 9007199254740993}
  if self.tamper and isinstance(data,dict) and 'sender_id' in data:
   data={**data,**self.tamper};self.tamper=None
  return await super().json(route,data,*args,**kwargs)
async def main():
 report={'kind':'Actual dist / real SDK / Chromium; synthetic HTTP only','checks':[],'errors':[]}
 def check(value,label,**evidence):report['checks'].append(dict(passed=bool(value),label=label,**evidence))
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(b.Handler,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}/index.html'
 try:
  async with async_playwright() as pw:
   browser=await pw.chromium.launch(headless=True);report['browser']=browser.version
   async def open_fixture(f,init=None):
    ctx=await browser.new_context();ctx.set_default_timeout(6000);await ctx.route('**/*',f.route);await ctx.route_web_socket('**/*',lambda ws:ws.close());p=await ctx.new_page();p.on('pageerror',lambda e:report['errors'].append(str(e)));await b.session(p)
    if init:await p.add_init_script(init)
    await p.goto(url,wait_until='networkidle');await p.locator('#privateSpace').wait_for(state='visible');return ctx,p
   for value in [9007199254740993,9223372036854775807]:
    f=Fixture();f.tables['profile_details'][0]['version']=value;f.tables['profile_preferences'][0]['version']=value
    ctx,p=await open_fixture(f);check(f.signal_reads>=6,'Distinct large R0/R1 revisions trigger retry',reads=f.signal_reads)
    await p.locator('#profileBubble').click();await p.locator('#ownBio').fill('Numeric wire exactness');f.no_commit='save_my_profile' if value==9223372036854775807 else None;await p.locator('#profileSave').click();await p.wait_for_timeout(500)
    c=next(c for c in f.calls if c['name']=='save_my_profile');check(c['args']['p_expected_version']==str(value),'Profile unsafe numeric wire version sent as exact decimal STRING',actual=c['args']['p_expected_version'],expected=str(value))
    if value==9007199254740993:check(f.tables['profile_details'][0]['version']==value+1,'Lossless numeric profile roundtrip committed without false conflict')
    await p.locator('#themeSelect').select_option('ocean');f.no_commit='save_my_preferences' if value==9223372036854775807 else None;await p.locator('#preferencesSave').click();await p.wait_for_timeout(500)
    c=next(c for c in f.calls if c['name']=='save_my_preferences');check(c['args']['p_expected_version']==str(value),'Preferences unsafe numeric wire version sent as exact decimal STRING',actual=c['args']['p_expected_version'],expected=str(value));await ctx.close()
   init="""window.blockThought=true;window.writes=[];const originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('connection-thought:')){window.writes.push(JSON.parse(v));if(window.blockThought)throw new DOMException('Quota','QuotaExceededError');}return originalSet.call(this,k,v);};"""
   f=Fixture();ctx,p=await open_fixture(f,init)
   for _ in range(10):await p.locator('#affectionButton').click()
   await p.wait_for_timeout(150);ids=await p.evaluate('writes.map(x=>x.intent.idempotencyKey)');check(not f.calls and bool(ids),'Quota failure blocks FIRST send, retains attempted UUID',calls=f.calls.copy())
   check(await p.locator('#thoughtRetry').is_visible() and await p.locator('#affectionButton').is_disabled() and await p.locator('#thoughtReset').is_hidden(),'Quota failure offers retry, no double-tap bypass or false stored')
   check('storage' in (await p.locator('#thoughtStatus').inner_text()).lower(),'Quota failure visibly reports local storage error')
   await p.evaluate('window.blockThought=false');await p.locator('#thoughtRetry').click();await p.locator('#thoughtReset').wait_for(state='visible');check(len(f.calls)==1 and f.calls[0]['args']['p_id']==ids[0],'Explicit persistence retry sends SAME immutable UUID');await ctx.close()
   init="""window.blockReceipt=true;const originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('connection-thought:')&&JSON.parse(v).receipt&&window.blockReceipt)throw new DOMException('Quota','QuotaExceededError');return originalSet.call(this,k,v);};"""
   f=Fixture();ctx,p=await open_fixture(f,init)
   for _ in range(10):await p.locator('#affectionButton').click()
   await p.wait_for_timeout(300);stored=await p.evaluate("JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(k=>k.startsWith('connection-thought:'))))");original=f.calls[0]['args']['p_id'];check(stored['intent']['idempotencyKey']==original and stored['receipt'] is None,'Receipt quota failure retains already durable original intent without fake receipt')
   await p.evaluate("document.querySelector('#affectionButton').click()");check(len(f.calls)==1 and await p.locator('#thoughtRetry').is_visible() and await p.locator('#thoughtReset').is_hidden(),'Receipt write failure blocks double tap and false cached success')
   await p.reload(wait_until='networkidle');await p.locator('#privateSpace').wait_for(state='visible');await p.evaluate('window.blockReceipt=false');await p.locator('#thoughtRetry').click();await p.locator('#thoughtReset').wait_for(state='visible');check(len(f.tables['thought_events'])==1 and f.calls[-1]['args']['p_id']==original,'Receipt failure reload/retry preserves SAME UUID, single server event');await ctx.close()
   patches=[{'id':str(uuid.uuid4())},{'pair_id':str(uuid.uuid4())},{'sender_id':b.P2},{'recipient_id':b.m.P},{'recipient_id':str(uuid.uuid4())},{'phrase_key':'invalid'},{'created_at':'bad'},{'sequence':0},{'sequence':10001},{'read_at':b.m.STAMP}]
   for patch in patches:
    f=Fixture();id=str(uuid.uuid4());cached={'intent':dict(type='affection.requested',version=1,tapCount=10,idempotencyKey=id,phraseKey='affection.phrase01'),'receipt':dict(id=id,pair_id=b.m.PAIR,sender_id=b.m.P,recipient_id=b.P2,phrase_key='affection.phrase07',sequence=7,created_at=b.m.STAMP,read_at=None)};cached['receipt'].update(patch);key='connection-thought:'+':'.join([b.m.U,b.m.P,b.m.PAIR]);init='sessionStorage.setItem('+json.dumps(key)+','+json.dumps(json.dumps(cached))+');'
    ctx,p=await open_fixture(f,init);check(not f.calls and await p.locator('#thoughtReset').is_hidden() and await p.locator('#thoughtRetry').is_visible(),'Strict cached receipt rejects '+str(patch));
    if await p.locator('#thoughtRetry').is_visible():
     await p.locator('#thoughtRetry').click();await p.locator('#thoughtReset').wait_for(state='visible');check(f.calls[-1]['args']['p_id']==id,'Invalid cached receipt retains original intent UUID '+str(patch))
    await ctx.close()
   f=Fixture();f.tamper={'recipient_id':str(uuid.uuid4())};ctx,p=await open_fixture(f)
   for _ in range(10):await p.locator('#affectionButton').click()
   await p.wait_for_timeout(600);check(await p.locator('#thoughtReset').is_hidden() and await p.locator('#thoughtRetry').is_visible(),'HTTP receipt with wrong pair recipient rejected by SAME validator',calls=f.calls.copy(),tamper=f.tamper,status=await p.locator('#thoughtStatus').inner_text(),stored=await p.evaluate("Object.entries(sessionStorage).filter(([k])=>k.startsWith('connection-thought:'))"));await ctx.close();await browser.close()
 except Exception:report['failure']=traceback.format_exc()
 finally:
  server.shutdown();report['passed']='failure' not in report and not report['errors'] and all(c['passed'] for c in report['checks']);OUT.write_text(json.dumps(report,indent=2),encoding='utf8')
 print(json.dumps(report,indent=2));return report['passed']
if __name__=='__main__':raise SystemExit(0 if asyncio.run(main()) else 1)
