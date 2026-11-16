"""Independent real-Chromium regressions; HTTP transport MOCK, never live Supabase/SQL.

Run: python scripts/frontend-integrity-regressions.py
Uses installed esbuild and Python Playwright; writes only the execution JSON report.
All application JS is frozen in memory before bundling; no dist/source writes.
"""
import asyncio
import base64
import hashlib
import json
import subprocess
import sys
import time
import traceback
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, unquote, urlparse

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT.parent / 'execution/frontend-integrity-regressions.json'
QUESTION_ROWS = json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {QUESTION_BANK} from './experience/questions.mjs';console.log(JSON.stringify(QUESTION_BANK.map(q=>({id:q.id,theme:q.sourceTheme,prompt:q.sourcePrompt}))))"],cwd=ROOT,text=True))
HOST = 'abcdefghijklmnopqrst.supabase.co'
U = '10000000-0000-4000-8000-000000000001'
P = '20000000-0000-4000-8000-000000000001'
PAIR = '30000000-0000-4000-8000-000000000001'
ROUND = '40000000-0000-4000-8000-000000000001'
STAMP = '2026-11-10T00:00:00+00:00'
KIND = 'Real Chromium + actual bundled frontend/real SDK; deliberately MOCK HTTP transport; NOT live Supabase/Auth/SQL/RLS/Storage'
AUDIO = b'ID3\x04\x00\x00fixture-audio-transport-only'
USER = dict(id=U, aud='authenticated', role='authenticated', created_at=STAMP,
            app_metadata={}, user_metadata={}, is_anonymous=False)


def utc():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def freeze_bundle():
    paths = sorted((ROOT / 'src').glob('*.js')) + sorted((ROOT / 'experience').glob('*.mjs')) + sorted((ROOT / 'experience/locales').glob('*.json')) + [ROOT / 'src/template.html', ROOT / 'src/styles.css', ROOT / 'src/experience.css']
    frozen = {str(p.resolve()).replace('\\', '/'): p.read_bytes() for p in paths}
    hashes = {str(Path(p).relative_to(ROOT)).replace('\\', '/'): digest(data) for p, data in frozen.items()}
    script = r"""
import * as esbuild from 'esbuild';
let input='';for await(const chunk of process.stdin)input+=chunk;
const sources=JSON.parse(input);
const result=await esbuild.build({entryPoints:['src/app.js'],bundle:true,write:false,format:'esm',target:'es2022',plugins:[{name:'frozen-source',setup(b){b.onLoad({filter:/\.(js|mjs|json)$/},args=>{const content=sources[args.path.replaceAll('\\','/')];if(content!==undefined)return{contents:content,loader:args.path.endsWith('.json')?'json':'js'};});}}]});
process.stdout.write(result.outputFiles[0].text);
"""
    built = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT,
                           input=json.dumps({p: data.decode('utf8') for p, data in frozen.items() if p.endswith(('.js','.mjs','.json'))}),
                           text=True, capture_output=True, timeout=60)
    if built.returncode:
        raise RuntimeError('In-memory esbuild failed: ' + built.stderr)
    template = frozen[str((ROOT / 'src/template.html').resolve()).replace('\\', '/')].replace(b'__CSP__', b'')
    css = frozen[str((ROOT / 'src/styles.css').resolve()).replace('\\', '/')] + b'\n' + (ROOT/'experience/themes.mjs').read_text(encoding='utf8').split('export const THEME_BRIDGE_CSS = `',1)[1].split('`;',1)[0].encode() + b'\n' + frozen[str((ROOT / 'src/experience.css').resolve()).replace('\\', '/')]
    assets = {'/': ('text/html', template), '/index.html': ('text/html', template),
              '/assets/app.js': ('text/javascript', built.stdout.encode()), '/assets/app.css': ('text/css', css)}
    return assets, hashes, digest(built.stdout.encode())


