"""Actual built Chromium UI matrix. ALL private HTTP transport is deliberately FAKE.
No live Supabase/Auth/RLS/Storage, accounts, external writes or native-push evidence.
"""
import asyncio,base64,hashlib,importlib.util,json,time,traceback
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('integrity',ROOT/'scripts/frontend-integrity-regressions.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
OUT=ROOT.parent/'execution/localization-browser';OUT.mkdir(exist_ok=True)
CAT={lang:json.loads((ROOT/f'experience/locales/{lang}.json').read_text(encoding='utf8')) for lang in ['en','fr','aeb-TN']}
THEMES=['dark','light','pastel','barcelona','tunisia','italy','lavender','ocean','forest','rose']
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
CONTRAST=r'''() => {
const rgba=s=>{const m=s.match(/[\d.]+/g);return m?[+m[0],+m[1],+m[2],m[3]===undefined?1:+m[3]]:[0,0,0,0]};
const over=(a,b)=>{const alpha=a[3]+b[3]*(1-a[3]);return [0,1,2].map(i=>(a[i]*a[3]+b[i]*b[3]*(1-a[3]))/(alpha||1)).concat(alpha)};
const bg=n=>{if(!n)return [255,255,255,1];const c=rgba(getComputedStyle(n).backgroundColor);return c[3]===1?c:over(c,bg(n.parentElement))};
const lum=c=>{const q=c.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*q[0]+.7152*q[1]+.0722*q[2]};
let checks=0,min=100,fail=[];
for(const n of document.querySelectorAll('body *')){if(![...n.childNodes].some(x=>x.nodeType===3&&x.textContent.trim())||n.closest('[aria-hidden=true]')||['SCRIPT','STYLE','OPTION'].includes(n.tagName))continue;
 const r=n.getBoundingClientRect(),s=getComputedStyle(n);if(!n.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||r.width===0||r.height===0||r.right<0||r.left>innerWidth||r.bottom<0)continue;
 const back=bg(n),fore=over(rgba(s.color),back),a=lum(fore),b=lum(back),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&+s.fontWeight>=700),minimum=large?3:4.5;
 checks++;min=Math.min(min,ratio);if(ratio+1e-6<minimum)fail.push({tag:n.tagName,id:n.id,cls:n.className,text:n.textContent.slice(0,80),fg:s.color,bg:back,ratio,minimum});
}return {checks,minimum:min,fail};}'''
async def choose(page,lang,theme):
 await page.locator('#languageSelect').select_option(lang)
 await page.locator('#themeSelect').select_option(theme)
async def init_session(page):
 now=int(time.time());b64=lambda x:base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
 token=b64(dict(alg='HS256',typ='JWT'))+'.'+b64(dict(sub=mod.U,role='authenticated',exp=now+3600))+'.FAKE_SIGNATURE_NOT_A_CREDENTIAL'
 session=dict(access_token=token,refresh_token='FAKE_FIXTURE_ONLY',expires_at=now+3600,expires_in=3600,token_type='bearer',user=mod.USER)
 await page.add_init_script('localStorage.setItem('+json.dumps('entre-nosotros-auth-'+mod.HOST)+','+json.dumps(json.dumps(session))+');')
async def main():
 report=dict(kind='REAL Chromium actual dist; deliberately FAKE private HTTP transport; synthetic browser media device',matrix=[],checks=[],screenshots=[],pageerrors=[],limitations=['No live Auth/SQL/RLS/Storage/Realtime','No native Tunisian review, physical mobile or screen-reader certification','Native file-picker/browser validation strings follow browser OS language, not app catalog'])
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}/index.html'
 def check(ok,label):
  report['checks'].append(dict(passed=bool(ok),label=label))
  if not ok:raise AssertionError(label)
 try:
  async with async_playwright() as pw:
   browser=await pw.chromium.launch(headless=True,args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
   report['browser']=browser.version
   for width in [320,390]:
    context=await browser.new_context(viewport=dict(width=width,height=844),reduced_motion='reduce');context.set_default_timeout(7000)
    f=mod.Fixture();f.tables['users_profiles'][0]['display_name']='Yasmine ياسمين'
    f.tables['flowers']=[dict(id='flower-fixture',planted_by=mod.P,flower_type='jasmine',water=3,version=1)]
    f.tables['question_rounds']=[dict(id=mod.ROUND,pair_id=mod.PAIR,question_id='q1',started_by=mod.P,created_at=mod.STAMP,revealed_at=None)]
    page=await context.new_page();page.on('pageerror',lambda e:report['pageerrors'].append(str(e)))
    await init_session(page);await context.route('**/*',f.route);await context.route_web_socket('**/*',lambda ws:ws.close())
    await page.goto(url,wait_until='networkidle');await page.locator('#privateSpace').wait_for(state='visible')
    check(await page.locator('#profileInitials').inner_text()=='Yي','Initials derived only from verified fixture profile')
    await page.locator('#profileBubble').click()
    check(await page.locator('#profileName').inner_text()=='Yasmine ياسمين','Profile displays resolved profile, no alias')
    check(await page.locator('#profileName').evaluate('(n)=>n.tagName')=='BDI','Mixed-script profile name isolated with bdi')
    check(await page.locator('#languageSelect option').all_text_contents()==['English','Français','تونسي'],'Full language names, SVG flag instead of regional-letter fallback')
    # All existing composers remain the same nodes throughout every switch.
    await page.locator('#nav-journal').click();await page.locator('#journal-text').fill('Never translate <script>كلام Yasmine</script>')
    await page.locator('#journal-kind').select_option('poem');await page.locator('#journal-mood').select_option('hopeful')
    await page.locator('#nav-questions').click();await page.locator('#question-text').fill('برويون français English');await page.locator('#roundBody').fill('round draft')
    await page.locator('#musicPanel').evaluate('(n)=>n.open=true');await page.locator('#dedicationName').fill('unsent dedication');await page.locator('#dedicationUrl').fill('https://example.org/draft')
    await page.locator('#accountPassword').click();await page.locator('#newPassword').fill('local-preview-not-a-credential');await page.locator('#confirmPassword').fill('local-preview-not-a-credential')
    for lang in CAT:
     for theme in THEMES:
      await choose(page,lang,theme)
      check(await page.evaluate('document.documentElement.lang')==lang,'Exact document language '+lang)
      check(await page.evaluate('document.documentElement.dir')==('rtl' if lang=='aeb-TN' else 'ltr'),'Correct root direction '+lang)
      check(await page.title()==CAT[lang]['app.title'],'Localized title '+lang)
      check(await page.locator('#journal-text').input_value()=='Never translate <script>كلام Yasmine</script>','Journal draft retained, never translated')
      check(await page.locator('#question-text').input_value()=='برويون français English','Question draft retained')
      check(await page.locator('#journal-kind').input_value()=='poem' and await page.locator('#journal-mood').input_value()=='hopeful','Backend enums retained across translations')
      check(await page.locator('#roundBody').input_value()=='round draft','Blind-round draft retained')
      check(await page.locator('#dedicationName').input_value()=='unsent dedication','Dedication retained')
      check(await page.locator('#newPassword').input_value()=='local-preview-not-a-credential','Password draft retained')
      check(await page.locator('#journal-text').get_attribute('placeholder')==CAT[lang]['form.journalPlaceholder'],'Dynamic composer placeholder localized')
      check(await page.locator('#preferenceStatus').inner_text()==CAT[lang]['b1.unsaved'],'Settings explicitly unsaved until server readback')
      check(await page.locator('#languageFlag svg').get_attribute('data-flag')==lang,'Current flag is an actual SVG, not regional letters')
      labels=await page.locator('[data-i18n]').evaluate_all('(ns)=>ns.filter(n=>!n.id||!["identity","connectionStatus","todaySummary","partnerState","journalComposerTitle","gardenCount","musicPlay","musicState"].includes(n.id)).map(n=>({key:n.dataset.i18n,text:n.textContent}))')
      check(all(x['text']==CAT[lang][x['key']] for x in labels),'All bound static catalog labels use exactly the chosen locale')
      await page.locator('#authPanel').evaluate('(n)=>n.hidden=true')
      for view in ['today','journal','questions','garden']:
       await page.locator('#nav-'+view).click()
       for detail in ['musicPanel','recoveryPanel','backupPanel']:await page.locator('#'+detail).evaluate('(n)=>n.open=true')
       check(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'No horizontal overflow '+str(width)+' '+lang+' '+theme+' '+view)
       colors=await page.evaluate(CONTRAST)
       report['matrix'].append(dict(width=width,locale=lang,theme=theme,view=view,contrast=colors))
       check(not colors['fail'],'Actual composed text contrast '+str(width)+' '+lang+' '+theme+' '+view)
      await page.locator('#nav-questions').click()
      check(await page.locator('[data-question-id]').count()==8,'All eight stable question IDs remain')
      check(await page.locator('#selectedQuestion').inner_text()==CAT[lang]['questions.q1'],'Approved prompt localized by stable q1')
      await page.locator('#questionTheme').select_option('care');check(await page.locator('[data-question-id]').evaluate_all('(ns)=>ns.map(n=>n.dataset.questionId)')==['q7','q8'],'Stable care filter values');await page.locator('#questionTheme').select_option('all')
      check(await page.locator('#musicPlayer').evaluate('(n)=>n.paused&&!n.autoplay'),'Music remains off after preference switches')
      if theme in ['light','barcelona','tunisia','italy'] and lang in ['en','aeb-TN']:
       await page.locator('#nav-today').click();await page.evaluate('scrollTo(0,0)');name=f'{width}-{lang}-{theme}.png';await page.screenshot(path=str(OUT/name),full_page=False);report['screenshots'].append(name)
       if theme=='italy' and lang=='aeb-TN':
        for view in ['journal','questions','garden']:
         await page.locator('#nav-'+view).click();await page.locator('#profileView').evaluate('(n)=>n.hidden=true');await page.evaluate('scrollTo(0,0)');name=f'{width}-{lang}-{view}.png';await page.screenshot(path=str(OUT/name),full_page=True);report['screenshots'].append(name)
        await page.locator('#profileView').evaluate('(n)=>n.hidden=false')
    check(not f.calls,'Rendering/preferences/draft changes emitted zero mutations or preference RPCs')
    # Real recorder object with an explicitly synthetic Chromium media device.
    await page.locator('#authPanel').evaluate('(n)=>n.hidden=true');await page.locator('#nav-journal').click();await page.locator('#journal-record-audio').click();await page.locator('#journal-record-stop').wait_for(state='visible')
    await choose(page,'fr','ocean');check(await page.locator('#journal-record-stop').is_visible(),'Actual recording remains active through locale/theme switch');check(await page.locator('#journal-save').is_disabled(),'Recording save exclusion retained')
    await page.locator('#journal-record-stop').click();await page.locator('#journal-preview audio').wait_for(state='visible');check(await page.locator('#journal-record-status').inner_text()==CAT['fr']['record.previewReady'],'Recording finalizes into retained draft in selected language')
    # Genuine pending save HTTP response while locale/theme + fields change.
    f.hold_dedication=True;await page.locator('#musicPanel').evaluate('(n)=>n.open=true');await page.locator('#dedicationForm button').click();await asyncio.wait_for(f.held.wait(),7)
    await page.locator('#dedicationName').fill('newer draft while pending');await choose(page,'aeb-TN','italy');check(await page.locator('#dedicationForm button').is_disabled(),'Pending operation remains pending through preference switch')
    f.release.set();await page.wait_for_function("()=>!document.querySelector('#dedicationForm button').disabled")
    check(await page.locator('#dedicationName').input_value()=='newer draft while pending','Newer dedication draft retained after actual old HTTP response')
    check(len(f.calls)==1 and f.calls[0]['name']=='save_content' and f.calls[0]['args']['p_expected_version']==0,'Exactly original mutation/version; no preference/partner mutation')
    await page.locator('#logout').click();await page.locator('#privateSpace').wait_for(state='hidden');await page.locator('#languageSelect').select_option('fr');check(await page.locator('#profileBubble').is_hidden() and await page.locator('#profileName').inner_text()=='','Logout clears actual profile and allows safe public locale switch')
    await page.locator('#authEmail').evaluate('(n)=>n.reportValidity()');check(await page.locator('#authEmail').evaluate('(n)=>n.validationMessage')==CAT['fr']['errors.required'],'Required-field browser validation uses catalog copy')
    await page.locator('#languageSelect').select_option('aeb-TN');check(await page.locator('#authEmail').evaluate('(n)=>n.validationMessage')==CAT['aeb-TN']['errors.required'],'Existing validation error redraws in selected language')
    await page.locator('#authEmail').fill('configured-user');check(await page.locator('#authEmail').evaluate('(n)=>n.validationMessage')=='','Editing clears localized custom validation')
    await context.close()
   # All public/auth missing-config states in all locales; no simulated sessions.
   for width in [320,390]:
    context=await browser.new_context(viewport=dict(width=width,height=844));page=await context.new_page();page.on('pageerror',lambda e:report['pageerrors'].append(str(e)))
    await page.goto(url,wait_until='networkidle')
    for lang in CAT:
     await page.locator('#languageSelect').select_option(lang)
     check(await page.locator('#appError').inner_text()==CAT[lang]['sync.configMissing'],'Localized missing configuration error '+lang)
     check(await page.locator('#authEmail').is_disabled() and await page.locator('#privateSpace').is_hidden(),'Missing config fails closed')
     check(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Missing-config no overflow')
     name=f'missing-{width}-{lang}.png';await page.screenshot(path=str(OUT/name),full_page=True);report['screenshots'].append(name)
    await context.close()
   # Deliberately corrupt one bundled catalog in an isolated page: real strict
   # bootstrap must throw, not silently load another language or private UI.
   context=await browser.new_context();page=await context.new_page();expected_errors=[];page.on('pageerror',lambda e:expected_errors.append(str(e)))
   original=(ROOT/'dist/assets/app.js').read_text(encoding='utf8');broken=original.replace('"nav.today":"Today",','',1)
   check(broken!=original,'Fault injection removed exactly one known bundled translation')
   await context.route('**/assets/app.js',lambda route:route.fulfill(status=200,content_type='text/javascript',body=broken))
   await page.goto(url,wait_until='networkidle')
   check(any('Catalog key mismatch' in e for e in expected_errors),'Missing bundled translation is a real thrown error, not fallback')
   check(await page.locator('#privateSpace').is_hidden(),'Missing translation prevents private bootstrap')
   report['expected_missing_translation_errors']=expected_errors;await context.close()
   await browser.close()
  check(not report['pageerrors'],'Zero uncaught browser errors')
  report['passed']=True
 except Exception:
  report['passed']=False;report['exception']=traceback.format_exc();print(report['exception'])
 finally:
  server.shutdown();server.server_close();report['matrix_rows']=len(report['matrix']);report['assertions']=len(report['checks']);report['dist_sha256']=hashlib.sha256((ROOT/'dist/assets/app.js').read_bytes()).hexdigest();(OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({k:report[k] for k in ['passed','matrix_rows','assertions','dist_sha256']},indent=2))
 return 0 if report['passed'] else 1
if __name__=='__main__':raise SystemExit(asyncio.run(main()))
