import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hockeyWins,combo} from '../src/garden/model.js';
import {resolveGardenTheme,gardenLight} from '../src/design/theme.js';
import {CULTURE,CULTURE_IDS} from '../src/garden3d/culture.js';
import {LOCALES} from '../experience/i18n.mjs';

const D=86400000,NOW=new Date(2026,10,19,12).getTime(),iso=ms=>new Date(ms).toISOString();
const members=[{profile_id:'a',slot:1},{profile_id:'b',slot:2}];
const catalogs=Object.fromEntries(await Promise.all(Object.keys(LOCALES).map(async l=>[l,JSON.parse(await readFile(new URL(`../experience/locales/${l}.json`,import.meta.url),'utf8'))])));

test('air hockey wins: the higher score wins, draws and other games count for nobody',()=>{
  const e=(profile_id,score_me,score_partner,game='hockey',kind='finish')=>({profile_id,score_me,score_partner,game,kind});
  assert.deepEqual(hockeyWins([e('a',5,3),e('a',2,5),e('b',5,1),e('b',3,3),e('a',null,null,'truth_dare')],members),{a:1,b:2});
  assert.deepEqual(hockeyWins([],members),{a:0,b:0});
});
test('combo counts days in a row when both did something; today stays pending until both have',()=>{
  const snap=(rows)=>({members,content:rows.map(([owner_id,ms])=>({owner_id,created_at:iso(ms)})),answers:[],gameEvents:[],flowers:[],thoughts:[],moods:[]});
  assert.deepEqual(combo(snap([['a',NOW],['a',NOW-D],['b',NOW-D],['a',NOW-2*D],['b',NOW-2*D]]),NOW),{days:2,today:false});
  assert.deepEqual(combo(snap([['a',NOW],['b',NOW],['a',NOW-D],['b',NOW-D]]),NOW),{days:2,today:true});
  assert.deepEqual(combo(snap([['a',NOW-3*D],['b',NOW-3*D]]),NOW),{days:0,today:false},'a gap breaks the combo');
  assert.deepEqual(combo({members:[members[0]]},NOW),{days:0,today:false},'needs both of you');
  const mixed={members,content:[{owner_id:'a',created_at:iso(NOW-D)}],answers:[{owner_id:'b',submitted_at:iso(NOW-D)}],gameEvents:[],flowers:[],thoughts:[],moods:[]};
  assert.equal(combo(mixed,NOW).days,1,'any kind of activity counts');
});
test('appearance: always dark wins over the time of day; the garden keeps its own light',()=>{
  const noon=new Date(2026,10,19,12),night=new Date(2026,10,19,22),golden=new Date(2026,10,19,18,30);
  assert.equal(resolveGardenTheme({followTime:true,now:noon}),'day');
  assert.equal(resolveGardenTheme({followTime:true,alwaysDark:true,now:noon}),'night');
  assert.equal(resolveGardenTheme({followTime:true,harissa:true,alwaysDark:true,now:noon}),'harissa');
  assert.deepEqual([noon,golden,night].map(gardenLight),['day','dusk','night']);
});
test('every discovery has its title, text and meaning in all five languages',()=>{
  assert.equal(CULTURE.length,18);assert.equal(new Set(CULTURE_IDS).size,18);
  for(const c of CULTURE){
    assert.ok(['tn','ve','both'].includes(c.from),c.id);assert.ok(c.word.trim(),c.id);
    for(const [locale,cat] of Object.entries(catalogs))for(const part of ['title','text','meaning'])assert.ok(cat[`culture.${c.id}.${part}`]?.trim(),`${locale} culture.${c.id}.${part}`);
  }
});
test('the 3D scene marks every discovery spot it draws, and the shell has five tabs',async()=>{
  const scene=await readFile(new URL('../src/garden3d/scene.js',import.meta.url),'utf8');
  const spots=[...scene.matchAll(/spot\('([a-z0-9]+)'/g)].map(m=>m[1]);
  assert.deepEqual([...new Set(spots)].sort(),[...CULTURE_IDS].sort());
  assert.ok(!/cdn\.|https?:\/\//.test(scene.replace(/\/\/[^\n]*/g,'')),'the scene loads nothing from the network');
  const html=await readFile(new URL('../src/template.html',import.meta.url),'utf8');
  assert.deepEqual([...html.matchAll(/data-page="([a-z]+)"/g)].map(m=>m[1]),['garden','talk','play','learn','us']);
  for(const id of ['page-garden','page-talk','page-play','page-learn','page-us','page-journal','page-questions','timeChip','receptionToggle','bellCount','toadCard','comboCard','learnList'])assert.ok(html.includes(`id="${id}"`),id);
});
test('the 3D garden is its own chunk, loaded after the app starts',async()=>{
  const meta=JSON.parse(await readFile(new URL('../dist/build-meta.json',import.meta.url),'utf8'));
  const app=meta.outputs['dist/assets/app.js'],chunk=Object.entries(meta.outputs).find(([k])=>/dist\/assets\/chunks\/scene-[A-Z0-9]+\.js$/.test(k));
  assert.ok(chunk,'scene chunk exists');
  assert.ok(Object.keys(chunk[1].inputs).some(k=>k.includes('node_modules/three/')),'three.js lives in the chunk');
  assert.ok(!Object.keys(app.inputs).some(k=>k.includes('node_modules/three/')),'three.js is not in the main bundle');
});