class Fixture:
    """Strict relevant contract subset; unexpected tables/RPCs fail closed.

    A 40001 is an ERROR, never reconciled as fixture success. Reservation failure
    happens BEFORE insertion, after parent commit; finalization needs stored bytes.
    """
    def __init__(self):
        self.revision = 0
        self.calls = []
        self.events = []
        self.violations = []
        self.objects = {}
        self.expired = False
        self.reserve_failures = 0
        self.hold_dedication = False
        self.held = asyncio.Event()
        self.release = asyncio.Event()
        self.tables = {
            'users_profiles': [dict(id=P, auth_user_id=U, display_name='Fixture owner', created_at=STAMP)],
            'pair_members': [dict(pair_id=PAIR, slot=1, profile_id=P)],
            'question_bank': QUESTION_ROWS,
            'content_items': [], 'moods': [], 'flowers': [], 'question_rounds': [],
            'round_answers': [], 'media_files': [], 'profile_details': [], 'profile_preferences': [], 'thought_events': [], 'profile_avatars': []}

    def event(self, event_type, **fields):
        self.events.append(dict(event=event_type, **fields))

    async def json(self, route, data, status=200):
        await route.fulfill(status=status, content_type='application/json', body=json.dumps(data))

    async def error(self, route, code, message, status=400):
        self.event('error', code=code, message=message)
        await self.json(route, dict(code=code, message=message, details=None, hint=None), status)

    async def route(self, route):
        request = route.request
        parsed = urlparse(request.url)
        if parsed.hostname in ('127.0.0.1', 'localhost'):
            if parsed.path == '/public-config.json':
                return await self.json(route, dict(supabaseUrl='https://' + HOST, publishableKey='sb_publishable_' + 'A' * 30))
            return await route.continue_()
        if parsed.hostname != HOST:
            self.violations.append('Blocked external request: ' + parsed.hostname)
            return await route.abort()
        path = parsed.path
        if path == '/auth/v1/user':
            if self.expired:
                return await self.error(route, 'session_not_found', 'Fixture session expired', 401)
            return await self.json(route, USER)
        if path == '/auth/v1/logout':
            self.event('logout')
            return await route.fulfill(status=204, body='')
        if path.startswith('/rest/v1/rpc/'):
            name = path.rsplit('/', 1)[1]
            args = request.post_data_json
            self.calls.append(dict(name=name, args=args))
            self.event('rpc', name=name, args=args)
            return await self.rpc(route, name, args)
        if path.startswith('/rest/v1/'):
            table = path.rsplit('/', 1)[1]
            if self.expired:
                return await self.error(route, 'PGRST301', 'Fixture JWT expired', 401)
            if table == 'sync_signals':
                rows = [dict(profile_id=P, pair_id=PAIR, revision=self.revision, updated_at=STAMP)]
            elif table in self.tables:
                rows = list(self.tables[table])
            else:
                self.violations.append('Unknown data table: ' + table)
                return await self.error(route, '42P01', 'Unknown mock table')
            for key, values in parse_qs(parsed.query).items():
                for value in values:
                    if value.startswith('eq.'):
                        rows = [r for r in rows if str(r.get(key)) == value[3:]]
                    elif value.startswith('is.null'):
                        rows = [r for r in rows if r.get(key) is None]
            # PostgREST object and maybeSingle SDK paths both supported, with filters applied.
            if 'application/vnd.pgrst.object+json' in request.headers.get('accept', ''):
                if len(rows) != 1:
                    return await self.error(route, 'PGRST116', 'Expected exactly one mock row', 406)
                rows = rows[0]
            return await self.json(route, rows)
        storage_prefix = '/storage/v1/object/connection-private/'
        if path.startswith(storage_prefix) and request.method == 'POST':
            key = unquote(path[len(storage_prefix):])
            row = next((r for r in self.tables['media_files'] if r['object_key'] == key), None)
            if not row or row['status'] != 'pending' or request.headers.get('x-upsert') == 'true':
                return await self.error(route, '42501', 'No pending reservation or forbidden overwrite')
            if key in self.objects:
                return await self.error(route, 'Duplicate', 'Object already exists', 409)
            # Supabase browser uploads use multipart/form-data. Record and verify actual file bytes.
            payload = request.post_data_buffer or b''
            if AUDIO not in payload:
                self.violations.append('Storage upload did not contain selected audio bytes')
                return await self.error(route, '22023', 'Wrong upload bytes')
            self.objects[key] = AUDIO
            self.event('upload', key=key, size=len(AUDIO), sha256=digest(AUDIO), upsert=request.headers.get('x-upsert'))
            return await self.json(route, dict(Key='connection-private/' + key, Id=row['id']))
        self.violations.append('Unimplemented mock endpoint: ' + request.method + ' ' + path)
        await route.abort()

    async def rpc(self, route, name, a):
        if name == 'save_content':
            if set(a) != {'p_id', 'p_expected_version', 'p_data'}:
                return await self.error(route, '22023', 'Unexpected save arguments')
            data = a['p_data']
            if set(data) != {'item_type', 'visibility', 'body', 'title', 'url', 'question_id', 'entry_kind', 'mood'}:
                return await self.error(route, '22023', 'Unexpected content fields')
            old = next((r for r in self.tables['content_items'] if r['id'] == a['p_id']), None)
            if int(a['p_expected_version']) != (old['version'] if old else 0):
                return await self.error(route, '40001', 'Version conflict')
            if old and old['item_type'] != data['item_type']:
                return await self.error(route, '22023', 'Immutable type')
            row = dict(id=a['p_id'], owner_id=P, pair_id=PAIR, version=(old['version'] if old else 0) + 1,
                       created_at=STAMP, updated_at=STAMP, deleted_at=None, **data)
            if old:
                self.tables['content_items'].remove(old)
            self.tables['content_items'].append(row)
            self.revision += 1
            self.event('parent_commit', id=row['id'], version=row['version'], data=data)
            if self.hold_dedication and data['item_type'] == 'dedication':
                self.held.set()
                await self.release.wait()
                self.event('dedication_response_released')
            return await self.json(route, row)
        if name == 'reserve_media':
            if self.reserve_failures:
                self.reserve_failures -= 1
                return await self.error(route, 'P0001', 'Temporary reservation failure fixture')
            parent = next((r for r in self.tables['content_items'] if r['id'] == a['p_content_id']), None)
            if not parent:
                return await self.error(route, '42501', 'Owned parent required')
            old = next((r for r in self.tables['media_files'] if r['id'] == a['p_id']), None)
            if old:
                if old['content_id'] != parent['id'] or old['filename'] != a['p_filename'] or old['mime_type'] != a['p_mime_type']:
                    return await self.error(route, '23505', 'Media ID conflict')
                return await self.json(route, old)
            if any(r['content_id'] == parent['id'] for r in self.tables['media_files']):
                return await self.error(route, '54000', 'Track attachment count quota')
            row = dict(id=a['p_id'], owner_id=P, pair_id=PAIR, content_id=parent['id'],
                       object_key=P + '/' + a['p_id'], filename=a['p_filename'], mime_type=a['p_mime_type'],
                       status='pending', created_at=STAMP, updated_at=STAMP, size_bytes=None, reserved_bytes=26214400)
            self.tables['media_files'].append(row)
            self.revision += 1
            self.event('reservation_commit', id=row['id'], parent_id=parent['id'])
            return await self.json(route, row)
        if name == 'finalize_media':
            row = next((r for r in self.tables['media_files'] if r['id'] == a['p_id']), None)
            if not row or row['object_key'] not in self.objects:
                return await self.error(route, 'P0001', 'Object bytes required before finalize')
            row.update(status='ready', size_bytes=len(self.objects[row['object_key']]))
            self.revision += 1
            self.event('finalize_commit', id=row['id'])
            return await self.json(route, row)
        if name == 'submit_round_answer':
            row = dict(round_id=a['p_round_id'], owner_id=P, body=a['p_body'], submitted_at=STAMP)
            self.tables['round_answers'].append(row)
            self.revision += 1
            return await self.json(route, row)
        self.violations.append('Unexpected RPC: ' + name)
        return await self.error(route, '42883', 'RPC not in strict mock contract')

    def evidence(self):
        return dict(rpc_calls=self.calls, transaction_events=self.events, content=self.tables['content_items'],
                    media=self.tables['media_files'], answers=self.tables['round_answers'],
                    stored_objects=[dict(key=k, bytes=len(v), sha256=digest(v)) for k, v in self.objects.items()],
                    fixture_violations=self.violations)


