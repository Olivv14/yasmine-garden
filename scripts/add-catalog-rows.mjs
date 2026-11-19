// Appends new rows to experience/catalog.tsv from a file of lines: key|||en|||es|||fr|||it|||aeb-TN
// Every language is required; placeholders must match English. Then run node experience/build-catalogs.mjs.
// Usage: node scripts/add-catalog-rows.mjs rows.txt
import {readFileSync,writeFileSync} from 'node:fs';
import {LOCALES,placeholders} from '../experience/i18n.mjs';
const order=Object.keys(LOCALES),catalog=new URL('../experience/catalog.tsv',import.meta.url);
const lines=readFileSync(catalog,'utf8').trimEnd().split('\n');
if(lines[0]!==['key',...order].join('\t'))throw new Error('Unexpected catalog header');
const have=new Set(lines.slice(1).map(l=>l.split('\t')[0]));
const add=[];
for(const raw of readFileSync(process.argv[2],'utf8').split('\n')){
  if(!raw.trim())continue;
  const cells=raw.split('|||');
  if(cells.length!==order.length+1)throw new Error('Expected '+(order.length+1)+' cells: '+raw.slice(0,80));
  const [key,...values]=cells;
  if(have.has(key))throw new Error('Key exists: '+key);
  if(!/^[a-z][A-Za-z0-9.-]+$/.test(key))throw new Error('Bad key: '+key);
  values.forEach((v,i)=>{if(!v.trim()||/\t/.test(v))throw new Error(`Empty or tabbed ${order[i]}: ${key}`);
    if(JSON.stringify(placeholders(v))!==JSON.stringify(placeholders(values[0])))throw new Error(`Placeholder mismatch ${order[i]}: ${key}`);});
  have.add(key);add.push([key,...values].join('\t'));
}
writeFileSync(catalog,[...lines,...add].join('\n')+'\n');
console.log('added',add.length,'rows');
