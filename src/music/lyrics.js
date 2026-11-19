// Song lyrics from LRCLIB (free, no key, browser-readable). Synced lines become timed cards.
// Only the song's title, artist and length are sent; results are kept in memory for this session.
const API='https://lrclib.net/api/';
const cache=new Map();

const norm=s=>String(s??'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export const lyricsKey=({title,artist,durationMs})=>[norm(artist),norm(title),durationMs?Math.round(durationMs/1000):''].join('|');

// "[01:02.35] line" (several stamps per line allowed) -> [{t:62.35,text:'line'}] in time order
export function parseLRC(text){
  const out=[];
  for(const raw of String(text??'').split(/\r?\n/)){
    const stamps=[...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];if(!stamps.length)continue;
    const line=raw.replace(/\[[^\]]*\]/g,'').trim();
    for(const s of stamps){const frac=s[3]?Number('0.'+s[3]):0;out.push({t:Number(s[1])*60+Number(s[2])+frac,text:line});}
  }
  return out.sort((a,b)=>a.t-b.t);
}
// Index of the line being sung at `seconds` (-1 before the first one).
export function lineAt(lines,seconds){
  let lo=0,hi=lines.length-1,found=-1;
  while(lo<=hi){const mid=(lo+hi)>>1;if(lines[mid].t<=seconds){found=mid;lo=mid+1;}else hi=mid-1;}
  return found;
}
// Pick the search result closest in length (within 8 s when the length is known).
export function bestMatch(results,{durationMs}={}){
  const usable=(results??[]).filter(r=>r&&(r.syncedLyrics||r.plainLyrics||r.instrumental));
  if(!durationMs)return usable.find(r=>r.syncedLyrics)??usable[0]??null;
  const s=durationMs/1000,near=usable.filter(r=>typeof r.duration==='number'&&Math.abs(r.duration-s)<=8).sort((a,b)=>Math.abs(a.duration-s)-Math.abs(b.duration-s));
  return near.find(r=>r.syncedLyrics)??near[0]??null;
}
const shape=r=>r?{synced:r.syncedLyrics?parseLRC(r.syncedLyrics):null,plain:r.plainLyrics??null,instrumental:!!r.instrumental}:{synced:null,plain:null,instrumental:false};

export async function fetchLyrics(song,fetchImpl=globalThis.fetch){
  if(!song?.title||!song?.artist)return shape(null);
  const key=lyricsKey(song);if(cache.has(key))return cache.get(key);
  const job=(async()=>{
    const params=new URLSearchParams({track_name:song.title,artist_name:song.artist});
    if(song.durationMs)params.set('duration',String(Math.round(song.durationMs/1000)));
    const opts={credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout?.(10000)};
    const exact=await fetchImpl(API+'get?'+params,opts);
    if(exact.ok)return shape(await exact.json());
    if(exact.status!==404)throw new Error('lyrics '+exact.status);
    const search=await fetchImpl(API+'search?'+new URLSearchParams({track_name:song.title,artist_name:song.artist}),opts);
    if(!search.ok)throw new Error('lyrics '+search.status);
    return shape(bestMatch(await search.json(),song));
  })();
  cache.set(key,job);
  try{return await job;}catch(e){cache.delete(key);throw e;}
}