class Case:
    def __init__(self, name):
        self.data = dict(id=name, started_at=utc(), assertions=[], page_errors=[], observations={})

    def check(self, condition, message, actual=None):
        # Freeze evidence at the assertion boundary: later retries mutate fixture lists.
        self.data['assertions'].append(dict(passed=bool(condition), assertion=message,
                                            actual=json.loads(json.dumps(actual))))


async def select_file(page):
    await page.locator('#musicFiles').evaluate('''(input, bytes) => {
      const dt=new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)],'fixture-track.mp3',{type:'audio/mpeg',lastModified:12345}));
      input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    }''', list(AUDIO))
    await page.wait_for_function("!document.getElementById('musicFiles').disabled")
    await page.wait_for_timeout(150)


async def online(page, value):
    await page.evaluate('''v=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>v});
      window.dispatchEvent(new Event(v?'online':'offline'));}''', value)


async def music(page):
    await page.locator('#musicPanel > summary').click()


async def fr01(page, f, c):
    await page.locator('#nav-questions').click()
    await page.locator('#roundBody').fill('keep my offline answer')
    await online(page, False)
    await page.locator('#roundForm button').click()
    await page.wait_for_function("!document.querySelector('#roundForm button').disabled")
    c.check(await page.locator('#roundBody').input_value() == 'keep my offline answer', 'Offline blind answer draft retained', await page.locator('#roundBody').input_value())
    c.check(not f.calls, 'Offline answer emitted no RPC', f.calls)
    c.check(not f.tables['round_answers'], 'No server answer committed offline')
    c.check(not await page.locator('#roundBody').is_disabled(), 'Answer remains editable/recoverable')


