// Offline authoring utility. Run explicitly: node experience/build-catalogs.mjs
// No model/provider calls or package dependencies. Writes only sibling locales.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {LOCALES,validateCatalogs} from './i18n.mjs';
const lines=(await readFile(new URL('./catalog.tsv',import.meta.url),'utf8')).trimEnd().split(/\r?\n/);
const order=Object.keys(LOCALES);
if(lines.shift()!==['key',...order].join('\t'))throw new Error('Unexpected catalog header: expected key + '+order.join(', '));
const catalogs=Object.fromEntries(order.map(l=>[l,{}]));
const seen=new Set();
for(const [i,line] of lines.entries()){
  const cells=line.split('\t');
  if(cells.length!==order.length+1||cells.some(x=>!x.trim()))throw new Error(`Invalid catalog row ${i+2}`);
  const [key,...values]=cells;
  if(!/^[a-z][A-Za-z0-9.-]+$/.test(key)||seen.has(key)||['__proto__','constructor','prototype'].includes(key))throw new Error(`Invalid/duplicate catalog key ${key}`);
  seen.add(key);Object.keys(catalogs).forEach((locale,j)=>{catalogs[locale][key]=values[j];});
}
const result=validateCatalogs(catalogs);
await mkdir(new URL('./locales/',import.meta.url),{recursive:true});
for(const [locale,dict] of Object.entries(catalogs))await writeFile(new URL(`./locales/${locale}.json`,import.meta.url),JSON.stringify(dict,null,2)+'\n','utf8');
console.log(`Built ${result.locales} fixed catalogs x ${result.keys} keys, offline.`);
