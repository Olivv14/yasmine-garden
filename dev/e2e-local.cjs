// LOCAL ONLY end-to-end check of the garden home and games against a local Supabase stack.
// Prerequisites (see dev/README.md): `supabase start` with backend 001-005 applied, the synthetic
// pair enrolled, `npm run build`, dist/ copied to SITE with a local public-config.json and served on :8766.
// In that copy only, add ws://127.0.0.1:54321 to the CSP connect-src (the shipped CSP is unchanged).
// Usage: node dev/e2e-local.cjs <out-dir>
// The app only accepts https://<ref>.supabase.co, so a fake project host is routed to 127.0.0.1:54321.
const {chromium}=require('playwright');
const FAKE='https://abcdefghijklmnopqrst.supabase.co',LOCAL='http://127.0.0.1:54321',SITE='http://localhost:8766/';
const out=process.argv[2]||'.';const PASS='local-pass-123456';
const results=[];const check=(name,ok,detail='')=>{results.push({name,ok:!!ok,detail});console.log((ok?'PASS ':'FAIL ')+name+(detail?' · '+detail:''));};

async function person(browser,name,viewport,opts={}){
  const context=await browser.newContext({viewport,...opts});
  await context.route(/abcdefghijklmnopqrst\.supabase\.co/,async route=>{const r=route.request();const resp=await route.fetch({url:r.url().replace(FAKE,LOCAL)});await route.fulfill({response:resp});});
  // Realtime: the browser would tunnel wss:// to the fake host through the sandbox proxy, so the page's
  // WebSocket is pointed at local Realtime instead (the test copy's CSP allows ws://127.0.0.1:54321 only).
  await context.addInitScript(()=>{const W=window.WebSocket;window.WebSocket=class extends W{constructor(u,p){super(String(u).replace('wss://abcdefghijklmnopqrst.supabase.co','ws://127.0.0.1:54321'),p);}};});
  const page=await context.newPage();page.errors=[];
  page.on('pageerror',e=>page.errors.push('pageerror: '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))page.errors.push('console: '+m.text());});
  await page.addInitScript(()=>{document.addEventListener('securitypolicyviolation',e=>console.error('CSP violation '+e.violatedDirective+' '+e.blockedURI));});
  await page.goto(SITE);
  await page.fill('#authEmail',name.includes('@')?name:name+'@local.test');await page.fill('#authPassword',PASS);await page.click('#loginForm button[type=submit]');
  await page.waitForSelector('#privateSpace:not([hidden])',{timeout:20000});
  await page.waitForSelector('#gardenMount .flower, #gardenEmpty:not([hidden])',{timeout:20000});
  await page.waitForTimeout(600);
  return {context,page};
}
const shot=(page,name)=>page.screenshot({path:`${out}/${name}.png`});

