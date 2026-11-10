"""Maintained C2 wave1 boundary regressions: built SDK + synthetic HTTP/Push.
Platform decode wrapping delays a real decoder, never replaces product methods.
"""
import asyncio,base64,importlib.util,json,os,traceback
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ['C2_WAVE1_ARTIFACT_ROOT']);OUT.mkdir(parents=True,exist_ok=True)
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
n=load('wave_native','native-c2-browser.py');a=load('wave_avatar','avatar-c1-browser.py')
class Fixture(n.Fixture,a.Fixture):
 def __init__(self):
  super().__init__();a.Fixture.__init__(self);self.hold_stage=None;self.enter=asyncio.Event();self.release=asyncio.Event()
 async def route(self,route):
  p=urlparse(route.request.url)
  if self.hold_stage and p.path.endswith('/'+self.hold_stage):
   self.enter.set();await self.release.wait();self.hold_stage=None
  if p.hostname==n.m.HOST and (p.path.startswith('/storage/v1/object/') or p.path=='/rest/v1/profile_avatars' or p.path.rsplit('/',1)[-1] in ['reserve_avatar','finalize_avatar','mark_avatar_delete','finish_avatar_delete']):return await a.Fixture.route(self,route)
  return await super().route(route)
async def main():
 report={'kind':__doc__,'checks':[],'errors':[]}
 def check(ok,label):report['checks'].append({'passed':bool(ok),'label':label});assert ok,label
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True);report['browser']=browser.version
  async def page():
   f=Fixture();ctx=await browser.new_context();ctx.set_default_timeout(6500);await ctx.route('**/*',f.route);await ctx.route_web_socket('**/*',lambda ws:ws.close());p=await ctx.new_page();p.on('pageerror',lambda e:report['errors'].append(str(e)));p.on('dialog',lambda d:asyncio.create_task(d.accept()));await n.b.session(p);await p.add_init_script(n.DOUBLES);await p.goto('https://native.test/garden/index.html',wait_until='networkidle');await p.locator('#privateSpace').wait_for(state='visible');await p.locator('#profileBubble').click()
   f.image=base64.b64decode(await p.evaluate("()=>{const c=document.createElement('canvas');c.width=4;c.height=3;return c.toDataURL('image/png').split(',')[1]}"));return f,ctx,p
  async def enable(p):
   await p.locator('#nativeSettings summary').click();await p.wait_for_function("()=>!document.querySelector('#nativeEnable').disabled");await p.locator('#nativeEnable').click();await p.wait_for_function("()=>document.querySelector('#nativeStatus').textContent.startsWith('Enabled')")
  async def pick(p,f):
   await p.locator('#avatarFile').dispatch_event('click');await p.locator('#avatarFile').set_input_files({'name':'original.png','mimeType':'image/png','buffer':f.image})
  async def selected(p):await p.wait_for_function("()=>document.querySelector('#avatarPreview').src.startsWith('blob:')")
  try:
   f,ctx,p=await page()
   await p.evaluate("()=>{const decode=createImageBitmap;window.validationHeld=false;window.createImageBitmap=async(...args)=>{window.validationHeld=true;await new Promise(r=>window.releaseValidation=r);return decode(...args)}}")
   await pick(p,f);await p.wait_for_function('()=>window.validationHeld');await p.locator('#logout').click();await p.wait_for_timeout(150)
   check(not f.signouts and await p.locator('#privateSpace').is_visible(),'Pending real image validation is a logout-drained lease')
   await p.evaluate('()=>releaseValidation()');await p.locator('#privateSpace').wait_for(state='hidden')
   check(f.signouts==[n.m.U] and not any(x['name']=='reserve_avatar' for x in f.calls) and not await p.locator('#avatarPreview').get_attribute('src'),'Frozen validation completion cannot retain preview or reserve; signout follows drain');await ctx.close()
   f,ctx,p=await page();await enable(p);await p.locator('#avatarFile').dispatch_event('click');f.hold_stage='disable_my_push';await p.locator('#logout').click();await asyncio.wait_for(f.enter.wait(),5)
   await p.locator('#avatarFile').set_input_files({'name':'late.png','mimeType':'image/png','buffer':f.image});await p.wait_for_timeout(150)
   check(not await p.locator('#avatarPreview').get_attribute('src'),'Picker opened before freeze cannot deposit a late selected File');f.release.set();await p.locator('#privateSpace').wait_for(state='hidden');await ctx.close()
   f,ctx,p=await page();await enable(p);await pick(p,f);await selected(p);original=await p.locator('#avatarPreview').get_attribute('src');f.hold_stage='disable_my_push';await p.locator('#logout').click();await asyncio.wait_for(f.enter.wait(),5);await n.broadcast(p,'TOKEN_REFRESHED');await p.locator('#nativeRecovery').wait_for(state='visible')
   check(await p.locator('#avatarPreview').get_attribute('src')==original and await p.locator('#avatarFile').is_disabled(),'Same-owner refresh during logout keeps exact original preview quarantined with visible recovery')
   f.release.set();await p.wait_for_timeout(350);check(not f.signouts and await p.locator('#nativeRecovery').is_visible(),'Obsolete refreshed cleanup cannot sign out or hide current recovery')
   await p.locator('#nativeRecovery button').click();await p.locator('#privateSpace').wait_for(state='hidden');check(f.signouts==[n.m.U],'Same-owner refreshed blocked recovery explicitly retries and signs out A');await ctx.close()
   f,ctx,p=await page();await pick(p,f);await selected(p);await p.locator('#avatarConsent').check();await p.locator('#avatarUpload').click();await p.wait_for_function("()=>document.querySelector('#profilePhoto').dataset.avatarId");f.hold_stage='mark_avatar_delete';await p.locator('#avatarRemoveActive').click();await asyncio.wait_for(f.enter.wait(),5);await p.locator('#logout').click();await p.wait_for_timeout(150)
   check(not f.signouts and await p.locator('#privateSpace').is_visible(),'Already-issued avatar cleanup is drained before signout')
   f.release.set();await p.locator('#privateSpace').wait_for(state='hidden');check(f.signouts==[n.m.U] and not any(x['name']=='finish_avatar_delete' for x in f.calls),'Frozen old cleanup cannot issue remove/finish after held mark resolves');await ctx.close()
   check(not report['errors'],'No unexpected browser page errors')
  except Exception:report['failure']=traceback.format_exc()
  finally:await browser.close()
 report['passed']='failure' not in report and not report['errors'];(OUT/'results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));return report['passed']
if __name__=='__main__':raise SystemExit(0 if asyncio.run(main()) else 1)