async def fr02(page, f, c):
    await music(page)
    await online(page, False)
    await select_file(page)
    toast = await page.locator('#toast').inner_text()
    count = await page.locator('#musicFiles').evaluate('(x)=>x.files.length')
    retries = page.locator('#musicPanel button, #pendingMedia button').filter(has_text=__import__('re').compile(r'reintentar.*pistas|retry|guardar.*pistas', __import__('re').I))
    retry_count = await retries.count()
    c.data['observations']['offline_before_recovery'] = json.loads(json.dumps(f.evidence()))
    c.check(not f.calls and not f.objects, 'Offline playlist emitted no RPC/upload', f.calls)
    c.check(not f.tables['content_items'] and not f.tables['media_files'], 'Offline playlist committed no parent/reservation')
    c.check('tracks saved on the server' not in toast.lower(), 'No false playlist success offline', toast)
    c.check(count == 1 or retry_count > 0, 'Selected file/batch is retained with recovery path', dict(input_files=count, retry_buttons=retry_count))
    await online(page, True)
    if retry_count:
        await page.locator('#recoveryPanel').evaluate('(x)=>x.open=true')
        await retries.first.click()
        await page.wait_for_function("!document.querySelector('[data-track-retry]') || !document.getElementById('appError').hidden")
    else:
        # Do NOT construct a fresh File: recovery must use the retained offline selection.
        await page.locator('#musicFiles').evaluate("x=>x.dispatchEvent(new Event('change',{bubbles:true}))")
    await page.wait_for_function("!document.getElementById('musicFiles').disabled")
    await page.wait_for_timeout(300)
    c.check(len(f.tables['content_items']) == 1, 'Offline retained selection recovers to exactly one parent', len(f.tables['content_items']))
    c.check(len(f.tables['media_files']) == 1 and f.tables['media_files'][0]['status'] == 'ready' and len(f.objects) == 1,
            'Recovery reaches reservation/upload/finalize with actual selected bytes', f.evidence()['media'])


async def fr03(page, f, c):
    await music(page)
    await page.locator('#dedicationName').fill('original submitted')
    await page.locator('#dedicationUrl').fill('https://example.org/first')
    await page.locator('#dedicationForm button').click()
    await asyncio.wait_for(f.held.wait(), 8)
    c.check(not f.release.is_set(), 'Actual intercepted save HTTP response held pending')
    await page.locator('#dedicationName').fill('new unsent draft')
    await page.locator('#dedicationUrl').fill('https://example.org/second')
    await page.locator('#dedicationVisibility').select_option('shared')
    c.check(await page.locator('#dedicationForm button').is_disabled(), 'Save remains pending while fields edited')
    f.release.set()
    await page.wait_for_function("!document.querySelector('#dedicationForm button').disabled")
    actual = dict(title=await page.locator('#dedicationName').input_value(), url=await page.locator('#dedicationUrl').input_value(), visibility=await page.locator('#dedicationVisibility').input_value())
    c.check(actual == dict(title='new unsent draft', url='https://example.org/second', visibility='shared'), 'Newer unsent dedication draft preserved after old response', actual)
    rows = f.tables['content_items']
    c.check(len(rows) == 1 and rows[0]['title'] == 'original submitted' and rows[0]['url'] == 'https://example.org/first' and rows[0]['visibility'] == 'private', 'Server contains only old submitted fields', rows)
    c.check(len(f.calls) == 1 and f.calls[0]['args']['p_expected_version'] == 0, 'Exactly one original dedication mutation, no implicit new-draft save', f.calls)


