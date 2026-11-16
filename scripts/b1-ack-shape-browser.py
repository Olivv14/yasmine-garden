"""Thought read ACK regression: actual dist/SDK/Chromium, synthetic HTTP only.
Run after npm run build. No live Auth, backend, publish or native operations.
"""
import asyncio, importlib.util, json, traceback, uuid
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
from urllib.parse import urlparse
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('b1_read_fixture',ROOT/'scripts/profile-b1-browser.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
OUT=ROOT.parent/'execution/step-39-read-ack-browser.json'
KINDS=['null','empty','multiple','boolean','number','string','empty-object','wrong-id','wrong-recipient','invalid-time','valid','single','deny401','deny403']
class Fixture(b.Fixture):
 def __init__(self,kind):
  super().__init__();self.kind=kind
  self.read_event=dict(id=str(uuid.uuid4()),pair_id=b.m.PAIR,sender_id=b.P2,recipient_id=b.m.P,phrase_key='affection.phrase07',sequence=7,created_at=b.m.STAMP,read_at=None)
  self.tables['thought_events']=[self.read_event]
 async def b1rpc(self,route,name,args,actor):
  if name=='mark_thought_read' and self.kind.startswith('deny'):
   status=int(self.kind[4:]);return await self.error(route,'42501' if status==403 else 'PGRST301','Synthetic authorization denial',status)
  return await super().b1rpc(route,name,args,actor)
 async def json(self,route,data,*args,**kwargs):
  if urlparse(route.request.url).path.endswith('/rpc/mark_thought_read') and not self.kind.startswith('deny'):
   data={'null':None,'empty':[],'multiple':[data,data],'boolean':True,'number':7,'string':'unconfirmed','empty-object':{},'wrong-id':{**data,'id':str(uuid.uuid4())},'wrong-recipient':{**data,'recipient_id':b.P2},'invalid-time':{**data,'read_at':'invalid'},'valid':data,'single':[data]}[self.kind]
  return await super().json(route,data,*args,**kwargs)
async def main():
 report={'kind':'Actual dist/real SDK/Chromium; synthetic HTTP only','checks':[],'errors':[]}
 def check(value,label):
  report['checks'].append({'passed':bool(value),'label':label})
  if not value:raise AssertionError(label)
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(b.Handler,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start()
 try:
  async with async_playwright() as pw:
   browser=await pw.chromium.launch(headless=True);report['browser']=browser.version
   for kind in KINDS:
    f=Fixture(kind);ctx=await browser.new_context();ctx.set_default_timeout(7000);await ctx.route('**/*',f.route);await ctx.route_web_socket('**/*',lambda ws:ws.close());p=await ctx.new_page();p.on('pageerror',lambda e:report['errors'].append(str(e)));await b.session(p)
    original=str(uuid.uuid4());key='connection-thought:'+':'.join([b.m.U,b.m.P,b.m.PAIR]);pending={'intent':dict(type='affection.requested',version=1,tapCount=10,idempotencyKey=original,phraseKey='affection.phrase01'),'receipt':None}
    await p.add_init_script('if(!sessionStorage.getItem('+json.dumps(key)+'))sessionStorage.setItem('+json.dumps(key)+','+json.dumps(json.dumps(pending))+');')
    await p.goto(f'http://127.0.0.1:{server.server_port}/index.html',wait_until='networkidle');await p.locator('#privateSpace').wait_for(state='visible')
    before=await p.evaluate('(key)=>sessionStorage.getItem(key)',key)
    await p.locator('#thoughtInbox button').click();await p.wait_for_timeout(250)
    check(f.calls==[dict(name='mark_thought_read',args={'p_id':f.read_event['id']},actor=b.m.P)],kind+': exact p_id-only read, no pending-send auto RPC')
    if kind.startswith('deny'):
     check(await p.locator('#privateSpace').is_hidden() and await p.locator('#authPanel').is_visible() and await p.evaluate('(key)=>sessionStorage.getItem(key)',key) is None,kind+': real HTTP denial remains identity-fatal')
    else:
     check(await p.locator('#privateSpace').is_visible() and await p.evaluate('(key)=>sessionStorage.getItem(key)',key)==before,kind+': unrelated durable intent untouched')
     if kind in ['valid','single']:
      check(await p.locator('#thoughtInbox button').count()==0,kind+': confirmed read renders read state')
     else:
      check(await p.locator('#thoughtInbox button').count()==1 and not await p.locator('#thoughtInbox button').is_disabled(),kind+': malformed ACK never renders confirmed read')
      await p.reload(wait_until='networkidle');await p.locator('#privateSpace').wait_for(state='visible')
      check(await p.locator('#thoughtRetry').is_visible() and await p.locator('#affectionButton').is_disabled() and original in (await p.evaluate('(key)=>sessionStorage.getItem(key)',key)),kind+': unrelated original UUID/explicit Retry survive reload')
    await ctx.close()
   await browser.close()
 except Exception:report['failure']=traceback.format_exc()
 finally:server.shutdown()
 report['passed']='failure' not in report and not report['errors'] and all(c['passed'] for c in report['checks']);report['counts']={'total':len(report['checks']),'passed':sum(c['passed'] for c in report['checks'])};OUT.write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report,indent=2));return report['passed']
if __name__=='__main__':raise SystemExit(0 if asyncio.run(main()) else 1)
