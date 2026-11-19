import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {stageFor,placeFlowers,authorTone,isDrooping,needsWater,lanterns,visitors,summary,FLOWER_TYPES,LEGACY_FLOWER_TYPES,BEDS} from '../src/garden/model.js';
import {resolveGardenTheme,themeChoices,isDaytime} from '../src/design/theme.js';
import {FONT_FILES,fontFaceCSS} from '../src/design/fonts.mjs';
import en from '../experience/locales/en.json' with {type:'json'};
import es from '../experience/locales/es.json' with {type:'json'};
import fr from '../experience/locales/fr.json' with {type:'json'};
import it from '../experience/locales/it.json' with {type:'json'};
import aeb from '../experience/locales/aeb-TN.json' with {type:'json'};

const DAY=86400000,NOW=Date.UTC(2026,10,15,12),iso=ms=>new Date(ms).toISOString();
const root=new URL('../',import.meta.url);

test('every 3 waterings grow one stage: seed, sprout, bud, bloom',()=>{
  assert.deepEqual([0,1,2,3,5,6,8,9,12,-1,'x'].map(stageFor),[0,0,0,1,1,2,2,3,3,0,0]);
});
test('six flower types, the three legacy ones still included',()=>{
  assert.deepEqual(FLOWER_TYPES,['rose','marigold','jasmine','lavender','lilium','orchid']);
  for(const t of LEGACY_FLOWER_TYPES)assert.ok(FLOWER_TYPES.includes(t));
});
test('placement is deterministic, collision free and stays inside the beds for 48 flowers',()=>{
  const flowers=Array.from({length:48},(_,i)=>({id:`id-${i}`,created_at:iso(NOW-i*1000)}));
  const a=placeFlowers(flowers),b=placeFlowers([...flowers].reverse());
  assert.equal(a.length,48);
  assert.deepEqual(a.map(p=>[p.flower.id,p.x,p.y]).sort(),b.map(p=>[p.flower.id,p.x,p.y]).sort());
  const slots=new Set(a.map(p=>p.bed+Math.round((p.x-BEDS[p.bed].x0)/BEDS[p.bed].step)));assert.equal(slots.size,48);
  for(const p of a){assert.ok(p.x>0&&p.x<1500);assert.ok(p.y>300&&p.y<500);}
  for(let i=1;i<a.length;i++)assert.ok(a[i-1].y<=a[i].y,'drawn back to front');
});
test('authorship colour: names first, slot as fallback',()=>{
  const members=[{profile_id:'a',slot:1},{profile_id:'b',slot:2}];
  assert.equal(authorTone('a',members,[{id:'a',display_name:'Yasmine'}]),'yasmine');
  assert.equal(authorTone('b',members,[{id:'b',display_name:'Oliver'}]),'oliver');
  assert.equal(authorTone('a',members,[]),'oliver');assert.equal(authorTone('b',members,[]),'yasmine');
});
test('drooping after 3 days without water; one watering revives; thirsty after a day',()=>{
  assert.equal(isDrooping({updated_at:iso(NOW-4*DAY)},NOW),true);
  assert.equal(isDrooping({updated_at:iso(NOW-2*DAY)},NOW),false);
  assert.equal(needsWater({water:3,updated_at:iso(NOW-2*DAY)},NOW),true);
  assert.equal(needsWater({water:9,updated_at:iso(NOW-9*DAY)},NOW),false,'blooming flowers never need water');
});
test('lanterns: one per day both answered in the last 7 days; 7 in a row light the pergola',()=>{
  const day=i=>NOW-i*DAY;
  const mk=days=>({rounds:days.map(i=>({id:'r'+i})),answers:days.flatMap(i=>['o','y'].map(o=>({round_id:'r'+i,owner_id:o,submitted_at:iso(day(i))})))});
  let x=mk([0,1,2,3,4,5,6]);assert.deepEqual({...lanterns(x.rounds,x.answers,NOW)},{lit:7,pergola:true});
  x=mk([1,2,3,4,5,6,7]);assert.equal(lanterns(x.rounds,x.answers,NOW).pergola,true,'streak may end yesterday');
  x=mk([0,1,3]);assert.deepEqual({...lanterns(x.rounds,x.answers,NOW)},{lit:3,pergola:false});
  const half={rounds:[{id:'r'}],answers:[{round_id:'r',owner_id:'o',submitted_at:iso(NOW)}]};
  assert.equal(lanterns(half.rounds,half.answers,NOW).lit,0,'one answer lights nothing');
});
test('a finished game brings a visitor for one day, at most 8',()=>{
  const ev=[...Array(10)].map((_,i)=>({kind:'finish',created_at:iso(NOW-i*3600000)}));
  assert.equal(visitors(ev,NOW),8);assert.equal(visitors([{kind:'finish',created_at:iso(NOW-2*DAY)}],NOW),0);
  assert.equal(visitors([{kind:'truth',created_at:iso(NOW)}],NOW),0);
});
test('summary counts live flowers, thirsty ones and today\'s planting',()=>{
  const s=summary([{id:1,water:0,created_at:iso(NOW),updated_at:iso(NOW)},{id:2,water:4,created_at:iso(NOW-5*DAY),updated_at:iso(NOW-2*DAY)},{id:3,water:9,deleted_at:iso(NOW),created_at:iso(NOW)}],NOW);
  assert.equal(s.count,2);assert.equal(s.thirsty,1);assert.equal(s.plantedToday.id,1);
});
test('Night / Day / Harissa: harissa wins, then local time, then the stored legacy scheme',()=>{
  const noon=new Date(2026,10,15,12),late=new Date(2026,10,15,22);
  assert.equal(isDaytime(noon),true);assert.equal(isDaytime(late),false);
  assert.equal(resolveGardenTheme({harissa:true,now:noon}),'harissa');
  assert.equal(resolveGardenTheme({followTime:true,now:noon}),'day');
  assert.equal(resolveGardenTheme({followTime:true,now:late}),'night');
  assert.equal(resolveGardenTheme({followTime:false,legacy:'pastel'}),'day');
  assert.equal(resolveGardenTheme({followTime:false,legacy:'ocean'}),'night');
  assert.deepEqual(themeChoices('dark'),['dark','light']);assert.deepEqual(themeChoices('ocean'),['dark','light','ocean']);
});
test('no ASCII art and no <pre> anywhere in the app shell or garden code',async()=>{
  const template=await readFile(new URL('src/template.html',root),'utf8');
  assert.ok(!/<pre|class="ascii"/.test(template));
  for(const dir of ['src/garden/','src/games/','src/design/'])for(const f of await readdir(new URL(dir,root))){
    if(!/\.(js|mjs|css)$/.test(f))continue;const text=await readFile(new URL(dir+f,root),'utf8');
    assert.ok(!/<pre|\\\\\|\/|\(\*\)|_\|_|_\.\.\._|`-\.\.\.-'/.test(text),`${dir}${f} looks like character art`);
  }
  const app=await readFile(new URL('src/app.js',root),'utf8');assert.ok(!app.includes("el('pre'"),'garden renders no <pre>');
});
test('fonts are self-hosted, allowed by the CSP and present after the build',async()=>{
  const build=await readFile(new URL('scripts/build.mjs',root),'utf8');assert.match(build,/font-src 'self'/);
  const css=fontFaceCSS('./fonts/');for(const f of FONT_FILES){assert.ok(css.includes(f.file));await access(new URL('node_modules/@fontsource/'+f.pkg+'/files/'+f.file,root));}
  for(const fam of ['Fraunces','Inter','JetBrains Mono','Noto Naskh Arabic'])assert.ok(FONT_FILES.some(f=>f.family===fam));
  assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(css));
});
test('every string key used by the garden, design and games modules exists in all four catalogs',async()=>{
  const used=new Set();
  for(const dir of ['src/garden/','src/games/','src/design/'])for(const f of await readdir(new URL(dir,root))){
    if(!f.endsWith('.js'))continue;const text=await readFile(new URL(dir+f,root),'utf8');
    for(const m of text.matchAll(/\bt\('([a-zA-Z][\w.-]+)'/g))if(!m[1].endsWith('.'))used.add(m[1]);
  }
  for(const prefix of ['flowers.','garden.stage.'])for(const k of Object.keys(en))if(k.startsWith(prefix))used.add(k);
  for(const k of ['game.td.truth','game.td.dare',...Array.from({length:10},(_,i)=>'game.truth.t'+String(i+1).padStart(2,'0')),...Array.from({length:10},(_,i)=>'game.dare.d'+String(i+1).padStart(2,'0'))])used.add(k);
  for(const type of FLOWER_TYPES)used.add('flowers.'+type);
  for(const [name,cat] of Object.entries({en,es,fr,it,aeb}))for(const k of used)assert.ok(Object.hasOwn(cat,k),`${name} is missing ${k}`);
  assert.ok(used.size>60);
});