async def fr04(page, f, c):
    await music(page)
    await select_file(page)
    first = json.loads(json.dumps(f.evidence()))
    c.data['observations']['after_first_attempt'] = first
    c.check(len(f.tables['content_items']) == 1 and f.tables['content_items'][0]['version'] == 1, 'First expected=0 parent save commits version 1', first['content'])
    c.check([x['name'] for x in f.calls] == ['save_content', 'reserve_media'] and f.calls[0]['args']['p_expected_version'] == 0, 'First attempt reaches reservation after parent commit', f.calls)
    c.check(any(e.get('code') == 'P0001' for e in f.events) and not f.tables['media_files'] and not f.objects, 'Injected temporary reservation failure creates no media row/bytes')
    toast = await page.locator('#toast').inner_text()
    c.check('tracks saved on the server' not in toast.lower(), 'No false success after first reservation failure', toast)
    first_id = f.tables['content_items'][0]['id'] if f.tables['content_items'] else None
    first_media = next((x['args']['p_id'] for x in f.calls if x['name'] == 'reserve_media'), None)
    # A genuine identical reselected File, not Playwright's changing default lastModified.
    await select_file(page)
    c.check(len(f.tables['content_items']) == 1 and f.tables['content_items'][0]['id'] == first_id, 'Retry reuses original committed parent, no duplicate', f.tables['content_items'])
    reserves = [x for x in f.calls if x['name'] == 'reserve_media']
    c.check(len(reserves) == 2 and all(x['args']['p_id'] == first_media and x['args']['p_content_id'] == first_id for x in reserves), 'Identical-file retry reaches reserve with original parent/media UUIDs', reserves)
    c.check(not any(x.get('code') == '40001' for x in f.events), 'No optimistic-version 40001 on phase-resume retry', f.events)
    c.check(len(f.tables['media_files']) == 1 and f.tables['media_files'][0]['status'] == 'ready' and len(f.objects) == 1, 'Retry actually uploads and finalizes exactly one media object', f.evidence()['media'])
    commits = [e for e in f.events if e['event'] in ('reservation_commit', 'upload', 'finalize_commit')]
    c.check([e['event'] for e in commits] == ['reservation_commit', 'upload', 'finalize_commit'], 'Successful retry transaction phases occur in reserve/upload/finalize order', commits)
    toast = await page.locator('#toast').inner_text()
    c.check('tracks saved on the server' in toast.lower(), 'Success is shown only after finalized server state', toast)


async def teardown_case(page, f, c, expiry=False):
    await page.locator('#nav-journal').click()
    await page.locator('#journal-text').fill('private draft must disappear')
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
    await page.locator('#journal-files').set_input_files(dict(name='fixture.png', mimeType='image/png', buffer=png))
    await page.wait_for_function('window.__blobs.created.length > 0')
    if expiry:
        f.expired = True
        await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    else:
        await page.locator('#logout').click()
    await page.locator('#privateSpace').wait_for(state='hidden')
    await page.locator('#authPanel').wait_for(state='visible')
    blobs = await page.evaluate('window.__blobs')
    c.check(bool(blobs['created']) and set(blobs['created']).issubset(set(blobs['revoked'])), 'All actual draft object URLs revoked on teardown', blobs)
    c.check(await page.locator('#journal-text').input_value() == '' and await page.locator('#journal-preview img').count() == 0, 'Private draft/media DOM cleared')
    c.check(not f.tables['content_items'] and not f.tables['media_files'] and not f.objects, 'Local draft never saved remotely')
    if not expiry:
        c.check(any(e['event'] == 'logout' for e in f.events), 'SDK logout endpoint called')


