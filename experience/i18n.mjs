export const LOCALES = Object.freeze({
  en: Object.freeze({lang:'en',dir:'ltr',flag:'🇬🇧',name:'English',numberLocale:'en-GB',status:'AI draft; review required'}),
  fr: Object.freeze({lang:'fr',dir:'ltr',flag:'🇫🇷',name:'Français',numberLocale:'fr-FR',status:'AI draft; review required'}),
  'aeb-TN': Object.freeze({lang:'aeb-TN',dir:'rtl',flag:'🇹🇳',name:'تونسي',numberLocale:'ar-TN',status:'AI draft; Tunisian speaker QA required; not native-validated'}),
});
export function localeInfo(locale) {
  if (!Object.hasOwn(LOCALES,locale)) throw new RangeError(`Unsupported language: ${locale}`);
  return LOCALES[locale];
}
export const LANGUAGE_CHOICES = Object.freeze(Object.entries(LOCALES).map(([value,m])=>Object.freeze({value,flag:m.flag,label:m.name,accessibleName:m.name,lang:m.lang,dir:m.dir})));
export function placeholders(text) {
  if (typeof text!=='string') throw new TypeError('Translation must be a string');
  const names=[...text.matchAll(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g)].map(m=>m[1]);
  if (text.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g,'').match(/[{}]/)) throw new TypeError('Invalid placeholder syntax');
  return [...new Set(names)].sort();
}
export function validateCatalogs(catalogs) {
  const locales=Object.keys(LOCALES), base=catalogs.en;
  if (!base || typeof base!=='object' || Array.isArray(base)) throw new TypeError('Missing English reference catalog');
  const keys=Object.keys(base).sort();
  for (const locale of locales) {
    const dict=catalogs[locale];
    if (!dict || JSON.stringify(Object.keys(dict).sort())!==JSON.stringify(keys)) throw new Error(`Catalog key mismatch: ${locale}`);
    for (const key of keys) {
      if (typeof dict[key]!=='string' || !dict[key].trim()) throw new Error(`Empty/non-string translation: ${locale}:${key}`);
      if (JSON.stringify(placeholders(dict[key]))!==JSON.stringify(placeholders(base[key]))) throw new Error(`Placeholder mismatch: ${locale}:${key}`);
    }
  }
  return Object.freeze({locales:locales.length,keys:keys.length});
}
export function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function createTranslator(locale,catalogs) {
  const meta=localeInfo(locale);
  validateCatalogs(catalogs);
  // Snapshot strings: caller mutation cannot silently change this translator.
  const dict=Object.freeze({...catalogs[locale]});
  const t=(key,params={})=>{
    if (!Object.hasOwn(dict,key)) throw new Error(`Missing translation: ${locale}:${key}`);
    if (!params || typeof params!=='object' || Array.isArray(params)) throw new TypeError('Expected interpolation parameters');
    const names=placeholders(dict[key]), actual=Object.keys(params).sort();
    if (JSON.stringify(names)!==JSON.stringify(actual)) throw new Error(`Interpolation parameters mismatch: ${key}`);
    for (const name of names) if (!['string','number'].includes(typeof params[name]) || (typeof params[name]==='number'&&!Number.isFinite(params[name]))) throw new TypeError(`Invalid parameter: ${name}`);
    return dict[key].replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g,(_,name)=>String(params[name]));
  };
  return Object.freeze({locale,meta,t,
    // DOM text is escaped by the textContent sink, not by double-encoding entities.
    setText(node,key,params={}) {if (!node || !('textContent' in node)) throw new TypeError('Expected text node/element');node.textContent=t(key,params);return node;},
    escapedText(key,params={}) {return escapeHTML(t(key,params));},
    applyLanguage(root) {if (!root?.setAttribute) throw new TypeError('Expected document root');root.setAttribute('lang',meta.lang);root.setAttribute('dir',meta.dir);},
  });
}
// ar-TN is explicitly a NUMBER formatter only. Lexical text always remains aeb-TN.
export function formatNumber(locale,value,options={}) {
  const numberLocale=localeInfo(locale).numberLocale;
  if (typeof value!=='number'||!Number.isFinite(value)) throw new TypeError('Expected finite number');
  if (options.style && options.style!=='decimal' || options.notation && options.notation!=='standard' || options.unit || options.currency) throw new TypeError('Numeric-only formatting: no unit, currency, compact or lexical output');
  if (!Intl.NumberFormat.supportedLocalesOf([numberLocale],{localeMatcher:'lookup'}).length) throw new Error(`Number locale unavailable: ${numberLocale}`);
  return new Intl.NumberFormat(numberLocale,{...options,style:'decimal',notation:'standard'}).format(value);
}
