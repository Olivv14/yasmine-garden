import {localeInfo} from './i18n.mjs';
import {getTheme} from './themes.mjs';
export const MOOD_ANIMALS=Object.freeze({none:'🐾',calm:'🐢',hopeful:'🦋',nostalgic:'🐘',hug:'🐻',difficult:'🦔'});
export function validatePreferences(value) {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new TypeError('Expected preferences');
  const allowed=['version','language','theme','displayName','nickname','photoRef','moodAnimal'];
  if (Object.keys(value).some(k=>!allowed.includes(k))) throw new Error('Unknown preference field');
  if(value.version!==1)throw new Error('Unsupported preference version');
  localeInfo(value.language);getTheme(value.theme);
  for (const [key,max] of [['displayName',80],['nickname',80]]) if(typeof value[key]!=='string'||value[key].length>max||value[key].trim()!==value[key]||(key==='displayName'&&!value[key]))throw new Error(`Invalid ${key}`);
  // Opaque application-owned asset reference, never an arbitrary URL or binary.
  if(value.photoRef!==null&&(typeof value.photoRef!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(value.photoRef)))throw new Error('Invalid photo reference');
  if(!Object.hasOwn(MOOD_ANIMALS,value.moodAnimal))throw new Error('Invalid mood animal');
  return Object.freeze({...value});
}
/** Adapter: async read(scope)->object|null; async write(scope, validatedObject)->void.
 * scope MUST be supplied by the real authenticated profile resolver. This helper
 * neither authenticates nor creates identities, implements cloud storage, or
 * chooses localStorage. Adapter failures propagate; no in-memory success fallback.
 */
export function createPreferenceStore(adapter) {
  if(typeof adapter?.read!=='function'||typeof adapter?.write!=='function')throw new TypeError('Provide read/write preference adapter');
  const scopeCheck=scope=>{if(typeof scope!=='string'||!scope.trim())throw new Error('Authenticated preference scope required');};
  return Object.freeze({
    async load(scope){scopeCheck(scope);const value=await adapter.read(scope);return value===null?null:validatePreferences(value);},
    async save(scope,value){scopeCheck(scope);const valid=validatePreferences(value);await adapter.write(scope,{...valid});const stored=await adapter.read(scope);const verified=validatePreferences(stored);if(Object.keys(valid).some(key=>verified[key]!==valid[key]))throw new Error('Preference write not verified');return valid;},
  });
}