(async()=>{
  const browser=await chromium.launch();
  const o=await person(browser,'oliver',{width:375,height:812});
  const y=await person(browser,'yasmine',{width:375,height:812});
  const op=o.page,yp=y.page;
  check('both people signed in and see the garden',await op.locator('#gardenMount .garden-viewport').isVisible()&&await yp.locator('#gardenMount .garden-viewport').isVisible());
  check('no ASCII or <pre> rendered',await op.evaluate(()=>!document.querySelector('pre,.ascii')));
  check('greeting names the person',/Oliver/.test(await op.locator('#gardenTitle').textContent()));
  check('self-hosted fonts loaded',await op.evaluate(async()=>{await document.fonts.ready;const loaded=[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family.replace(/"/g,''));return ['Fraunces','Inter'].every(f=>loaded.includes(f));}));
  await shot(op,'01-home-375-night');

  // Plant a marigold (needs backend 005) and a jasmine.
  const before=Number((await op.locator('#gardenCount').textContent()).match(/\d+/)?.[0]??0);
  for(const type of ['marigold','jasmine']){
    await op.click('#plantButton');await op.waitForSelector('dialog.plant-sheet[open]');
    if(type==='marigold')await shot(op,'02-plant-sheet-375');
    await op.click(`dialog.plant-sheet .flower-option[data-type=${type}]`);await op.click('dialog.plant-sheet .sheet-body > button.primary');
    await op.waitForSelector('dialog.plant-sheet',{state:'detached',timeout:10000});
  }
  await op.waitForFunction(n=>Number(document.querySelector('#gardenCount').textContent.match(/\d+/)?.[0])>=n+2,before,{timeout:10000});
  check('planted marigold and jasmine',true,`flowers ${before} -> ${before+2}`);
  // Open a flower from the keyboard list and water it.
  await op.focus('.garden-keys button');await op.keyboard.press('Enter');await op.waitForSelector('dialog.flower-sheet[open]');
  const dropsBefore=await op.locator('dialog.flower-sheet .drops .filled').count();
  await op.click('dialog.flower-sheet .sheet-actions button.primary');
  await op.waitForFunction(n=>document.querySelectorAll('dialog.flower-sheet .drops .filled').length>n,dropsBefore,{timeout:10000});
  check('watering fills one more drop',true,`${dropsBefore} -> ${dropsBefore+1}`);
  await shot(op,'03-flower-sheet-375');
  await op.keyboard.press('Escape');await op.waitForSelector('dialog.flower-sheet',{state:'detached'});
  // Partner sees the planting in the garden and in the partner line.
  await yp.waitForFunction(()=>/Oliver planted/.test(document.querySelector('#partnerLine').textContent),null,{timeout:20000});
  check('partner line shows Oliver\'s planting on Yasmine\'s phone',true,await yp.locator('#partnerLine').textContent());

  // Swipe moves the panorama with parallax.
  const box=await op.locator('.garden-viewport').boundingBox();
  const tf=()=>op.evaluate(()=>[...document.querySelectorAll('.garden-layer')].map(s=>s.style.transform));
  await op.focus('.garden-viewport');await op.keyboard.press('Home');await op.waitForTimeout(100);
  check('Home key walks to the start of the garden',(await tf())[2].startsWith('translate3d(0px'));
  const vb=await op.locator('.garden-viewport').boundingBox();const t0=await tf();await op.mouse.move(vb.x+230,vb.y+vb.height*.6);await op.mouse.down();await op.mouse.move(vb.x+30,vb.y+vb.height*.6+5,{steps:8});await op.mouse.up();await op.waitForTimeout(400);
  const t1=await tf();const dx=t=>t.map(v=>Number(v.match(/\((-?[\d.]+)px/)[1]));
  const d=dx(t1).map((v,i)=>v-dx(t0)[i]);
  check('swipe moves near > mid > far (parallax)',Math.abs(d[2])>Math.abs(d[1])&&Math.abs(d[1])>Math.abs(d[0])&&d[2]<0,d.map(v=>v.toFixed(1)).join(' / '));

  // Notes, Questions and Play tabs.
  for(const [id,name] of [['#nav-journal','04-notes-375'],['#nav-questions','05-questions-375']]){await op.click(id);await op.waitForTimeout(300);await shot(op,name);}
  await op.click('#nav-play');await op.waitForSelector('#truthDare');
  // Earlier runs may have left a game open: anyone may end it, so start clean.
  if(await op.locator('#truthDare > button.quiet').count()){await op.click('#truthDare > button.quiet');await op.waitForFunction(()=>!document.querySelector('#truthDare > button.quiet'),null,{timeout:10000});}
  // Truth or dare: Oliver takes a truth, then it is Yasmine's turn.
  await op.click('#truthDare .game-actions button.primary');await op.fill('#tdResponse','The night we saw the sea.');
  await shot(op,'06-play-truth-375');
  await op.click('#truthDare .game-draw button.primary');
  await op.waitForFunction(()=>/turn|tour|turno|دور/i.test(document.querySelector('#truthDare .body-strong').textContent)&&!document.querySelector('#truthDare .game-draw'),null,{timeout:10000});
  await yp.click('#nav-play');
  await yp.waitForFunction(()=>/Your turn/.test(document.querySelector('#truthDare .body-strong')?.textContent??''),null,{timeout:15000});
  check('truth or dare hands the turn to Yasmine',true,await yp.locator('#truthDare .body-strong').textContent());
  await yp.click('#truthDare .game-actions button:not(.primary)');await yp.click('#truthDare .game-draw button.primary');
  await yp.waitForFunction(()=>!document.querySelector('#truthDare .game-draw'),null,{timeout:10000});
  const listed=await yp.locator('.game-history li').count();await yp.click('#truthDare > button.quiet');
  await yp.waitForFunction(n=>document.querySelectorAll('.game-history li').length>n,listed,{timeout:15000});
  check('finished game is listed with both turns',/turns: 2/.test(await yp.locator('.game-history li').first().textContent()),await yp.locator('.game-history li').first().textContent());

  // Live air hockey on the private pair channel.
  await op.click('#hockeyJoin');await yp.click('#hockeyJoin');
  const live=async p=>p.waitForFunction(()=>/Live/.test(document.querySelector('#hockeyStatus').textContent),null,{timeout:20000}).then(()=>true,()=>false);
  const [ol,yl]=await Promise.all([live(op),live(yp)]);
  check('air hockey: both see the live table',ol&&yl,`${await op.locator('#hockeyStatus').textContent()} | ${await yp.locator('#hockeyStatus').textContent()}`);
  if(ol&&yl){
    const c=await op.locator('.hockey-table').boundingBox();await op.mouse.move(c.x+c.width/2,c.y+c.height*.8);await op.mouse.down();
    for(let i=0;i<14;i++){await op.mouse.move(c.x+c.width/2+(i%2?-30:30),c.y+c.height*(.8-i*.03),{steps:2});await op.waitForTimeout(40);}
    await op.mouse.up();await op.waitForTimeout(900);
    const guestScore=await yp.waitForFunction(()=>document.querySelector('#airHockey .hockey-score').textContent.trim(),null,{timeout:8000}).then(h=>h.jsonValue(),()=>'');
    check('air hockey: guest receives the host\'s table state',!!guestScore,guestScore);
    await shot(op,'07-hockey-host-375');await shot(yp,'08-hockey-guest-375');
    await op.click('#airHockey button.quiet');
  }

  // Terminal behind the moon: harissa on, then off.
  await op.click('#nav-garden');await op.waitForTimeout(300);
  const moon=await op.locator('.moon circle').last().boundingBox();
  if(moon){await op.mouse.move(moon.x+moon.width/2,moon.y+moon.height/2);await op.mouse.down();await op.waitForTimeout(900);await op.mouse.up();}
  const term=await op.waitForSelector('dialog.terminal[open]',{timeout:5000}).then(()=>true,()=>false);
  check('long-press on the moon opens the terminal',term);
  if(term){await op.fill('#terminalInput','harissa on');await op.keyboard.press('Enter');await op.waitForTimeout(200);await shot(op,'09-terminal-375');await op.keyboard.press('Escape');await op.waitForTimeout(500);
    check('harissa theme applied',await op.evaluate(()=>document.documentElement.dataset.gardenTheme)==='harissa');await shot(op,'10-home-375-harissa');
    await op.evaluate(()=>{localStorage.setItem('garden.harissa','0');});}

  // Italian.
  await op.selectOption('#languageSelect','it');await op.waitForTimeout(400);
  check('Italian applied',await op.evaluate(()=>document.documentElement.lang)==='it'&&/Giardino/.test(await op.locator('#nav-garden').textContent()));
  await shot(op,'11-home-375-italian');

  // Day theme by local time (12:00) and desktop sizes.
  const dk=await person(browser,'oliver',{width:1280,height:800});
  await shot(dk.page,'12-home-1280-night');await dk.page.click('#nav-play');await dk.page.waitForTimeout(300);await shot(dk.page,'13-play-1280');
  await dk.page.evaluate(()=>{localStorage.setItem('garden.followTime','0');});
  await dk.page.click('#profileBubble');await dk.page.selectOption('#themeSelect','light');await dk.page.click('#profileClose');await dk.page.click('#nav-garden');await dk.page.waitForTimeout(500);
  check('Day theme from the picker',await dk.page.evaluate(()=>document.documentElement.dataset.gardenTheme)==='day');
  await shot(dk.page,'14-home-1280-day');
  const dp=await person(browser,'yasmine',{width:375,height:812});
  await dp.page.evaluate(()=>{localStorage.setItem('garden.followTime','0');});await dp.page.click('#profileBubble');await dp.page.selectOption('#themeSelect','light');await dp.page.click('#profileClose');await dp.page.click('#nav-garden');await dp.page.waitForTimeout(400);
  await shot(dp.page,'15-home-375-day');

  // Accessibility basics.
  check('garden has a text summary for screen readers',/flower|fior|fleur|ورد/i.test(await op.locator('.garden-viewport').getAttribute('aria-label')??''));
  check('every nav tab has an icon and a text label',await op.evaluate(()=>[...document.querySelectorAll('.bottom-nav button')].every(b=>b.querySelector('svg')&&b.textContent.trim())));
  check('heart button is at least 44px',await op.evaluate(()=>{const r=document.querySelector('#affectionButton').getBoundingClientRect();return r.width>=44&&r.height>=44;}));
  check('no horizontal page scroll at 375',await op.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));

  const errors=[...op.errors,...yp.errors,...dk.page.errors,...dp.page.errors];
  check('no page errors, console errors or CSP violations',errors.length===0,errors.slice(0,5).join(' | '));
  await browser.close();
  const failed=results.filter(r=>!r.ok);console.log(`\n${results.length-failed.length}/${results.length} checks passed`);
  require('fs').writeFileSync(`${out}/e2e-results.json`,JSON.stringify(results,null,2));process.exit(failed.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
