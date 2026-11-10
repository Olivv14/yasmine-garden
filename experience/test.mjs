import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {THEMES,THEME_IDS,checkThemeContrast,contrastRatio,applyTheme,THEME_BRIDGE_CSS,getTheme} from './themes.mjs';
import {LOCALES,LANGUAGE_CHOICES,createTranslator,validateCatalogs,placeholders,formatNumber,escapeHTML} from './i18n.mjs';
import {QUESTION_BANK,QUESTION_IDS,localizedQuestions,assertQuestionBank} from './questions.mjs';
import {AFFECTION_PHRASE_KEYS,createAffectionController} from './affection.mjs';
import {DATABASE_ERROR_KEYS,AUTH_ERROR_KEYS,errorKey} from './errors.mjs';
import {MOOD_ANIMALS,validatePreferences,createPreferenceStore} from './preferences.mjs';
let checks=0;
const check=(fn)=>{fn();checks++;};
const rejects=async fn=>{await assert.rejects(fn);checks++;};
const catalogs=Object.fromEntries(await Promise.all(Object.keys(LOCALES).map(async l=>[l,JSON.parse(await readFile(new URL(`./locales/${l}.json`,import.meta.url),'utf8'))])));
const catalogInfo=validateCatalogs(catalogs);
const source=(await readFile(new URL('./catalog.tsv',import.meta.url),'utf8')).trimEnd().split(/\r?\n/);
check(()=>assert.equal(source.shift(),'key\ten\tfr\taeb-TN'));
const authored={en:{},fr:{},'aeb-TN':{}};
for(const line of source){const [key,...values]=line.split('\t');check(()=>assert.equal(values.length,3));for(const [i,l]of Object.keys(LOCALES).entries()){check(()=>assert.ok(!Object.hasOwn(authored[l],key)));authored[l][key]=values[i];}}
check(()=>assert.deepEqual(catalogs,authored));
for(const key of [...Object.values(DATABASE_ERROR_KEYS),...Object.values(AUTH_ERROR_KEYS)])check(()=>assert.ok(Object.hasOwn(catalogs.en,key)));
check(()=>assert.equal(errorKey({code:'40001'}),'errors.conflict'));
check(()=>assert.equal(errorKey({code:'invalid_credentials'},{domain:'auth'}),'auth.invalidCredentials'));
check(()=>assert.equal(errorKey({code:'unknown',message:'Do not display untranslated prose'}),'common.unknownError'));
check(()=>assert.equal(errorKey({code:'toString'}),'common.unknownError'));
check(()=>assert.throws(()=>errorKey({}, {domain:'bad'}),/Unknown error domain/));
check(()=>assert.equal(catalogInfo.locales,3));
let placeholderContracts=0;
for(const key of Object.keys(catalogs.en)) {
  for(const locale of Object.keys(LOCALES)) {
    check(()=>assert.deepEqual(placeholders(catalogs[locale][key]),placeholders(catalogs.en[key])));
    check(()=>assert.ok(catalogs[locale][key].trim()));
    const params=Object.fromEntries(placeholders(catalogs.en[key]).map(n=>[n,'<input>&"\' {{sender}}']));
    const text=createTranslator(locale,catalogs).t(key,params);
    check(()=>assert.ok(typeof text==='string'&&text.length>0));
    placeholderContracts++;
  }
}
check(()=>assert.throws(()=>validateCatalogs({...catalogs,fr:{...catalogs.fr,extra:'x'}}),/key mismatch/));
check(()=>assert.throws(()=>validateCatalogs({...catalogs,fr:{...catalogs.fr,'affection.phrase01':'No sender'}}),/Placeholder mismatch/));
check(()=>assert.throws(()=>createTranslator('es',catalogs),/Unsupported/));
const en=createTranslator('en',catalogs),tn=createTranslator('aeb-TN',catalogs);
check(()=>assert.throws(()=>en.t('does.not.exist'),/Missing translation/));
check(()=>assert.throws(()=>en.t('toString'),/Missing translation/));
check(()=>assert.throws(()=>en.t('affection.phrase01'),/parameters mismatch/));
check(()=>assert.throws(()=>en.t('common.save',{extra:'x'}),/parameters mismatch/));
check(()=>assert.throws(()=>en.t('affection.phrase01',{sender:{}}),/Invalid parameter/));
const payload='<img src=x onerror="alert(1)"> & \'quoted\'';
let assigned='';const textSink={set textContent(v){assigned=v;},get textContent(){return assigned;},set innerHTML(_){throw Error('Unsafe HTML sink');}};
en.setText(textSink,'affection.phrase01',{sender:payload});
check(()=>assert.equal(assigned,`${payload} is sending a little warmth your way.`));
check(()=>assert.equal(en.escapedText('affection.phrase01',{sender:payload}),escapeHTML(assigned)));
check(()=>assert.ok(en.escapedText('affection.phrase01',{sender:payload}).includes('&lt;img')));
check(()=>assert.ok(!en.escapedText('affection.phrase01',{sender:payload}).includes('<img')));
const attrs={};tn.applyLanguage({setAttribute(k,v){attrs[k]=v;}});
check(()=>assert.deepEqual(attrs,{lang:'aeb-TN',dir:'rtl'}));
check(()=>assert.equal(tn.meta.numberLocale,'ar-TN'));
check(()=>assert.equal(formatNumber('aeb-TN',1234.5),new Intl.NumberFormat('ar-TN').format(1234.5)));
check(()=>assert.throws(()=>formatNumber('aeb-TN',1,{style:'unit',unit:'meter'}),/Numeric-only/));
check(()=>assert.throws(()=>formatNumber('aeb-TN',1000,{notation:'compact'}),/Numeric-only/));
check(()=>assert.deepEqual(LANGUAGE_CHOICES.map(x=>x.flag),['🇬🇧','🇫🇷','🇹🇳']));
check(()=>assert.deepEqual(LANGUAGE_CHOICES.map(x=>x.accessibleName),['English','Français','تونسي']));
check(()=>assert.ok(!LANGUAGE_CHOICES.some(x=>/^(EN|FR|ES|TN)$/.test(x.label))));
check(()=>assert.deepEqual(QUESTION_IDS,['q1','q2','q3','q4','q5','q6','q7','q8']));
for(const locale of Object.keys(LOCALES)) {
  const t=createTranslator(locale,catalogs).t,bank=localizedQuestions(t);
  check(()=>assert.equal(bank.length,8));
  check(()=>assert.deepEqual(bank.map(q=>q.id),QUESTION_IDS));
  for(const q of bank)check(()=>assert.ok(q.prompt&&q.theme));
  for(const key of AFFECTION_PHRASE_KEYS)check(()=>assert.deepEqual(placeholders(catalogs[locale][key]),['sender']));
  check(()=>assert.equal(new Set(AFFECTION_PHRASE_KEYS.map(k=>catalogs[locale][k])).size,10));
  check(()=>assert.equal(Object.keys(catalogs[locale]).filter(k=>/^affection\.phrase\d+$/.test(k)).length,10));
  for(const q of QUESTION_BANK)check(()=>assert.notEqual(t(q.promptKey),q.sourcePrompt));
}
check(()=>assert.ok(assertQuestionBank(QUESTION_BANK.map(q=>({id:q.id,prompt:q.sourcePrompt,theme:q.sourceTheme})).reverse())));
check(()=>assert.throws(()=>assertQuestionBank(QUESTION_BANK.map(q=>({id:q.id,prompt:'changed',theme:q.sourceTheme}))),/source mismatch/));
// Verify against actual backend seed, not just a duplicate fixture.
const sql=await readFile(new URL('../backend/001_shared_app.sql',import.meta.url),'utf8');
for(const q of QUESTION_BANK)check(()=>assert.ok(sql.includes(`('${q.id}','${q.sourceTheme}','${q.sourcePrompt}')`),`Seed drift: ${q.id}`));
check(()=>assert.deepEqual(THEME_IDS,['dark','light','pastel','barcelona','tunisia','italy','lavender','ocean','forest','rose']));
let contrastPairs=0,minRatio=Infinity;
for(const id of THEME_IDS) {
  const theme=THEMES[id];
  for(const result of checkThemeContrast(id)) {
    check(()=>assert.ok(result.pass,`${id} ${result.fg}/${result.bg}: ${result.ratio}`));contrastPairs++;minRatio=Math.min(minRatio,result.ratio);
  }
  for(const name of ['--night','--panel','--paper','--muted','--warm','--sage','--line','--error'])check(()=>assert.ok(Object.hasOwn(theme.vars,name)));
  const props={},attributes={};applyTheme({style:{setProperty(k,v){props[k]=v;}},setAttribute(k,v){attributes[k]=v;}},id);
  check(()=>assert.equal(attributes['data-theme'],id));check(()=>assert.equal(props['--night'],theme.vars['--night']));
}
check(()=>assert.equal(contrastRatio('#000000','#ffffff'),21));
check(()=>assert.throws(()=>getTheme('missing'),/Unknown theme/));
check(()=>assert.ok(THEME_BRIDGE_CSS.includes('button.primary')&&THEME_BRIDGE_CSS.includes('--on-accent')));
let sequence=0,events=[],animations=[];
const controller=createAffectionController({idFactory:()=>`burst-${++sequence}`,onIntent:e=>events.push(e),animate:a=>animations.push(a)});
for(let i=1;i<=9;i++)check(()=>assert.equal(controller.tap(`activation-${i}`),null));
check(()=>assert.equal(events.length,0));controller.tap('activation-1');check(()=>assert.equal(controller.getState().tapCount,9));
const first=controller.tap('activation-10');check(()=>assert.equal(events.length,1));check(()=>assert.equal(first.tapCount,10));
for(let i=0;i<30;i++)controller.tap(`extra-${i}`);
check(()=>assert.equal(events.length,1));check(()=>assert.equal(controller.retry(),first));check(()=>assert.equal(events.length,1));
check(()=>assert.ok(Object.isFrozen(first)));check(()=>assert.equal(animations[0].kind,'flower-bloom'));
controller.reset();controller.tap('activation-10');check(()=>assert.equal(controller.getState().tapCount,0));
for(let i=1;i<=10;i++)controller.tap(`second-${i}`);
check(()=>assert.equal(events.length,2));check(()=>assert.notEqual(events[1].idempotencyKey,first.idempotencyKey));check(()=>assert.notEqual(events[1].phraseKey,first.phraseKey));
const reduced=[];const rc=createAffectionController({idFactory:()=>`reduced`,onIntent:()=>{},reducedMotion:true,animate:a=>reduced.push(a)});
for(let i=0;i<10;i++)rc.tap(`r-${i}`);check(()=>assert.equal(reduced[0].kind,'static-flower'));check(()=>assert.equal(reduced[0].reducedMotion,true));
let thrown=0;const faulty=createAffectionController({idFactory:()=>`failed`,onIntent:()=>{thrown++;throw Error('adapter rejected');}});
for(let i=0;i<9;i++)faulty.tap(`f-${i}`);check(()=>assert.throws(()=>faulty.tap('f-9'),/adapter rejected/));
const failedIntent=faulty.retry();faulty.tap('f-10');faulty.retry();check(()=>assert.equal(thrown,1));check(()=>assert.equal(failedIntent.idempotencyKey,'failed'));
const partial=createAffectionController({idFactory:()=>`partial`,onIntent:()=>{}});partial.tap('p-1');partial.reset();check(()=>assert.equal(partial.getState().tapCount,0));partial.tap('p-1');check(()=>assert.equal(partial.getState().tapCount,0));
check(()=>assert.deepEqual(Object.keys(MOOD_ANIMALS),['none','calm','hopeful','nostalgic','hug','difficult']));
const prefs={version:1,language:'aeb-TN',theme:'tunisia',displayName:'Test name',nickname:'',photoRef:null,moodAnimal:'calm'};
check(()=>assert.equal(validatePreferences(prefs).language,'aeb-TN'));
check(()=>assert.throws(()=>validatePreferences({...prefs,photoRef:'https://bad.invalid/photo'}),/photo/));
check(()=>assert.throws(()=>validatePreferences({...prefs,owner_id:'invented'}),/Unknown/));
check(()=>assert.throws(()=>validatePreferences({...prefs,displayName:''}),/displayName/));
let stored=null,readCount=0;const store=createPreferenceStore({read:async()=>{readCount++;return stored;},write:async(_,v)=>{stored={...v};}});
assert.equal(await store.load('test-scope'),null);checks++;
assert.deepEqual(await store.save('test-scope',prefs),prefs);checks++;
check(()=>assert.ok(readCount>=2));
await rejects(()=>store.save('',prefs));
await rejects(()=>createPreferenceStore({read:async()=>null,write:async()=>{}}).save('test-scope',prefs));
await rejects(()=>createPreferenceStore({read:async()=>null,write:async()=>{throw Error('storage denied');}}).save('test-scope',prefs));
console.log(`PASS ${checks} assertions`);
console.log(`Catalogs: ${catalogInfo.locales} locales x ${catalogInfo.keys} identical keys; ${placeholderContracts} interpolation contracts`);
console.log(`Questions: ${QUESTION_IDS.length} stable IDs; actual SQL seed matches; translated prompts static`);
console.log(`Themes: ${THEME_IDS.length}; ${contrastPairs} contrast pairs pass; minimum ${minRatio.toFixed(2)}:1`);
console.log(`RTL: aeb-TN + rtl; numeric Intl ar-TN only; flags and full accessible names pass`);
console.log(`Affection: 10 phrases/locale; 10 distinct taps -> 1 intent; reset/retry/throw/reduced-motion pass`);
console.log(`Preferences: validation + adapter failure/readback checks pass; no cloud implementation`);
console.log(`No live app integration, native Tunisian review or push delivery is claimed.`);
