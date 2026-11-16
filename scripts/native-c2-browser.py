"""Built Chromium + real SDK, synthetic Auth/HTTP and PushManager/Notification doubles.
No provider request, no real browser permission prompt or physical device claim.
Separate localhost test uses the ACTUAL classic service-worker registration.
"""
import asyncio,base64,importlib.util,json,os,time,traceback,uuid
from pathlib import Path
from urllib.parse import urlparse
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('b1',ROOT/'scripts/profile-b1-browser.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b);m=b.m
OUT=Path(os.environ.get('NATIVE_C2_ARTIFACT_ROOT',str(ROOT.parent/'evidence/native-c2')));OUT.mkdir(parents=True,exist_ok=True)
KEY=base64.urlsafe_b64encode(bytes([4]+[1]*64)).decode().rstrip('=')
DOUBLES=r'''(()=>{window.nativeCalls=[];window.nativeGesture=false;document.addEventListener('click',e=>{const target=e.target.closest('#nativeEnable');if(!target)return;const handler=target.onclick;target.onclick=function(...args){nativeGesture=true;try{return handler.apply(this,args)}finally{nativeGesture=false;target.onclick=handler}}},true);const key=Uint8Array.from(atob('__KEY__'.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));let sub=localStorage.getItem('__syntheticSub')?makeSub():null;function makeSub(){return {options:{get applicationServerKey(){return window.badVapid?new Uint8Array(65):key}},toJSON(){return {endpoint:'https://fcm.googleapis.com/synthetic-native',keys:{p256dh:'synthetic-public',auth:'synthetic-key'}}},async unsubscribe(){nativeCalls.push({name:'unsubscribe'});sub=null;localStorage.removeItem('__syntheticSub');return true}}}class N{static permission='default';static requestPermission(){nativeCalls.push({name:'permission',gesture:nativeGesture,active:navigator.userActivation.isActive});N.permission=window.denyPush?'denied':'granted';return Promise.resolve(N.permission)}}Object.defineProperty(window,'Notification',{value:N,configurable:true});window.PushManager=class{};const reg={active:true,pushManager:{async getSubscription(){if(!sub&&localStorage.getItem('__syntheticSub'))sub=makeSub();return sub},async subscribe(){nativeCalls.push({name:'subscribe',identities:Object.keys(localStorage).filter(k=>k.includes('connection-native:')).map(k=>[k,localStorage.getItem(k)])});sub=makeSub();localStorage.setItem('__syntheticSub','true');return sub}},async getNotifications(){return [{close(){nativeCalls.push({name:'close'})}}]}};Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{async register(url,options){nativeCalls.push({name:'register',url,options});return reg},async getRegistration(){return reg}}});})();'''.replace('__KEY__',KEY)
class Fixture(b.Fixture):
 def __init__(self):
  super().__init__();self.config=True;self.rows={};self.dispatches=[];self.signouts=[];self.fail_disable=False;self.edge_lost=False;self.hold_register=False;self.register_held=asyncio.Event();self.register_release=asyncio.Event();self.hold_dispatch=False;self.dispatch_held=asyncio.Event();self.dispatch_release=asyncio.Event();self.native_order=[];self.hold_thought=False;self.thought_held=asyncio.Event();self.thought_release=asyncio.Event()
 async def route(self,route):
  r=route.request;p=urlparse(r.url);actor,user=self.actor(r)
  if p.hostname=='native.test':
   if p.path.endswith('push-config.json'):
    if not self.config:return await route.fulfill(status=404,body='missing')
    base=r.url.rsplit('/',1)[0]+'/'
    return await self.json(route,dict(appBaseUrl=base,workerUrl=base+'sw.js',vapidPublicKey=KEY))
   rel=p.path.removeprefix('/garden/').lstrip('/') or 'index.html'
   if rel=='public-config.json':return await self.json(route,dict(supabaseUrl='https://'+m.HOST,publishableKey='sb_publishable_SYNTHETIC_NOT_A_CREDENTIAL_123456789',loginAliases={}))
   path=ROOT/'dist'/rel
   if path.is_file():return await route.fulfill(status=200,content_type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.webmanifest':'application/manifest+json','.png':'image/png'}.get(path.suffix,'application/octet-stream'),body=path.read_bytes())
   return await route.fulfill(status=404,body='missing')
  if p.hostname==m.HOST:
   if p.path=='/auth/v1/logout':self.signouts.append(user);self.native_order.append('signout');return await self.json(route,{})
   if p.path.startswith('/rest/v1/rpc/'):
    name=p.path.rsplit('/',1)[1]
    if name=='send_thought' and self.hold_thought:self.thought_held.set();await self.thought_release.wait();self.hold_thought=False
    if name in ['register_my_push','list_my_push','disable_my_push']:
     a=r.post_data_json;self.calls.append(dict(name=name,args=a,actor=actor));self.native_order.append(name)
     if name=='register_my_push':
      assert list(a)==['p_id','p_endpoint','p_p256dh','p_auth','p_preview'];self.rows[a['p_id']]=dict(id=a['p_id'],enabled=True,preview=a['p_preview'],created_at=m.STAMP,owner=user)
      if self.hold_register:self.register_held.set();await self.register_release.wait();self.hold_register=False
      return await self.json(route,{k:v for k,v in self.rows[a['p_id']].items() if k!='owner'})
     if name=='disable_my_push':
      assert list(a)==['p_id']
      if self.fail_disable:return await self.error(route,'503','Synthetic unavailable',503)
      self.rows[a['p_id']]['enabled']=False;return await self.json(route,None)
     assert a=={};return await self.json(route,[{k:v for k,v in row.items() if k!='owner'} for row in self.rows.values() if row['owner']==user])
   if p.path=='/functions/v1/dispatch-thought':
    a=r.post_data_json;assert list(a)==['event_id'];self.dispatches.append(dict(owner=user,id=a['event_id']));self.native_order.append('dispatch')
    if self.hold_dispatch:self.dispatch_held.set();await self.dispatch_release.wait();self.hold_dispatch=False
    if self.edge_lost:self.edge_lost=False;return await route.abort('failed')
    row=self.hidden_receipts.get(a['event_id']);assert row and row['sender_id']==actor
    return await self.json(route,dict(event_persisted=True,receipt={k:row[k] for k in ['id','phrase_key','sequence','created_at']},push=dict(targets=1,provider_accepted=1,retriable=0,terminal=0),device_displayed='unknown'))
  return await super().route(route)
async def broadcast(p,event,user=m.U):
 now=int(time.time());enc=lambda x:base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=');token=enc(dict(alg='HS256'))+'.'+enc(dict(sub=user,role='authenticated',exp=now+3600))+'.SYNTHETIC';session=dict(access_token=token,refresh_token='FAKE_ONLY',expires_at=now+3600,expires_in=3600,token_type='bearer',user={**m.USER,'id':user})
 await p.evaluate('''({key,event,session})=>{localStorage.setItem(key,JSON.stringify(session));const channel=new BroadcastChannel(key);channel.postMessage({event,session});setTimeout(()=>channel.close(),100)}''',dict(key='entre-nosotros-auth-'+m.HOST,event=event,session=session))
async def main():
 report=dict(kind=__doc__,checks=[],errors=[],screenshots=[])
 def check(ok,label):report['checks'].append(dict(passed=bool(ok),label=label));assert ok,label
 class MountedHandler(b.Handler):
  def translate_path(self,path):return super().translate_path('/'+path.removeprefix('/garden/'))
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(MountedHandler,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start()
 try:
  async with async_playwright() as pw:
   browser=await pw.chromium.launch(headless=True);report['browser']=browser.version
   async def page(f,base='https://native.test/garden/',preload=None):
    ctx=await browser.new_context(viewport=dict(width=390,height=844));ctx.set_default_timeout(8000);await ctx.route('**/*',f.route);await ctx.route_web_socket('**/*',lambda ws:ws.close());p=await ctx.new_page();p.on('pageerror',lambda e:report['errors'].append(str(e)));p.on('dialog',lambda d:asyncio.create_task(d.accept()));await b.session(p);await p.add_init_script(DOUBLES);
    if preload:await p.add_init_script(preload)
    await p.goto(base+'index.html',wait_until='networkidle');await p.locator('#privateSpace').wait_for(state='visible');return ctx,p
   absent=Fixture();absent.config=False;ctx,p=await page(absent);check(await p.evaluate('nativeCalls.length===0'),'No worker registration, permission or subscribe on load');await p.locator('#profileBubble').click();await p.locator('#nativeSettings summary').click();await p.wait_for_function("()=>document.querySelector('#nativeStatus').textContent.includes('not configured')");check(await p.evaluate("!nativeCalls.some(c=>c.name==='permission'||c.name==='subscribe')"),'Missing configuration is honest with no permission prompt');await p.locator('#profileClose').click()
   for _ in range(10):await p.locator('#affectionButton').click()
   await p.locator('#thoughtReset').wait_for(state='visible');check(len(absent.hidden_receipts)==1 and not absent.dispatches,'Missing native config does not break actual in-app event');await ctx.close()
   f=Fixture();ctx,p=await page(f);check(not await p.locator('#nativePreview').is_checked(),'Preview default OFF');await p.locator('#profileBubble').click();await p.locator('#nativeSettings summary').click();await p.wait_for_function("()=>!document.querySelector('#nativeEnable').disabled");check(await p.evaluate("nativeCalls.every(c=>c.name==='register')"),'Explicit settings prepare only; no prompt or subscription');await p.locator('#nativeEnable').click();await p.wait_for_function("()=>document.querySelector('#nativeStatus').textContent.startsWith('Enabled')")
   calls=await p.evaluate('nativeCalls');permission=next(c for c in calls if c['name']=='permission');sub=next(c for c in calls if c['name']=='subscribe');check(permission['gesture'] and permission['active'],'Permission invoked synchronously in the real direct click stack');check(any(k.endswith(':device') and m.U in k for k,v in sub['identities']),'Captured original Auth UUID/path identity durable BEFORE subscribe');check(all(not c['args']['p_preview'] for c in f.calls if c['name']=='register_my_push'),'Explicit default preview false reaches register RPC');check(await p.locator('#nativeSettings').inner_text() and any(c['name']=='list_my_push' for c in f.calls),'Sanitized authoritative server readback rendered')
   for width in [320,390]:
    await p.set_viewport_size(dict(width=width,height=844))
    for lang in ['en','fr','aeb-TN']:
     await p.locator('#languageSelect').select_option(lang);check(await p.locator('#nativeEnable').is_disabled()==(lang!='en'),f'{width}px {lang}: saved recipient locale gate, no implicit unrelated save');await p.locator('#nativePrepare').scroll_into_view_if_needed();check(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{width}px {lang}: no horizontal overflow');check(await p.locator('#nativePrepare').evaluate('(e)=>{const r=e.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===hit||e.contains(hit)}'),f'{width}px {lang}: scrolled control is hit-test reachable');target=OUT/f'{width}-{lang}.png';await p.screenshot(path=str(target),full_page=True);report['screenshots'].append(str(target));await p.locator('#nativeSettings').screenshot(path=str(OUT/f'{width}-{lang}-panel.png'))
   await p.locator('#languageSelect').select_option('en');await p.locator('#ownBio').fill('Retained profile draft');image=base64.b64decode(await p.evaluate("()=>{const c=document.createElement('canvas');c.width=2;c.height=2;return c.toDataURL().split(',')[1]}"));await p.locator('#avatarFile').set_input_files(dict(name='synthetic.png',mimeType='image/png',buffer=image));preview_url=await p.locator('#avatarPreview').get_attribute('src');await broadcast(p,'TOKEN_REFRESHED');await p.wait_for_timeout(400);check(await p.locator('#ownBio').input_value()=='Retained profile draft' and await p.locator('#avatarPreview').get_attribute('src')==preview_url and await p.locator('#nativePreview').is_checked()==False,'TOKEN_REFRESHED cancels/reprepares native controller without clearing B1 draft or C1 File preview');await p.wait_for_function("()=>!document.querySelector('#nativeEnable').disabled")
   await p.locator('#profileClose').click();f.edge_lost=True
   for _ in range(10):await p.locator('#affectionButton').click()
   await p.wait_for_function("()=>document.querySelector('#nativeDelivery button')");await p.wait_for_timeout(250);event=f.dispatches[-1]['id'];check(f.dispatches[-1]['owner']==m.U,'Ten-tap event dispatch captures original Auth UUID');check(await p.locator('#nativeDelivery').inner_text() and 'unconfirmed' in await p.locator('#nativeDelivery').inner_text(),'Lost Edge response remains uncertain, never delivered');await p.reload(wait_until='networkidle');await p.locator('#privateSpace').wait_for(state='visible');await p.locator('#nativeDelivery button').click();await p.wait_for_function("()=>document.querySelector('#nativeDelivery').textContent.includes('Provider accepted: 1 / 1')");check([x['id'] for x in f.dispatches]==[event,event],'Reload/explicit native retry reuses exactly same event UUID');check('Device display: unknown' in await p.locator('#nativeDelivery').inner_text(),'Stored/provider acceptance/device display are distinct truthful statuses')
   # A dispatch still in flight when forced B arrives cannot paint B or clear A IDs.
   await p.evaluate('''()=>{const k=Object.keys(localStorage).find(k=>k.includes('connection-native:')&&k.endsWith(':events'));const rows=JSON.parse(localStorage.getItem(k));delete rows[0].push;localStorage.setItem(k,JSON.stringify(rows));}''');await p.reload(wait_until='networkidle');await p.locator('#privateSpace').wait_for(state='visible');f.hold_dispatch=True;await p.locator('#nativeDelivery button').click();await asyncio.wait_for(f.dispatch_held.wait(),5);await broadcast(p,'SIGNED_IN',b.U2);await p.wait_for_timeout(150);f.dispatch_release.set();await p.wait_for_function("()=>document.querySelector('#languageSelect').value==='fr'");check(not await p.locator('#nativeDelivery').inner_text(),'Late A native receipt cannot paint B UI');check(await p.evaluate('(u)=>Object.keys(localStorage).some(k=>k.includes(u)&&k.endsWith(":events"))',m.U),'Forced change retains uncertain A metadata identities');await ctx.close()
   # Explicit denied/unsupported/unmapped states never silently enroll or delete.
   for kind,preload,expected in [('denied','window.denyPush=true','Permission denied'),('unsupported','delete window.PushManager','unavailable in this browser'),('unknown',"localStorage.setItem('__syntheticSub','true')",'unmapped browser subscription')]:
    fc=Fixture();cc,cp=await page(fc,preload=preload);await cp.locator('#profileBubble').click();await cp.locator('#nativeSettings summary').click()
    if kind=='denied':await cp.wait_for_function("()=>!document.querySelector('#nativeEnable').disabled");await cp.locator('#nativeEnable').click()
    await cp.wait_for_function('(text)=>document.querySelector("#nativeStatus").textContent.includes(text)',arg=expected);check(not any(c['name']=='register_my_push' for c in fc.calls),kind+' state is honest and never registers/adopts');await cc.close()
   vr=Fixture();vc,vp=await page(vr);await vp.locator('#profileBubble').click();await vp.locator('#nativeSettings summary').click();await vp.wait_for_function("()=>!document.querySelector('#nativeEnable').disabled");await vp.locator('#nativeEnable').click();await vp.wait_for_function("()=>document.querySelector('#nativeStatus').textContent.startsWith('Enabled')");old_id=next(c['args']['p_id'] for c in vr.calls if c['name']=='register_my_push');await vp.evaluate('window.badVapid=true');await vp.locator('#nativeEnable').click();await vp.wait_for_function("()=>document.querySelector('#nativeStatus').textContent.includes('VAPID binding differs')");check(len([c for c in vr.calls if c['name']=='register_my_push'])==1,'Mismatched VAPID binding never overwrites or creates a new identity');await vp.locator('#nativeDisable').click();await vp.wait_for_function("()=>document.querySelector('#nativeStatus').textContent.startsWith('Server opt-out')");await vp.evaluate('window.badVapid=false');await vp.locator('#nativePrepare').click();await vp.wait_for_function("()=>!document.querySelector('#nativeEnable').disabled");await vp.locator('#nativePreview').check();await vp.locator('#nativeEnable').click();await vp.wait_for_function("()=>document.querySelector('#nativeStatus').textContent.startsWith('Enabled')");new_record=[c for c in vr.calls if c['name']=='register_my_push'][-1];check(new_record['args']['p_id']!=old_id and new_record['args']['p_preview']==True,'Explicit disable/reconcile then new consent creates one fresh identity with preview true');await vc.close()
   # Real quota exhaustion (no Storage API double) prevents fresh subscribe.
   q=Fixture();qc,qp=await page(q);await qp.locator('#profileBubble').click();await qp.locator('#nativeSettings summary').click();await qp.wait_for_function("()=>!document.querySelector('#nativeEnable').disabled")
   filled=await qp.evaluate('''()=>{let n=0;for(const size of [100000,1000,10,1]){for(let i=0;i<10000;i++){try{localStorage.setItem('__quota'+n,'x'.repeat(size));n++}catch(e){if(e.name!=='QuotaExceededError')throw e;break}}}return n}''');await qp.locator('#nativeEnable').click();await qp.wait_for_function("()=>document.querySelector('#nativeStatus').textContent.includes('storage failed')");check(filled>0 and await qp.evaluate("!nativeCalls.some(c=>c.name==='subscribe')"),'Actual browser localStorage quota exhaustion: visible failure before subscribe');await qc.close()
   # Held native mutation serializes logout; failed disable blocks preserving C1/B1 views.
   g=Fixture();gc,gp=await page(g);await gp.locator('#profileBubble').click();await gp.locator('#nativeSettings summary').click();await gp.wait_for_function("()=>!document.querySelector('#nativeEnable').disabled");await gp.locator('#avatarFile').set_input_files(dict(name='synthetic-retained.png',mimeType='image/png',buffer=image));retained_file=await gp.locator('#avatarPreview').get_attribute('src');g.hold_register=True;await gp.locator('#nativeEnable').click();await asyncio.wait_for(g.register_held.wait(),5);await gp.locator('#logout').click();await gp.wait_for_timeout(100);check(not g.signouts and await gp.locator('#privateSpace').is_visible(),'Explicit logout freezes/drains held device registration before Auth signout');g.fail_disable=True;g.register_release.set();await gp.locator('#nativeRecovery').wait_for(state='visible');check(not g.signouts and await gp.locator('#privateSpace').is_visible() and await gp.locator('#avatarPreview').get_attribute('src')==retained_file,'Failed disable blocks logout, keeps C1 original File quarantine/private view and actionable retry');check(await gp.evaluate('(u)=>Object.keys(localStorage).some(k=>k.includes(u)&&k.endsWith(":device"))',m.U),'Blocked transition retains original durable device identity');g.fail_disable=False;await gp.locator('#nativeRecovery button').click();await gp.locator('#privateSpace').wait_for(state='hidden');check(g.signouts==[m.U] and g.native_order.index('disable_my_push')<g.native_order.index('signout'),'Successful retry disables and reads back BEFORE signout');check(await gp.evaluate("nativeCalls.some(c=>c.name==='unsubscribe')&&nativeCalls.some(c=>c.name==='close')&&!Object.keys(localStorage).some(k=>k.includes('connection-native:')&&k.endsWith(':device'))"),'Confirmed logout unsubscribes, closes notifications and only then clears mapping');await gc.close()
   # The SAME transition gate also drains the actual affection/outbox mutation.
   h=Fixture();hc,hp=await page(h);h.hold_thought=True
   for _ in range(10):await hp.locator('#affectionButton').click()
   await asyncio.wait_for(h.thought_held.wait(),5);await hp.locator('#logout').click();await hp.wait_for_timeout(100);check(not h.signouts and await hp.locator('#privateSpace').is_visible(),'Shared transition serializes actual held affection/outbox send, not just settings');h.thought_release.set();await hp.locator('#privateSpace').wait_for(state='hidden');check(h.signouts==[m.U] and not h.dispatches,'Outbox drain completes before signout; frozen native dispatch retains same event for later owner retry');await hc.close()
   # Actual worker registration on a real loopback HTTP server, distinct from API doubles.
   for mount in ['','garden/']:
    real=await browser.new_context();rp=await real.new_page();actual=f'http://127.0.0.1:{server.server_port}/'+mount;await rp.goto(actual+'index.html');scope=await rp.evaluate("async()=>{const r=await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;return r.scope}");check(scope==actual,'Actual classic worker imports reviewed push worker and activates at '+mount+' real HTTP scope');await real.close()
   # Root and subpath resource resolution against actual built HTML/manifest bytes.
   for base in ['https://native.test/','https://native.test/garden/']:
    rc,rp=await page(Fixture(),base);links=await rp.evaluate("()=>({manifest:document.querySelector('link[rel=manifest]').href,icon:document.querySelector('link[rel=apple-touch-icon]').href,csp:document.querySelector('meta[http-equiv]').content})");check(links['manifest']==base+'push/manifest.webmanifest' and links['icon']==base+'push/icons/apple-touch-icon-180.png',base+' built relative manifest/icon paths');resources=await rp.evaluate("async()=>{const url=document.querySelector('link[rel=manifest]').href;const r=await fetch(url),m=await r.json();return {scope:new URL(m.scope,url).href,start:new URL(m.start_url,url).href,statuses:await Promise.all(m.icons.map(async i=>(await fetch(new URL(i.src,url))).status))}}");check(resources['scope']==base and resources['start']==base and all(s==200 for s in resources['statuses']),base+' actual manifest start/scope and all real icon resources HTTP 200');check("worker-src 'self'" in links['csp'] and "manifest-src 'self'" in links['csp'] and 'unsafe-' not in links['csp'],'Strict actual built CSP retains no eval/inline script');await rc.close()
   check(not report['errors'],'No unexpected built application page errors');await browser.close()
 except Exception:
  report['failure']=traceback.format_exc()
  try:report['dom']=await p.locator('body').inner_text()
  except:pass
 finally:
  server.shutdown();report['passed']='failure' not in report and not report['errors'];(OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps(report,ensure_ascii=False,indent=2));return report['passed']
if __name__=='__main__':raise SystemExit(0 if asyncio.run(main()) else 1)
