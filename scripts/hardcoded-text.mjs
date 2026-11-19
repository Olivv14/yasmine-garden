// Finds words written straight into the app instead of coming from experience/catalog.tsv.
// Every word a person reads must come from the catalog in all five languages.
// People's own words (notes, song titles, names) come from data at runtime, never from source.
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';

const Q=`['"\`]`, WORD=`(?=[^'"\`]*[A-Za-z]{2})`;
const JS_RULES=[
  ['literal text assigned to the screen',new RegExp(`\\.(?:textContent|innerText|placeholder|title|alt|ariaLabel)\\s*=\\s*${Q}${WORD}`)],
  ['literal accessible label or tooltip',new RegExp(`setAttribute\\(\\s*['"](?:aria-label|aria-description|aria-valuetext|title|placeholder|alt)['"]\\s*,\\s*${Q}${WORD}`)],
  ['literal dialog text',new RegExp(`\\b(?:alert|confirm|prompt)\\(\\s*${Q}`)],
  ['literal element text',new RegExp(`\\bel\\(\\s*['"][a-z0-9]+['"]\\s*,\\s*${Q}${WORD}`)],
  ['literal button label',new RegExp(`\\bbutton\\(\\s*${Q}${WORD}`)],
  ['literal markup text',new RegExp(`\\.(?:innerHTML|outerHTML)\\s*=\\s*${Q}[^'"\`]*>[^<'"\`]*[A-Za-z]{2}`)],
  ['literal markup text',/insertAdjacentHTML\(/],
];
export function scanScript(source,file='inline'){
  const hits=[];
  source.split('\n').forEach((line,i)=>{for(const [why,re] of JS_RULES)if(re.test(line))hits.push(`${file}:${i+1}: ${why}`);});
  return hits;
}
// Proper names and notices that read the same in every language.
const TEMPLATE_ALLOWED=new Set(['__CSP__','CC BY 4.0']);
export function scanTemplate(html,file='template.html'){
  const hits=[];
  // Visible text between tags, outside script/style/title, must sit in an element carrying data-i18n.
  const body=html.replace(/<(script|style|title)\b[\s\S]*?<\/\1>/gi,m=>m.replace(/[^\n]/g,' '));
  for(const m of body.matchAll(/<([a-z0-9-]+)((?:\s[^<>]*)?)>([^<]*[A-Za-z][^<]*)</gi)){
    const text=m[3].trim();if(!text||TEMPLATE_ALLOWED.has(text))continue;
    if(/\sdata-i18n="/.test(m[2]))continue;
    hits.push(`${file}:${body.slice(0,m.index).split('\n').length}: visible text without data-i18n: ${text.slice(0,60)}`);
  }
  for(const m of body.matchAll(/<[a-z0-9-]+(\s[^<>]*)>/gi))for(const a of m[1].matchAll(/\s(placeholder|aria-label|title|alt)="([^"]*[A-Za-z][^"]*)"/g)){
    if(new RegExp(`\\sdata-i18n-${a[1]}="`).test(m[1])||TEMPLATE_ALLOWED.has(a[2]))continue;
    hits.push(`${file}:${body.slice(0,m.index).split('\n').length}: ${a[1]} without data-i18n-${a[1]}: ${a[2].slice(0,60)}`);
  }
  return hits;
}
export async function scanApp(root){
  const hits=[];
  const walk=async dir=>{for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);
    if(entry.isDirectory())await walk(p);
    else if(/\.m?js$/.test(entry.name))hits.push(...scanScript(await readFile(p,'utf8'),path.relative(root,p)));
    else if(entry.name.endsWith('.html'))hits.push(...scanTemplate(await readFile(p,'utf8'),path.relative(root,p)));}};
  await walk(path.join(root,'src'));
  return hits;
}
