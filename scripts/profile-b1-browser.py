"""B1 actual production dist in Chromium. Deliberately FAKE HTTP, not live Supabase/RLS."""
import asyncio,base64,importlib.util,json,time,traceback,uuid
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from urllib.parse import urlparse,parse_qs
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('base',ROOT/'scripts/frontend-integrity-regressions.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
P2='20000000-0000-4000-8000-000000000002';U2='10000000-0000-4000-8000-000000000002'
OUT=ROOT.parent/'execution/profile-b1';OUT.mkdir(exist_ok=True)
CAT={lang:json.loads((ROOT/f'experience/locales/{lang}.json').read_text(encoding='utf8')) for lang in ['en','fr','aeb-TN']}
class Fixture(m.Fixture):
 def __init__(self):
  super().__init__();self.reads=[];self.hold=None;self.lost=None;self.conflict=None;self.no_commit=None;self.missing=False;self.hidden_receipts={};self.hold_event=asyncio.Event();self.release_event=asyncio.Event()
  self.tables['users_profiles']+=[dict(id=P2,auth_user_id=U2,display_name='<img src=x onerror=alert(1)> ياسمين',created_at=m.STAMP)]
  self.tables['pair_members']+=[dict(pair_id=m.PAIR,slot=2,profile_id=P2)]
  self.tables['profile_details']=[dict(profile_id=m.P,pair_id=m.PAIR,bio='Actual biography',mood_animal='hug',version=3,updated_at=m.STAMP)]
  self.tables['profile_preferences']=[dict(profile_id=m.P,pair_id=m.PAIR,theme='dark',locale='en',partner_nickname='Existing private nickname',version=9,updated_at=m.STAMP),dict(profile_id=P2,pair_id=m.PAIR,theme='light',locale='fr',partner_nickname=None,version=21,updated_at=m.STAMP)]
 def actor(self,request):
  token=request.headers.get('authorization','').split(' ')[-1]
  try:sub=json.loads(base64.urlsafe_b64decode(token.split('.')[1]+'=='))['sub']
  except:sub=m.U
  return (P2,U2) if sub==U2 else (m.P,m.U)
 async def route(self,route):
  request=route.request;p=urlparse(request.url);actor,user=self.actor(request)
  if p.hostname==m.HOST:
   if p.path=='/auth/v1/user':return await self.json(route,{**m.USER,'id':user,'user_metadata':{'avatar_url':'https://'+m.HOST+'/not-an-avatar.jpg'}})
   if p.path.startswith('/rest/v1/rpc/'):
    name=p.path.rsplit('/',1)[1]
    if name in ['save_my_profile','save_my_preferences','send_thought','mark_thought_read']:
     a=request.post_data_json;self.calls.append(dict(name=name,args=a,actor=actor))
     return await self.b1rpc(route,name,a,actor)
   if p.path.startswith('/rest/v1/') and not p.path.startswith('/rest/v1/rpc/'):
    table=p.path.rsplit('/',1)[1];query=parse_qs(p.query);self.reads.append(dict(table=table,query=query,actor=actor))
    if table in ['profile_details','profile_preferences','thought_events','sync_signals']:
     if self.missing and table=='profile_details':return await self.error(route,'42P01','002 not installed')
     rows=[dict(profile_id=actor,pair_id=m.PAIR,revision=self.revision,updated_at=m.STAMP)] if table=='sync_signals' else list(self.tables[table])
     if table=='profile_preferences':rows=[r for r in rows if r['profile_id']==actor]
     if table=='thought_events':rows=[r for r in rows if r['recipient_id']==actor]
     for key,values in query.items():
      for v in values:
       if v.startswith('eq.'):rows=[r for r in rows if str(r.get(key))==v[3:]]
     if table=='thought_events':rows.sort(key=lambda r:(r['created_at'],r['id']),reverse=True)
     start=int(query.get('offset',[0])[0]);limit=int(query.get('limit',[200])[0]);rows=rows[start:start+limit]
     if 'application/vnd.pgrst.object+json' in request.headers.get('accept',''):rows=rows[0] if len(rows)==1 else None
     return await self.json(route,rows)
  return await super().route(route)
 async def b1rpc(self,route,name,a,actor):
  expected={'save_my_profile':['p_expected_version','p_display_name','p_bio','p_mood_animal'],'save_my_preferences':['p_expected_version','p_theme','p_locale','p_partner_nickname'],'send_thought':['p_id'],'mark_thought_read':['p_id']}
  if list(a)!=expected[name]:raise AssertionError('Exact RPC arguments: '+name+str(a))
  if self.missing:return await self.error(route,'PGRST202','002 RPC missing',404)
  if name.startswith('save_my_'):
   table='profile_details' if name=='save_my_profile' else 'profile_preferences';old=next((r for r in self.tables[table] if r['profile_id']==actor),None)
   if self.conflict==name:
    self.conflict=None;old['version']+=1;self.revision+=1
    return await self.error(route,'40001','Deliberate competing version')
   if int(a['p_expected_version'])!=(old['version'] if old else 0):return await self.error(route,'40001','Stale version')
   if self.no_commit==name:self.no_commit=None;return await route.abort('failed')
   row=dict(profile_id=actor,pair_id=m.PAIR,version=(old['version'] if old else 0)+1,updated_at=m.STAMP)
   if table=='profile_details':
    row.update(bio=a['p_bio'],mood_animal=a['p_mood_animal']);next(r for r in self.tables['users_profiles'] if r['id']==actor)['display_name']=a['p_display_name']
   else:row.update(theme=a['p_theme'],locale=a['p_locale'],partner_nickname=a['p_partner_nickname'])
   if old:self.tables[table].remove(old)
   self.tables[table].append(row);self.revision+=1
   if self.hold==name:self.hold_event.set();await self.release_event.wait();self.hold=None
   if self.lost==name:self.lost=None;return await route.abort('failed')
   return await self.json(route,row)
  if name=='send_thought':
   if a['p_id'] in self.hidden_receipts:return await self.json(route,self.hidden_receipts[a['p_id']])
   row=dict(id=a['p_id'],pair_id=m.PAIR,sender_id=actor,recipient_id=P2 if actor==m.P else m.P,phrase_key='affection.phrase07',sequence=7,created_at='2026-11-10T12:00:00Z',read_at=None)
   self.tables['thought_events'].append(row);self.hidden_receipts[row['id']]={**row};self.revision+=1
   if self.lost==name:self.lost=None;return await route.abort('failed')
   return await self.json(route,{**row,'read_at':None})
  row=next((r for r in self.tables['thought_events'] if r['id']==a['p_id']),None)
  if not row or row['recipient_id']!=actor:return await self.error(route,'42501','Recipient only',403)
  row['read_at']='2026-11-10T12:01:00Z';self.revision+=1;return await self.json(route,row)
async def session(page,user=m.U):
 now=int(time.time());b64=lambda x:base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=');token=b64(dict(alg='HS256',typ='JWT'))+'.'+b64(dict(sub=user,role='authenticated',exp=now+3600))+'.FAKE_SIGNATURE_NOT_A_CREDENTIAL'
 s=dict(access_token=token,refresh_token='FAKE_ONLY',expires_at=now+3600,expires_in=3600,token_type='bearer',user={**m.USER,'id':user})
 await page.add_init_script('localStorage.setItem('+json.dumps('entre-nosotros-auth-'+m.HOST)+','+json.dumps(json.dumps(s))+');')
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
async def main():
 report=dict(kind='Actual built dist + real Chromium/SDK. Deliberately FAKE HTTP; no live Supabase/Auth/RLS/SQL/native delivery.',checks=[],errors=[])
 def check(value,label):
  report['checks'].append(dict(passed=bool(value),label=label))
  if not value:raise AssertionError(label)
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}/index.html';f=Fixture()
 try:
  async with async_playwright() as pw:
   browser=await pw.chromium.launch(headless=True);report['browser']=browser.version
   ctx=await browser.new_context(viewport=dict(width=390,height=844));ctx.set_default_timeout(8000);await ctx.route('**/*',f.route);await ctx.route_web_socket('**/*',lambda ws:ws.close());page=await ctx.new_page();page.on('dialog',lambda d:asyncio.create_task(d.accept()));page.on('pageerror',lambda e:report['errors'].append(str(e)));await session(page);await page.goto(url,wait_until='networkidle');await page.locator('#privateSpace').wait_for(state='visible');await page.locator('#profileBubble').click()
   check(await page.locator('#ownDisplayName').input_value()=='Fixture owner' and await page.locator('#ownBio').input_value()=='Actual biography','Actual profile fields, no alias/email fallback')
   check(await page.locator('#ownAnimal').input_value()=='hug','Self-chosen animal hydration')
   check(await page.locator('#profileBubble img[src]').count()==0,'Auth metadata avatar_url deliberately ignored')
   check(await page.locator('#profileSaveStatus').inner_text()==CAT['en']['b1.saved'] and await page.locator('#preferenceStatus').inner_text()==CAT['en']['b1.saved'],'Only hydrated persisted domains initially labelled saved')
   check(await page.locator('input[id*=nickname]').count()==0,'No ambiguous nickname editor')
   await page.locator('#ownDisplayName').fill('Own <svg onload=alert(1)> ياسمين');await page.locator('#ownBio').fill('Submitted biography');await page.locator('#ownAnimal').select_option('calm')
   f.hold='save_my_profile';await page.locator('#profileSave').click();await asyncio.wait_for(f.hold_event.wait(),5);await page.locator('#ownBio').fill('Newer profile draft');await page.locator('#themeSelect').select_option('ocean');await page.locator('#languageSelect').select_option('fr');f.release_event.set();await page.wait_for_function("()=>!document.querySelector('#profileSave').disabled")
   check(await page.locator('#ownBio').input_value()=='Newer profile draft','Newer profile edits retained during held RPC + refresh')
   check(await page.locator('#profileSaveStatus').inner_text()==CAT['fr']['b1.unsaved'],'Newer profile remains unsaved')
   check(await page.locator('#preferenceStatus').inner_text()==CAT['fr']['b1.unsaved'],'Profile success does not save preferences')
   check([c['name'] for c in f.calls]==['save_my_profile'] and f.calls[0]['args']['p_expected_version']==3,'Exactly one profile RPC with actual details version 3')
   check(await page.locator('#identity').inner_text()=='Own <svg onload=alert(1)> ياسمين' and await page.locator('#identity svg').count()==0,'Own current name readback updates header safely')
   f.hold_event=asyncio.Event();f.release_event=asyncio.Event();f.hold='save_my_preferences';await page.locator('#preferencesSave').click();await asyncio.wait_for(f.hold_event.wait(),5);await page.locator('#languageSelect').select_option('aeb-TN');await page.locator('#themeSelect').select_option('italy');f.release_event.set();await page.wait_for_function("()=>!document.querySelector('#preferencesSave').disabled")
   check(await page.locator('#languageSelect').input_value()=='aeb-TN' and await page.locator('#themeSelect').input_value()=='italy','Newer language/theme preview survives pending preference save')
   c=f.calls[-1];check(c['name']=='save_my_preferences' and c['args']==dict(p_expected_version=9,p_theme='ocean',p_locale='fr',p_partner_nickname='Existing private nickname'),'Exact preferences args independent version 9 and preserve stored nickname')
   f.conflict='save_my_profile';await page.locator('#profileSave').click();await page.locator('#profileReconcile').wait_for(state='visible');check(await page.locator('#ownBio').input_value()=='Newer profile draft','40001 preserves current profile draft');check(await page.locator('#profileSaveStatus').inner_text()==CAT['aeb-TN']['b1.conflict'],'40001 displayed as conflict, never saved');await page.locator('#profileReconcile').click()
   f.lost='save_my_profile';await page.locator('#profileSave').click();await page.wait_for_function("()=>document.querySelector('#profileSave').disabled&&document.querySelector('#profileSaveStatus').textContent.includes('تسجّل')")
   check(await page.locator('#profileSaveStatus').inner_text()==CAT['aeb-TN']['b1.saved'],'Uncertain committed profile reconciles exact own name/bio/animal/version readback')
   f.no_commit='save_my_preferences';await page.locator('#preferencesSave').click();await page.wait_for_function("()=>!document.querySelector('#preferencesSave').disabled");check(await page.locator('#preferenceStatus').inner_text()!=CAT['aeb-TN']['b1.saved'],'Uncertain uncommitted preferences never fake success');await page.locator('#preferencesSave').click();await page.wait_for_function("()=>document.querySelector('#preferencesSave').disabled&&document.querySelector('#preferenceStatus').textContent.includes('تسجّل')")
   check(f.tables['profile_preferences'][0]['partner_nickname']=='Existing private nickname' or any(r.get('partner_nickname')=='Existing private nickname' for r in f.tables['profile_preferences']),'Stored nickname never silently cleared')
   await page.locator('#profileClose').click();await page.locator('#nav-today').click();before=len(f.calls)
   for i in range(9):await page.locator('#affectionButton').click()
   check(len(f.calls)==before,'Nine distinct actual clicks emit zero RPCs')
   f.lost='send_thought';await page.locator('#affectionButton').click();await page.wait_for_function("()=>!document.querySelector('#thoughtRetry').disabled&&!document.querySelector('#thoughtRetry').hidden")
   check(len(f.tables['thought_events'])==1 and len(f.calls)==before+1,'Ten actual taps persist one event with one p_id-only request')
   check(await page.locator('#thoughtStatus').inner_text()!=CAT['aeb-TN']['b1.thoughtStored'],'Lost send receipt cannot claim stored success')
   check(await page.locator('#affectionButton').is_disabled() and await page.locator('#thoughtReset').is_hidden(),'One pending burst; no new UUID while uncertain')
   original=f.calls[-1]['args']['p_id'];await page.reload(wait_until='networkidle');await page.locator('#privateSpace').wait_for(state='visible');check(await page.locator('#thoughtRetry').is_visible() and f.calls[-1]['args']=={'p_id':original},'Pending UUID survives reload without automatic extra request');await page.locator('#thoughtRetry').click();await page.locator('#thoughtReset').wait_for(state='visible');check(f.calls[-1]['args']=={'p_id':original} and len(f.tables['thought_events'])==1,'Retry retains exact UUID and creates no second event')
   expected=CAT['aeb-TN']['affection.phrase07'].replace('{{sender}}','Own <svg onload=alert(1)> ياسمين');check(await page.locator('#thoughtReceipt').inner_text()==expected,'Server phrase07 authoritative, not helper phrase01; safe current own-name text')
   check(await page.locator('#thoughtReceipt svg').count()==0 and await page.locator('#thoughtInbox [data-thought-id]').count()==0,'No markup injection and sender inbox cannot see outbound event')
   check(await page.locator('#thoughtReset').is_disabled(),'Honest local cooldown before next explicit burst')
   # A second real browser context uses the peer Auth identity. Fixture RLS is explicit, not SQL evidence.
   peerctx=await browser.new_context(viewport=dict(width=320,height=844));peerctx.set_default_timeout(8000);await peerctx.route('**/*',f.route);await peerctx.route_web_socket('**/*',lambda ws:ws.close());peer=await peerctx.new_page();peer.on('pageerror',lambda e:report['errors'].append(str(e)));await session(peer,U2);await peer.goto(url,wait_until='networkidle');await peer.locator('#privateSpace').wait_for(state='visible');check(await peer.locator('#languageSelect').input_value()=='fr' and await peer.locator('#themeSelect').input_value()=='light','Peer own preferences independently hydrated, not sender preview')
   await peer.locator('#thoughtInbox [data-thought-id]').wait_for(state='visible');check(await peer.locator('#thoughtInbox svg').count()==0,'Recipient inbox safely interpolates current sender name');await peer.locator('#thoughtInbox button').click();await peer.wait_for_function("()=>document.querySelector('#thoughtInbox').textContent.includes('Lu dans ce compte')");check(f.calls[-1]['name']=='mark_thought_read' and f.calls[-1]['actor']==P2 and f.calls[-1]['args']=={'p_id':original},'Only recipient mark_thought_read current event exact p_id')
   # Sanitized idempotent receipt remains unread to sender, including after recipient marked it read.
   await page.reload(wait_until='networkidle');await page.locator('#privateSpace').wait_for(state='visible');check('read_at' in f.hidden_receipts[original] and f.hidden_receipts[original]['read_at'] is None,'Persisted sanitized receipt never reveals recipient read state')
   # More than 200 inbox rows exercises exact deterministic range paging, replacement, and foreign filtering.
   f.tables['thought_events']=[dict(id=str(uuid.uuid4()),pair_id=m.PAIR,sender_id=P2,recipient_id=m.P,phrase_key='affection.phrase02',sequence=i,created_at=m.STAMP,read_at=None) for i in range(205)];await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");await page.wait_for_function("()=>document.querySelectorAll('#thoughtInbox [data-thought-id]').length===205")
   reads=[r for r in f.reads if r['table']=='thought_events' and r['actor']==m.P];check(any(r['query'].get('offset')==['200'] and r['query'].get('limit')==['200'] and r['query'].get('order')==['created_at.desc,id.asc'] for r in reads),'Inbox reads sorted 200-row pages with exact recipient scope')
   f.tables['thought_events']=[];await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");await page.wait_for_function("()=>document.querySelectorAll('#thoughtInbox [data-thought-id]').length===0");check(True,'Snapshot replaces inbox, not merge-only stale events')
   await page.locator('#profileBubble').click();await page.screenshot(path=str(OUT/'390-aeb-TN-profile.png'),full_page=True);await peer.screenshot(path=str(OUT/'320-fr-peer.png'),full_page=True)
   await page.locator('#logout').click();await page.locator('#privateSpace').wait_for(state='hidden');check(await page.locator('#ownBio').input_value()=='' and await page.locator('#ownDisplayName').input_value()=='' and await page.locator('#thoughtInbox').inner_text()=='' and await page.locator('#thoughtReceipt').inner_text()=='','Logout clears private profile fields, inbox and receipt DOM')
   check(await page.evaluate("!Object.keys(sessionStorage).some(k=>k.startsWith('connection-thought:'))"),'Logout clears account-scoped outbox storage')
   await ctx.close();await peerctx.close()
   # Missing 002 fails closed, never an empty-success profile.
   absent=Fixture();absent.missing=True;c=await browser.new_context();await c.route('**/*',absent.route);await c.route_web_socket('**/*',lambda ws:ws.close());p=await c.new_page();await session(p);await p.goto(url,wait_until='networkidle');await p.wait_for_timeout(300);check(await p.locator('#privateSpace').is_hidden() and await p.locator('#profileBubble').is_hidden(),'Missing 002 errors and never opens fake successful account');await c.close();await browser.close()
   check(not report['errors'],'Zero unexpected JavaScript page errors')
 except Exception:report['failure']=traceback.format_exc()
 finally:
  report['calls']=f.calls;report['reads']=f.reads;report['passed']='failure' not in report and not report['errors'];(OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');server.shutdown()
 print(json.dumps({'passed':report['passed'],'checks':len(report['checks']),'errors':report['errors'],'failure':report.get('failure'),'report':str(OUT/'results.json')},ensure_ascii=False,indent=2));return report['passed']
if __name__=='__main__':raise SystemExit(0 if asyncio.run(main()) else 1)