async def execute(assets, report):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            content_type, body = assets.get(urlparse(self.path).path, ('text/plain', b''))
            self.send_response(200 if urlparse(self.path).path in assets else 404)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            report['browser_version'] = browser.version
            cases = [('FR-01', fr01), ('FR-02', fr02), ('FR-03', fr03), ('FR-04', fr04),
                     ('POS-logout-draft-media-revoke', teardown_case),
                     ('POS-expiry-draft-media-revoke', lambda p, f, c: teardown_case(p, f, c, True))]
            for name, run in cases:
                c, f = Case(name), Fixture()
                context = await browser.new_context(viewport=dict(width=390, height=844))
                context.set_default_timeout(8000)
                page = await context.new_page()
                page.on('pageerror', lambda error, c=c: c.data['page_errors'].append(str(error)))
                if name == 'FR-01':
                    f.tables['question_rounds'] = [dict(id=ROUND, pair_id=PAIR, question_id='q1', started_by=P, created_at=STAMP, revealed_at=None)]
                if name == 'FR-03':
                    f.hold_dedication = True
                if name == 'FR-04':
                    f.reserve_failures = 1
                now = int(time.time())
                b64 = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
                token = b64(dict(alg='HS256', typ='JWT')) + '.' + b64(dict(sub=U, role='authenticated', exp=now + 3600)) + '.FAKE_SIGNATURE_NOT_A_CREDENTIAL'
                session = dict(access_token=token, refresh_token='FAKE_FIXTURE_ONLY', expires_at=now + 3600, expires_in=3600, token_type='bearer', user=USER)
                await page.add_init_script('localStorage.setItem(' + json.dumps('entre-nosotros-auth-' + HOST) + ',' + json.dumps(json.dumps(session)) + ');' + """
window.__blobs={created:[],revoked:[]};
const originalCreate=URL.createObjectURL.bind(URL),originalRevoke=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=b=>{const u=originalCreate(b);window.__blobs.created.push(u);return u};
URL.revokeObjectURL=u=>{window.__blobs.revoked.push(u);originalRevoke(u)};
""")
                await context.route('**/*', f.route)
                # Realtime is deliberately not a live service; close every outbound WebSocket.
                await context.route_web_socket('**/*', lambda ws: ws.close())
                try:
                    await page.goto(f'http://127.0.0.1:{server.server_port}/index.html', wait_until='networkidle')
                    await page.locator('#privateSpace').wait_for(state='visible')
                    c.check(await page.locator('#identity').inner_text() == 'Fixture owner', 'Real SDK fixture session and Data API hydration completed')
                    await run(page, f, c)
                except Exception as error:
                    c.check(False, 'Execution completed without exception', str(error))
                    c.data['exception'] = traceback.format_exc()
                finally:
                    f.release.set()
                    c.check(not f.violations, 'Strict fixture has no unknown endpoints/contract violations', f.violations)
                    c.check(not c.data['page_errors'], 'No uncaught browser errors', c.data['page_errors'])
                    c.data['evidence'] = f.evidence()
                    c.data['finished_at'] = utc()
                    c.data['passed'] = all(x['passed'] for x in c.data['assertions'])
                    report['cases'].append(c.data)
                    print(name + ': ' + ('PASS' if c.data['passed'] else 'FAIL'), flush=True)
                    for assertion in c.data['assertions']:
                        if not assertion['passed']:
                            print('  FAIL ' + assertion['assertion'] + ': ' + json.dumps(assertion['actual']), flush=True)
                    await context.close()
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


def main():
    report = dict(kind=KIND, started_at=utc(), cases=[], scope='FR01..FR04 + cheap logout/foreground-expiry draft/blob teardown; profiles/themes deferred',
                  limitations=['All backend HTTP is mocked; SQL inspected, not executed.', 'Synthetic media verifies byte transport, not codec playback.', 'No cloud writes, live credentials, dependency installs, or source/dist changes.'])
    try:
        assets, hashes, bundle_hash = freeze_bundle()
        report.update(source_sha256=hashes, bundle_sha256=bundle_hash, source_frozen_at=utc())
        asyncio.run(execute(assets, report))
    except Exception as error:
        report['harness_error'] = str(error)
        report['traceback'] = traceback.format_exc()
    finally:
        report['finished_at'] = utc()
        report['source_sha256_after'] = {p: digest((ROOT / p).read_bytes()) for p in report.get('source_sha256', {})}
        report['source_changed_during_run'] = [p for p, h in report.get('source_sha256', {}).items() if report['source_sha256_after'][p] != h]
        report['executed_cases'] = len(report['cases'])
        report['passed_cases'] = sum(c['passed'] for c in report['cases'])
        report['failed_cases'] = sum(not c['passed'] for c in report['cases'])
        report['passed'] = len(report['cases']) == 6 and report['failed_cases'] == 0 and 'harness_error' not in report
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf8')
        print(json.dumps(dict(report=str(REPORT), passed=report['passed'], executed=report['executed_cases'], failed=report['failed_cases'], harness_error=report.get('harness_error'), source_changed_during_run=report['source_changed_during_run']), indent=2))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
