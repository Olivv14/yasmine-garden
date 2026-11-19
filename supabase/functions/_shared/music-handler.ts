// Music helper: lyrics for a song, with English (and the reader's own language) under each line.
// Lyrics come from LRCLIB; translations from DeepL with the key kept as a server secret.
// Each song is translated once per language and cached in music_lyric_translations (service role only).
import { fetchLyrics, lyricsKey } from '../../../src/music/lyrics.js';

export const TARGETS = ['en','es','fr','it'] as const;
export type Target = typeof TARGETS[number];
type Line = {t:number;text:string};
export type Cache = {
 get:(signature:string,lang:Target)=>Promise<string[]|null>;
 put:(signature:string,lang:Target,lines:string[])=>Promise<void>;
};
export type Translate = (texts:string[],target:Target)=>Promise<{texts:string[];source:string|null}>;
export type MusicDeps = {
 appUrl:string;
 authenticate:(token:string)=>Promise<boolean>;
 fetch:typeof fetch;
 cache:Cache|null;
 translate:Translate|null;
};
const MAX_LINES=240, MAX_LINE=400;

export function parseRequest(raw:unknown){
 const b=raw as Record<string,unknown>;
 if(!b||typeof b!=='object'||Array.isArray(b)) throw new Error('body');
 if(Object.keys(b).some(k=>!['title','artist','durationMs','targets'].includes(k))) throw new Error('fields');
 const title=typeof b.title==='string'?b.title.trim():'', artist=typeof b.artist==='string'?b.artist.trim():'';
 if(!title||!artist||title.length>200||artist.length>200) throw new Error('song');
 const durationMs=b.durationMs==null?null:Number(b.durationMs);
 if(durationMs!==null&&!(Number.isInteger(durationMs)&&durationMs>0&&durationMs<=7200000)) throw new Error('duration');
 const targets=Array.isArray(b.targets)?[...new Set(b.targets)]:[];
 if(targets.length>2||targets.some(t=>!TARGETS.includes(t as Target))) throw new Error('targets');
 return {title,artist,durationMs,targets:targets as Target[]};
}

// DeepL: batches of 50 lines; the detected source language lets us skip "translating" Spanish into Spanish.
export function deepl(key:string,fetchImpl:typeof fetch):Translate{
 const base=key.endsWith(':fx')?'https://api-free.deepl.com':'https://api.deepl.com';
 const code:Record<Target,string>={en:'EN-US',es:'ES',fr:'FR',it:'IT'};
 return async(texts,target)=>{
  const out:string[]=[];let source:string|null=null;
  for(let i=0;i<texts.length;i+=50){
   const res=await fetchImpl(base+'/v2/translate',{method:'POST',headers:{'Authorization':'DeepL-Auth-Key '+key,'Content-Type':'application/json'},
    body:JSON.stringify({text:texts.slice(i,i+50),target_lang:code[target],preserve_formatting:true}),signal:AbortSignal.timeout(15000)});
   if(!res.ok) throw new Error('deepl '+res.status);
   const data=await res.json() as {translations?:{text:string;detected_source_language?:string}[]};
   for(const tr of data.translations??[]){out.push(String(tr.text??''));source??=tr.detected_source_language?.toLowerCase()??null;}
  }
  if(out.length!==texts.length) throw new Error('deepl shape');
  return {texts:out,source};
 };
}

export function createMusicHandler(deps:MusicDeps){
 const allowedOrigin=new URL(deps.appUrl).origin;
 return async(request:Request):Promise<Response>=>{
  const origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(origin===allowedOrigin?{'Access-Control-Allow-Origin':allowedOrigin}:{})};
  const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&origin!==allowedOrigin) return reply(403,{error:'origin_denied'});
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'}});
  if(request.method!=='POST') return reply(405,{error:'method_not_allowed'});
  const auth=request.headers.get('Authorization');
  if(!auth||!/^Bearer [A-Za-z0-9._~-]+$/.test(auth)||auth.length>8192) return reply(401,{error:'authentication_required'});
  try{ if(!await deps.authenticate(auth.slice(7))) return reply(401,{error:'authentication_required'}); }
  catch{ return reply(401,{error:'authentication_required'}); }
  let song;
  try{
   if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error('type');
   const text=await request.text(); if(text.length>2048) throw new Error('size');
   song=parseRequest(JSON.parse(text));
  }catch{ return reply(400,{error:'invalid_request'}); }
  let lyrics;
  try{ lyrics=await fetchLyrics({title:song.title,artist:song.artist,durationMs:song.durationMs},deps.fetch); }
  catch{ return reply(502,{error:'lyrics_unavailable'}); }
  const lines:Line[]=(lyrics.synced??[]).slice(0,MAX_LINES).map((l:Line)=>({t:l.t,text:l.text.slice(0,MAX_LINE)}));
  const plain=lines.length?null:(lyrics.plain??null);
  const texts:string[]=lines.length?lines.map(l=>l.text):(plain?String(plain).split('\n').slice(0,MAX_LINES).map((x:string)=>x.slice(0,MAX_LINE)):[]);
  const translations:Partial<Record<Target,string[]>>={};
  if(texts.length&&deps.translate){
   const signature=lyricsKey({title:song.title,artist:song.artist,durationMs:song.durationMs});
   const nonEmpty:Array<[string,number]>=texts.map((x,i):[string,number]=>[x,i]).filter(([x])=>x.trim()!=='');
   for(const lang of song.targets){
    try{
     let got:string[]|null=await deps.cache?.get(signature,lang)??null;
     if(!got){
      const r=await deps.translate(nonEmpty.map(([x])=>x),lang);
      // already in that language: no translation, remembered as an empty list
      const out:string[]=r.source===lang?[]:texts.map(()=>'');
      if(r.source!==lang)nonEmpty.forEach(([,i],k)=>{out[i]=r.texts[k]??'';});
      await deps.cache?.put(signature,lang,out).catch(()=>{});
      got=out;
     }
     if(got.length)translations[lang]=got;
    }catch{ /* no translation for this language this time; lyrics still go back */ }
   }
  }
  return reply(200,{lines,plain,instrumental:!!lyrics.instrumental,translations,source:'lrclib'});
 };
}
