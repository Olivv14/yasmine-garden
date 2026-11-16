import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import en from '../experience/locales/en.json' with {type:'json'};
import fr from '../experience/locales/fr.json' with {type:'json'};
import aeb from '../experience/locales/aeb-TN.json' with {type:'json'};
import {createTranslator} from '../experience/i18n.mjs';
import {t,errorText,uiError} from '../src/experience.js';
const catalogs={en,fr,'aeb-TN':aeb};
test('integrated default is English, error codes never expose provider prose',()=>{
 assert.equal(t('nav.today'),en['nav.today']);
 for(const [code,key] of [['40001','errors.conflict'],['invalid_credentials','auth.invalidCredentials'],['23505','errors.duplicate']])assert.equal(errorText({code,message:'UNTRANSLATED SECRET PROVIDER PROSE'}),en[key]);
 assert.equal(errorText(uiError('media.tooMany',{count:20})),en['media.tooMany'].replace('{{count}}','20'));
 assert.equal(errorText({message:'untranslated provider prose'}),en['common.unknownError']);
});
test('strict runtime lookup fails on missing key, locale, catalog and interpolation mismatch',()=>{
 for(const locale of Object.keys(catalogs)){
  const translator=createTranslator(locale,catalogs);
  assert.throws(()=>translator.t('missing.integration.key'),/Missing translation/);
  assert.throws(()=>translator.t('garden.count'),/parameters mismatch/);
 }
 assert.throws(()=>createTranslator('es',catalogs),/Unsupported language/);
 const broken=structuredClone(catalogs);delete broken.fr['nav.today'];assert.throws(()=>createTranslator('fr',broken),/Catalog key mismatch/);
});
test('every static DOM text and translated attribute key exists with no placeholder requirement',async()=>{
 const html=await readFile(new URL('../src/template.html',import.meta.url),'utf8');let count=0;
 for(const m of html.matchAll(/data-i18n(?:-placeholder|-aria-label|-title|-alt)?="([^"]+)"/g)){
  count++;for(const locale of Object.keys(catalogs))assert.doesNotThrow(()=>createTranslator(locale,catalogs).t(m[1]),locale+':'+m[1]);
 }
 assert.ok(count>90);assert.ok(html.includes('<bdi id="profileName"'));assert.ok(!html.includes('lang="es"'));
});
test('bundle contains three local catalogs and actual bridge; no runtime AI or guessed profile RPC',async()=>{
 const meta=JSON.parse(await readFile(new URL('../dist/build-meta.json',import.meta.url),'utf8'));
 for(const locale of Object.keys(catalogs))assert.ok(Object.keys(meta.inputs).some(x=>x.endsWith('experience/locales/'+locale+'.json')));
 const css=await readFile(new URL('../dist/assets/app.css',import.meta.url),'utf8');assert.ok(css.includes('--on-accent'));assert.ok(css.includes('border-inline-start'));
 const source=await readFile(new URL('../src/transport.js',import.meta.url),'utf8');for(const name of ['save_my_profile','save_my_preferences','send_thought','mark_thought_read'])assert.ok(source.includes(".rpc('"+name+"',"));const avatar=await readFile(new URL('../src/avatar.js',import.meta.url),'utf8');for(const name of ['reserve_avatar','finalize_avatar','mark_avatar_delete','finish_avatar_delete'])assert.ok(avatar.includes("rpc(ticket, '"+name+"'"));assert.ok(!/createSignedUrl|getPublicUrl/.test(avatar));
});
