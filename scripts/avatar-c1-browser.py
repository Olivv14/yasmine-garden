"""Actual built dist/Chromium/SDK; explicitly FAKE HTTP, synthetic valid images only."""
import asyncio,base64,hashlib,importlib.util,json,traceback,uuid
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
from urllib.parse import urlparse,parse_qs,unquote
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('b1',ROOT/'scripts/profile-b1-browser.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b);m=b.m
OUT=ROOT.parent/'execution/avatar-c1';OUT.mkdir(exist_ok=True)
class Fixture(b.Fixture):
 def __init__(self):
  super().__init__();self.fail_upload=False;self.fail_finalize=False;self.conflict_avatar=False;self.hold_upload=False;self.upload_held=asyncio.Event();self.upload_release=asyncio.Event();self.image=b'';self.network_auth=False
 async def route(self,route):
  r=route.request;p=urlparse(r.url);actor,_=self.actor(r)
  if p.hostname==m.HOST:
   if p.path=='/auth/v1/user' and self.network_auth:return await route.abort('failed')
   if p.path=='/rest/v1/profile_avatars':
    rows=[dict(x) for x in self.tables['profile_avatars'] if x['owner_id']==actor or x['status']=='ready' and x['active']]
    for k,vs in parse_qs(p.query).items():
     for v in vs:
      if v.startswith('eq.'):rows=[x for x in rows if str(x.get(k)).lower()==v[3:]]
    offset=int(parse_qs(p.query).get('offset',[0])[0]);rows=rows[offset:offset+200]
    if 'application/vnd.pgrst.object+json' in r.headers.get('accept',''):rows=rows[0] if len(rows)==1 else None
    return await self.json(route,rows)
   if p.path.startswith('/rest/v1/rpc/') and p.path.rsplit('/',1)[1] in ['reserve_avatar','finalize_avatar','mark_avatar_delete','finish_avatar_delete']:
    name=p.path.rsplit('/',1)[1];a=r.post_data_json;self.calls.append(dict(name=name,args=a,actor=actor));return await self.avatar_rpc(route,name,a,actor)
   prefix='/storage/v1/object/'
   if p.path.startswith(prefix):
    path=unquote(p.path[len(prefix):]);path=path.removeprefix('authenticated/');bucket,_,key=path.partition('/')
    if bucket=='connection-avatars':
     if r.method=='POST':
      assert r.headers.get('x-upsert')=='false';assert self.image in r.post_data_buffer
      if self.fail_upload:self.fail_upload=False;return await self.error(route,'503','Synthetic unavailable',503)
      self.objects[key]=self.image
      if self.hold_upload:self.upload_held.set();await self.upload_release.wait();self.hold_upload=False
      return await self.json(route,{'Key':bucket+'/'+key})
     if r.method=='GET':
      if key not in self.objects:return await self.error(route,'404','Synthetic missing bytes',404)
      return await route.fulfill(status=200,content_type='image/png',body=self.objects[key])
     if r.method=='DELETE':
      assert all(next(x for x in self.tables['profile_avatars'] if x['object_key']==k)['status']=='deleting' for k in r.post_data_json['prefixes'])
      for k in r.post_data_json['prefixes']:self.objects.pop(k,None)
      return await self.json(route,[])
  return await super().route(route)
 async def avatar_rpc(self,route,name,a,actor):
  assert list(a)==(['p_id','p_mime_type','p_expected_active_id'] if name=='reserve_avatar' else ['p_id'])
  rows=self.tables['profile_avatars'];row=next((x for x in rows if x['id']==a['p_id']),None)
  active=next((x for x in rows if x['owner_id']==actor and x['active']),None)
  if name=='reserve_avatar':
   if not row:
    if a['p_expected_active_id']!=(active['id'] if active else None):return await self.error(route,'40001','Synthetic active conflict')
    row=dict(id=a['p_id'],pair_id=m.PAIR,owner_id=actor,object_key=f'{m.PAIR}/{actor}/{a["p_id"]}',mime_type=a['p_mime_type'],status='pending',active=False,expected_active_id=a['p_expected_active_id'],reserved_bytes=1048576,size_bytes=None,created_at=m.STAMP,updated_at=m.STAMP,publication_invalidated=False);rows.append(row)
   return await self.json(route,row)
  if name=='finalize_avatar':
   if self.fail_finalize:return await self.error(route,'503','Synthetic uncertain',503)
   if self.conflict_avatar or row['publication_invalidated']:self.conflict_avatar=False;row['publication_invalidated']=True;return await self.error(route,'40001','Synthetic CAS conflict')
   if row['object_key'] not in self.objects:return await self.error(route,'22023','Synthetic no original bytes')
   for x in rows:
    if x['owner_id']==actor and x['id']!=row['id']:
     if x['active']:x.update(active=False,status='deleting')
     elif x['status']=='pending':x['publication_invalidated']=True
   row.update(active=True,status='ready',size_bytes=len(self.image),reserved_bytes=len(self.image));self.revision+=1;return await self.json(route,row)
  if name=='mark_avatar_delete':row.update(status='deleting',active=False);self.revision+=1;return await self.json(route,row)
  assert row['object_key'] not in self.objects;rows.remove(row);return await self.json(route,None)
async def main():
 report=dict(kind='Real built Chromium/SDK, deliberately FAKE HTTP, synthetic valid PNG, no live cloud',checks=[],errors=[])
 def check(ok,label):
  report['checks'].append(dict(passed=bool(ok),label=label));assert ok,label
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(b.Handler,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start();f=Fixture()
 try:
  async with async_playwright() as pw:
   browser=await pw.chromium.launch(headless=True);report['browser']=browser.version;ctx=await browser.new_context(viewport=dict(width=390,height=844));ctx.set_default_timeout(8000);await ctx.route('**/*',f.route);await ctx.route_web_socket('**/*',lambda ws:ws.close());p=await ctx.new_page();p.on('pageerror',lambda e:report['errors'].append(str(e)));p.on('dialog',lambda d:asyncio.create_task(d.accept()));await b.session(p)
   await p.add_init_script("window.revoked=[];const r=URL.revokeObjectURL;URL.revokeObjectURL=u=>{revoked.push(u);r.call(URL,u)}")
   await p.goto(f'http://127.0.0.1:{server.server_port}/index.html',wait_until='networkidle');await p.locator('#privateSpace').wait_for(state='visible');await p.locator('#profileBubble').click()
   f.image=base64.b64decode(await p.evaluate("()=>{const c=document.createElement('canvas');c.width=4;c.height=3;c.getContext('2d').fillRect(0,0,4,3);return c.toDataURL('image/png').split(',')[1]}"));report['image_sha256']=hashlib.sha256(f.image).hexdigest()
   async def pick(data=None,mime='image/png',name='synthetic.png'):
    await p.locator('#avatarFile').dispatch_event('click');await p.locator('#avatarFile').set_input_files(dict(name=name,mimeType=mime,buffer=data if data is not None else f.image));await p.wait_for_function("()=>!document.querySelector('#avatarRefresh').disabled")
   async def refresh():
    await p.evaluate("document.dispatchEvent(new Event('visibilitychange'))");await p.wait_for_timeout(400)
   async def wait_header():await p.wait_for_function("()=>{const i=document.querySelector('#profilePhoto');return i?.src.startsWith('blob:')&&i.complete&&i.naturalWidth===4}")
   check(not await p.locator('#profilePhoto').get_attribute('src'),'No metadata URL or initial fake photo')
   await pick(b'not-heic','image/heic','camera.heic');check(await p.locator('#avatarStatus').inner_text()==b.CAT['en'].get('avatar.error.AVATAR.HEIC.UNSUPPORTED'),'Localized HEIC rejection; no request')
   await pick();check(await p.locator('#avatarPreview').evaluate('(i)=>i.complete&&i.naturalWidth===4'),'Real valid synthetic image decoded in local preview');check(len(f.calls)==0,'Selection does not reserve or upload')
   await p.locator('#avatarUpload').click();check(len(f.calls)==0,'Explicit consent required before original-byte upload')
   for width in [320,390]:
    await p.set_viewport_size(dict(width=width,height=844))
    for lang in ['en','fr','aeb-TN']:
     await p.locator('#languageSelect').select_option(lang)
     for theme in ['dark','light','pastel','barcelona','tunisia','italy','lavender','ocean','forest','rose']:
      await p.locator('#themeSelect').select_option(theme);assert await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,lang,theme)
     check(await p.locator('#avatarStatus').inner_text()==b.CAT[lang]['avatar.error.AVATAR.CONSENT.REQUIRED'],f'{width}px {lang}: localized consent error and ten themes without overflow')
    if width==390:await p.screenshot(path=str(OUT/'390-aeb-TN-selected.png'),full_page=True)
   preview=await p.locator('#avatarPreview').get_attribute('src');await p.locator('#ownBio').fill('Newer untouched draft');await p.locator('#languageSelect').select_option('fr');await p.locator('#themeSelect').select_option('ocean');check(preview==await p.locator('#avatarPreview').get_attribute('src') and await p.locator('#ownBio').input_value()=='Newer untouched draft','Theme/language keep same File preview and newer B1 draft')
   f.fail_upload=True;await p.locator('#avatarConsent').check();await p.locator('#avatarUpload').click();await p.wait_for_function("()=>!document.querySelector('#avatarUpload').disabled");first=next(x['args']['p_id'] for x in f.calls if x['name']=='reserve_avatar');check(not await p.locator('#profilePhoto').get_attribute('src'),'Failed upload never displays a profile photo')
   await p.locator('#avatarUpload').click();await wait_header();check([x['args']['p_id'] for x in f.calls if x['name']=='reserve_avatar']==[first,first],'Explicit retry retains same controller UUID');check(await p.locator('#ownBio').input_value()=='Newer untouched draft','Avatar readback does not reset B1 draft')
   check(f.objects[next(x['object_key'] for x in f.tables['profile_avatars'] if x['id']==first)]==f.image,'Actual original valid PNG bytes in authenticated Storage upload')
   await p.reload(wait_until='networkidle');await p.locator('#privateSpace').wait_for(state='visible');await wait_header();check(True,'Server ready-active photo reloads as authenticated Blob')
   await p.locator('#profileBubble').click();f.fail_finalize=True;await pick();await p.locator('#avatarConsent').check();await p.locator('#avatarUpload').click();await p.wait_for_function("()=>!document.querySelector('#avatarUpload').disabled");pending=f.tables['profile_avatars'][-1];pending_id=pending['id'];check(pending['status']=='pending','Uncertain finalize remains pending, not success')
   await p.reload(wait_until='networkidle');await p.locator('#privateSpace').wait_for(state='visible');await p.locator('#profileBubble').click();f.fail_finalize=False;await p.locator(f'[data-avatar-id="{pending_id}"] button').first.click();await p.wait_for_function('(id)=>document.querySelector("#profilePhoto").dataset.avatarId===id',arg=pending_id);await wait_header();check(f.tables['profile_avatars'][-1]['active'],'Explicit reload recovery finalizes already uploaded bytes')
   f.conflict_avatar=True;await pick();await p.locator('#avatarConsent').check();await p.locator('#avatarUpload').click();await p.wait_for_function("()=>!document.querySelector('#avatarRefresh').disabled");conflict=f.tables['profile_avatars'][-1]['id'];check(await p.locator('#avatarUpload').is_hidden(),'Conflict is cleanup-only, no blind new intent');await p.locator('#avatarDiscard').click();await p.wait_for_function("()=>!document.querySelector('#avatarFile').disabled");check(not any(x['id']==conflict for x in f.tables['profile_avatars']),'Conflict explicit cleanup marks/removes/finishes exact UUID')
   # Another device unshares/removes the authoritative active row; resnapshot replaces it.
   for x in f.tables['profile_avatars']:x.update(active=False,status='deleting')
   f.revision+=1;await refresh();await p.wait_for_function("()=>!document.querySelector('#profilePhoto').hasAttribute('src')");check(True,'New authoritative unshare removes header src and revokes Blob')
   # Missing bytes after reload require honest discard/reselect, never reattach a different file.
   await pick();f.fail_upload=True;await p.locator('#avatarConsent').check();await p.locator('#avatarUpload').click();await p.wait_for_function("()=>!document.querySelector('#avatarRefresh').disabled");lost=f.tables['profile_avatars'][-1]['id'];await p.reload(wait_until='networkidle');await p.locator('#privateSpace').wait_for(state='visible');await p.locator('#profileBubble').click();await p.locator(f'[data-avatar-id="{lost}"] button').first.click();await p.wait_for_function("()=>!document.querySelector('#avatarRefresh').disabled");check(await p.locator('#avatarStatus').inner_text()==b.CAT['en']['avatar.error.AVATAR.RESELECTION.REQUIRED'],'Reload without server bytes says discard/reselect, not resumable upload')
   await p.locator('#avatarDiscard').click();await p.wait_for_function("()=>!document.querySelector('#avatarFile').disabled")
   # Original retained File/UUID survives temporary Auth-network failure.
   await pick();await p.locator('#avatarConsent').check();f.network_auth=True;await p.locator('#avatarUpload').click();await p.wait_for_function("()=>!document.querySelector('#avatarRefresh').disabled");check(await p.locator('#privateSpace').is_visible() and await p.locator('#avatarFile').is_disabled(),'Transient getUser failure fails closed without logout or losing File');f.network_auth=False;await p.locator('#avatarUpload').click();await wait_header();check(True,'Explicit identical-context retry resumes retained original File')
   # Explicit cleanup is actionable even while its own upload response is held.
   await pick();await p.locator('#avatarConsent').check();f.hold_upload=True;await p.locator('#avatarUpload').click();await asyncio.wait_for(f.upload_held.wait(),5);drain=f.tables['profile_avatars'][-1];await p.locator('#avatarDiscard').click();await p.wait_for_timeout(100);check(drain['status']=='deleting' and drain['object_key'] in f.objects,'Cleanup marks deny-first and waits for the held own upload before removal');f.upload_release.set();await p.wait_for_function("()=>!document.querySelector('#avatarFile').disabled");check(not any(x['id']==drain['id'] for x in f.tables['profile_avatars']) and drain['object_key'] not in f.objects,'Explicit held-upload cleanup drains, removes, finishes and verifies absence');f.upload_held=asyncio.Event();f.upload_release=asyncio.Event()
   # Hold real upload response across logout, then ensure no late finalize/display.
   await pick();await p.locator('#avatarConsent').check();f.hold_upload=True;await p.locator('#avatarUpload').click();await asyncio.wait_for(f.upload_held.wait(),5);before=len([x for x in f.calls if x['name']=='finalize_avatar']);await p.locator('#logout').click();await p.wait_for_timeout(150);check(await p.locator('#privateSpace').is_visible() and await p.locator('#avatarFile').is_disabled(),'Logout freezes C1 and does not confirm signout before held upload drains');check(len([x for x in f.calls if x['name']=='finalize_avatar'])==before,'No finalize while logout waits for held upload');f.upload_release.set();await p.locator('#privateSpace').wait_for(state='hidden');check(not await p.locator('#profilePhoto').get_attribute('src') and not await p.locator('#avatarPreview').get_attribute('src') and await p.locator('#avatarFile').input_value()=='','Confirmed logout after drain clears picker/preview/private image');check(len([x for x in f.calls if x['name']=='finalize_avatar'])==before,'Late upload completion after logout cannot finalize');check(len(await p.evaluate('revoked'))>0,'Actual object URLs revoked')
   calls=len(f.calls);await p.evaluate("()=>{const i=document.querySelector('#avatarFile');const d=new DataTransfer();d.items.add(new File([new Uint8Array([1,2,3])],'old.png',{type:'image/png'}));i.files=d.files;i.dispatchEvent(new Event('change'));}");await p.wait_for_timeout(100);check(len(f.calls)==calls and not await p.locator('#avatarPreview').get_attribute('src'),'Late picker change after logout cannot deposit File or preview in another binding')
   check(not report['errors'],'Zero unexpected page errors');await browser.close()
 except Exception:
  report['failure']=traceback.format_exc()
  try:report['dom']=await p.locator('body').inner_text()
  except:pass
 finally:
  report['calls']=f.calls;report['passed']='failure' not in report and not report['errors'];report['hashes']={str(x.relative_to(ROOT)):hashlib.sha256(x.read_bytes()).hexdigest() for x in [ROOT/'src/avatar.js',ROOT/'src/avatar-ui.js',ROOT/'src/auth.js',ROOT/'src/app.js',ROOT/'dist/assets/app.js']};(OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));server.shutdown()
 print(json.dumps({k:report[k] for k in ['passed','checks','errors','failure'] if k in report},ensure_ascii=False,indent=2));return report['passed']
if __name__=='__main__':raise SystemExit(0 if asyncio.run(main()) else 1)
