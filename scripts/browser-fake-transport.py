"""Explicit FAKE transport fixture in real Chromium. Not live Supabase/RLS evidence."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
from playwright.sync_api import sync_playwright,expect
import json,time,base64,subprocess
ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start()
U='10000000-0000-4000-8000-000000000001';P='20000000-0000-4000-8000-000000000001';PAIR='30000000-0000-4000-8000-000000000001';stamp='2026-11-10T00:00:00+00:00';revision=0
user={'id':U,'aud':'authenticated','role':'authenticated','created_at':stamp,'app_metadata':{},'user_metadata':{},'is_anonymous':False}
content=[];calls=[];errors=[]
QUESTION_ROWS = json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {QUESTION_BANK} from './experience/questions.mjs';console.log(JSON.stringify(QUESTION_BANK.map(q=>({id:q.id,theme:q.sourceTheme,prompt:q.sourcePrompt}))))"],cwd=ROOT,text=True))
fixture={'users_profiles':[{'id':P,'auth_user_id':U,'display_name':'Fixture owner','created_at':stamp}],'pair_members':[{'pair_id':PAIR,'slot':1,'profile_id':P}],'question_bank':QUESTION_ROWS,'content_items':content,'moods':[],'flowers':[],'question_rounds':[],'round_answers':[],'media_files':[]}
def reply(route):
 global revision
 request=route.request;url=request.url
 if '/auth/v1/user' in url:return route.fulfill(status=200,content_type='application/json',body=json.dumps(user))
 if '/auth/v1/logout' in url:return route.fulfill(status=204,body='')
 if '/rest/v1/rpc/' in url:
  name=url.split('/rpc/')[1];args=request.post_data_json;calls.append([name,args])
  if name=='save_content':
   existing=next((r for r in content if r['id']==args['p_id']),None)
   if existing:content.remove(existing)
   row={'id':args['p_id'],'owner_id':P,'pair_id':PAIR,'version':(existing or {}).get('version',0)+1,'created_at':stamp,'updated_at':stamp,**args['p_data']};content.append(row);revision+=1
   return route.fulfill(status=200,content_type='application/json',body=json.dumps(row))
  return route.fulfill(status=400,content_type='application/json',body=json.dumps({'message':'FAKE fixture does not implement this RPC'}))
 if '/rest/v1/' in url:
  table=url.split('/rest/v1/')[1].split('?')[0];data=fixture.get(table,[])
  if table=='sync_signals':data=[{'profile_id':P,'pair_id':PAIR,'revision':revision,'updated_at':stamp}]
  if 'application/vnd.pgrst.object+json' in request.headers.get('accept',''):data=data[0] if data else None
  return route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
 return route.abort()
def b64(x):return base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
token=b64({'alg':'HS256','typ':'JWT'})+'.'+b64({'sub':U,'role':'authenticated','exp':int(time.time())+3600})+'.FAKE_SIGNATURE_NOT_A_CREDENTIAL'
session={'access_token':token,'refresh_token':'FAKE_FIXTURE_ONLY','expires_at':int(time.time())+3600,'expires_in':3600,'token_type':'bearer','user':user}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':390,'height':844});page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script('localStorage.setItem('+json.dumps('entre-nosotros-auth-abcdefghijklmnopqrst.supabase.co')+','+json.dumps(json.dumps(session))+');')
  page.route('**/public-config.json',lambda r:r.fulfill(status=200,content_type='application/json',body=json.dumps({'supabaseUrl':'https://abcdefghijklmnopqrst.supabase.co','publishableKey':'sb_publishable_'+'A'*30})))
  page.route('https://abcdefghijklmnopqrst.supabase.co/**',reply)
  page.goto(f'http://127.0.0.1:{server.server_port}/index.html',wait_until='networkidle')
  page.locator('#privateSpace').wait_for(state='visible')
  assert page.locator('#identity').inner_text()=='Fixture owner'
  page.locator('#nav-journal').click();page.locator('#journal-text').fill('<img src=x onerror=alert(1)> fixture private note')
  page.locator('#journal-save').click();page.locator('#journalEntries article').wait_for(state='visible')
  assert page.locator('#journalEntries').get_by_text('<img src=x onerror=alert(1)> fixture private note',exact=True).count()==1
  assert page.locator('#journalEntries img').count()==0
  assert content[0]['visibility']=='private'
  page.locator('#journalEntries').get_by_role('button',name='Edit',exact=True).click();page.locator('#journal-text').fill('fixture edit');page.locator('#journal-save').click();expect(page.locator('#journalEntries .body')).to_have_text('fixture edit')
  assert calls[-1][1]['p_expected_version']==1
  page.locator('#nav-questions').click();assert page.locator('#selectedQuestion').inner_text()==json.loads((ROOT/'experience/locales/en.json').read_text(encoding='utf8'))['questions.q1']
  page.locator('#nav-garden').click();assert page.locator('#gardenCount').inner_text()=='Shared flowers: 0'
  page.locator('#musicPanel > summary').click();assert page.locator('#musicPlayer').evaluate('(p)=>p.paused')
  page.locator('#musicPlay').click()
  deadline=time.monotonic()+15
  while time.monotonic()<deadline:
   if page.locator('#musicPlayer').evaluate('(p)=>p.readyState>=2 && !p.paused && p.currentTime>0.15'):break
   page.wait_for_timeout(150)
  else:raise AssertionError('Original local MP3 failed actual decoded playback')
  page.locator('#musicPlay').click();assert page.locator('#musicPlayer').evaluate('(p)=>p.paused')
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  page.screenshot(path=str(ROOT/'dist/fake-transport-private-390.png'),full_page=True)
  page.locator('#logout').click();page.locator('#authPanel').wait_for(state='visible');assert page.locator('#privateSpace').is_hidden();assert page.locator('#journalEntries').inner_text()==''
  assert not errors,errors
  report={'kind':'DELIBERATELY FAKE transport in real Chromium; NOT live Auth/RLS/Storage','checks':['SDK session hydration against fixture','private UI rendering','safe text DOM','private-default journal save','versioned owner edit','questions/garden navigation','real local MP3 decoded/play/time advance/pause','390px no overflow','logout clears private DOM'],'rpc_calls':len(calls),'pageerrors':errors}
  (ROOT/'dist/fake-transport-results.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report,indent=2));browser.close()
finally:server.shutdown();server.server_close()
