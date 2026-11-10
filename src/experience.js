// Static catalogs only. No translation service, account write or runtime fallback.
import en from '../experience/locales/en.json' with {type:'json'};
import fr from '../experience/locales/fr.json' with {type:'json'};
import aeb from '../experience/locales/aeb-TN.json' with {type:'json'};
import {createTranslator, LANGUAGE_CHOICES} from '../experience/i18n.mjs';
import {THEME_IDS, applyTheme} from '../experience/themes.mjs';
import {errorKey,AUTH_ERROR_KEYS} from '../experience/errors.mjs';
import {flagIcon} from './flags.js';
export {THEME_IDS, LANGUAGE_CHOICES};
const catalogs={en,fr,'aeb-TN':aeb};
let translator=createTranslator('en',catalogs), theme='dark';
const bindings=new Map();
export const t=(key,params)=>translator.t(key,params);
export const locale=()=>translator.locale;
export function uiError(key,params={}){const e=new Error(key);e.uiKey=key;e.uiParams=params;return e;}
export function errorText(e){return t(e?.uiKey||errorKey(e,{domain:Object.hasOwn(AUTH_ERROR_KEYS,e?.code??'')?'auth':'database'}),e?.uiParams||{});}
const resolve=value=>typeof value==='function'?resolve(value()):value;
// Bind only application-owned nodes. Never inspect or translate user input.
export function copy(node,value,attribute='textContent'){
  if(!node)throw new Error('Missing localization target');
  let values=bindings.get(node);if(!values){values=new Map();bindings.set(node,values);}
  values.set(attribute,value);
  const out=resolve(value);if(attribute==='textContent')node.textContent=out??'';else if(attribute==='validation')node.setCustomValidity(out??'');else node.setAttribute(attribute,out??'');
  return node;
}
export function initializeCopy(){
  for(const n of document.querySelectorAll('[data-i18n]')){const key=n.dataset.i18n;copy(n,()=>t(key));}
  for(const attr of ['placeholder','aria-label','title','alt'])for(const n of document.querySelectorAll('[data-i18n-'+attr+']')){const key=n.getAttribute('data-i18n-'+attr);copy(n,()=>t(key),attr);}
  translator.applyLanguage(document.documentElement);applyTheme(document.documentElement,theme);
  document.getElementById('languageFlag')?.replaceChildren(flagIcon(translator.locale));
  // Drop detached render bindings promptly so old private snapshots/blobs are not
  // retained until the next language switch. New nodes are attached synchronously.
  new MutationObserver(()=>{for(const node of bindings.keys())if(!node.isConnected)bindings.delete(node);}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('invalid',event=>{const n=event.target;if(!n.setCustomValidity)return;const key=n.validity.valueMissing?'errors.required':n.validity.tooShort?'auth.passwordShort':n.type==='url'?'dedication.invalidURL':'errors.invalidValue';const params=key==='auth.passwordShort'?{min:n.minLength}:{};copy(n,()=>t(key,params),'validation');},true);
  document.addEventListener('input',event=>{const n=event.target;if(n.setCustomValidity)copy(n,'','validation');},true);
}
export function setExperience(next={}){
  // Construct/validate before changing anything. Missing catalog keys throw, never mix languages.
  const candidate=createTranslator(next.language??translator.locale,catalogs);
  if(next.theme&&!THEME_IDS.includes(next.theme))throw new RangeError('Unknown theme');
  translator=candidate;theme=next.theme??theme;
  translator.applyLanguage(document.documentElement);applyTheme(document.documentElement,theme);
  document.getElementById('languageFlag')?.replaceChildren(flagIcon(translator.locale));
  for(const [node,values] of bindings){if(!node.isConnected){bindings.delete(node);continue;}for(const [attr,value] of values)copy(node,value,attr);}
  const select=document.getElementById('languageSelect');if(select)select.value=translator.locale;
  const themes=document.getElementById('themeSelect');if(themes)themes.value=theme;
  const scheme=document.querySelector('meta[name=color-scheme]');if(scheme)scheme.content=document.documentElement.style.getPropertyValue('color-scheme');
  const color=document.querySelector('meta[name=theme-color]');if(color)color.content=document.documentElement.style.getPropertyValue('--night');
}
// Preference drafts and independent DB versions live in profile-state.js.
export function resetExperience(){setExperience({language:'en',theme:'dark'});}
