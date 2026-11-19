// Builds experience/decks.json from experience/decks.tsv: the words you learn and duel with.
// Each card: a stable id, its deck (it Italian, ve Venezuelan Spanish, tn Tunisian Derja), a theme, the word
// as written, a Latin spelling for Derja, and its meaning in all five app languages.
// Usage: node experience/build-decks.mjs   (tests check the JSON stays in step with the TSV)
import {readFileSync,writeFileSync} from 'node:fs';
import {LOCALES} from './i18n.mjs';

export const DECKS=Object.freeze(['it','ve','tn']);
export const THEMES=Object.freeze(['love','daily','food','travel','music','football']);
const LANGS=Object.keys(LOCALES);

export function parseDecks(tsv){
  const [head,...rows]=tsv.trimEnd().split('\n');
  const want=['id','deck','theme','word','roman',...LANGS].join('\t');
  if(head!==want)throw new Error('Unexpected deck header');
  const seen=new Set(),cards=[];
  for(const row of rows){
    const cells=row.split('\t');
    if(cells.length!==5+LANGS.length)throw new Error('Wrong cell count: '+row.slice(0,60));
    const [id,deck,theme,word,roman,...meanings]=cells;
    if(!/^[a-z0-9][a-z0-9_.-]{0,39}$/.test(id)||!id.startsWith(deck+'.'))throw new Error('Bad card id: '+id);
    if(seen.has(id))throw new Error('Duplicate card id: '+id);seen.add(id);
    if(!DECKS.includes(deck))throw new Error('Unknown deck: '+id);
    if(!THEMES.includes(theme))throw new Error('Unknown theme: '+id);
    if(!word.trim())throw new Error('Missing word: '+id);
    if(deck==='tn'&&!roman.trim())throw new Error('Derja needs a Latin spelling: '+id);
    const meaning={};
    LANGS.forEach((l,i)=>{if(!meanings[i]?.trim())throw new Error(`Missing ${l} meaning: ${id}`);meaning[l]=meanings[i].trim();});
    cards.push({id,deck,theme,word:word.trim(),...(roman.trim()?{roman:roman.trim()}:{}),meaning});
  }
  return {decks:[...DECKS],cards};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const data=parseDecks(readFileSync(new URL('./decks.tsv',import.meta.url),'utf8'));
  writeFileSync(new URL('./decks.json',import.meta.url),JSON.stringify(data)+'\n','utf8');
  const per=DECKS.map(d=>d+' '+data.cards.filter(c=>c.deck===d).length).join(', ');
  console.log(`Built ${data.cards.length} cards (${per}).`);
}
