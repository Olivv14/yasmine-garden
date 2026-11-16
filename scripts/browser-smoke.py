"""Real Chromium checks; loopback only. No live Supabase or credential input."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
thread=Thread(target=server.serve_forever,daemon=True);thread.start()
results={'kind':'real Chromium missing-config rendering; no live auth/sync claims','checks':[]}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  for width in [390,1280]:
   page=browser.new_page(viewport={'width':width,'height':900})
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/dist/index.html',wait_until='networkidle')
   page.locator('#appError').wait_for(state='visible')
   assert page.locator('#appError').inner_text() == json.loads((ROOT/'experience/locales/en.json').read_text(encoding='utf8'))['sync.configMissing']
   assert page.locator('#privateSpace').is_hidden()
   assert page.locator('#authPanel').is_visible()
   assert page.locator('#authPassword').is_disabled()
   assert page.locator('#profile').count()==0
   assert page.locator('#musicPlayer').evaluate('(p)=>p.paused && !p.autoplay')
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
   assert not errors,errors
   page.screenshot(path=str(ROOT/f'dist/missing-config-{width}.png'),full_page=True)
   results['checks'].append({'width':width,'missing_config_fail_closed':True,'private_hidden':True,'music_off':True,'no_horizontal_overflow':True,'pageerrors':errors})
   page.close()
  # A deliberately invalid config must reject before any Supabase network request.
  page=browser.new_page();remote=[];page.on('request',lambda r: remote.append(r.url) if '.supabase.co' in r.url else None)
  page.route('**/public-config.json',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'supabaseUrl':'REPLACE_WITH_REAL_HTTPS_SUPABASE_PROJECT_URL','publishableKey':'REPLACE_WITH_REAL_PUBLISHABLE_KEY_ONLY'})))
  page.goto(f'http://127.0.0.1:{server.server_port}/dist/index.html',wait_until='networkidle')
  assert page.locator('#appError').is_visible();assert not remote
  results['checks'].append({'placeholder_rejected_before_network':True})
  # Valid syntax only: deliberate fake config; SDK initializes offline with no session.
  page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/public-config.json',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'supabaseUrl':'https://abcdefghijklmnopqrst.supabase.co','publishableKey':'sb_publishable_'+'A'*30})))
  page.route('https://*.supabase.co/**',lambda route:route.abort())
  page.goto(f'http://127.0.0.1:{server.server_port}/dist/index.html',wait_until='networkidle')
  assert page.locator('#privateSpace').is_hidden();assert page.locator('#authEmail').is_enabled();assert page.locator('#passwordForm').is_hidden();assert not errors,errors
  results['checks'].append({'labelled_fake_config_sdk_initialization_only':True,'no_session_private_hidden':True,'pageerrors':errors})
  browser.close()
finally:
 server.shutdown();server.server_close()
(ROOT/'dist/chromium-results.json').write_text(json.dumps(results,indent=2),encoding='utf8')
print(json.dumps(results,indent=2))
