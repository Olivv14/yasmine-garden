// Song links: what a pasted link is, its song name, and how it plays without ever showing a video.
// Spotify and YouTube oEmbed are public, keyless and readable from the browser (CORS allowed);
// only metadata is read: a YouTube video is never embedded or played here.
const SPOTIFY_ID=/^[A-Za-z0-9]{22}$/,YOUTUBE_ID=/^[A-Za-z0-9_-]{11}$/;
const COVER=/^https:\/\/(i\.scdn\.co|image-cdn-(fa|ak)\.spotifycdn\.com)\/image\/[A-Za-z0-9]+$/;

export function parseSongLink(input){
  const text=String(input??'').trim();if(!text||text.length>2048)return null;
  const uri=text.match(/^spotify:track:([A-Za-z0-9]{22})$/);if(uri)return spotify(uri[1]);
  let url;try{url=new URL(text);}catch{return null;}
  if(url.protocol!=='https:'||url.username||url.password||/\s/.test(text))return null;
  const host=url.hostname.toLowerCase(),parts=url.pathname.split('/').filter(Boolean);
  if(host==='open.spotify.com'||host==='play.spotify.com'){const i=parts.indexOf('track');if(i>=0&&SPOTIFY_ID.test(parts[i+1]??''))return spotify(parts[i+1]);}
  if(['www.youtube.com','youtube.com','m.youtube.com','music.youtube.com'].includes(host)){const v=url.searchParams.get('v')??(parts[0]==='shorts'?parts[1]:null);if(v&&YOUTUBE_ID.test(v))return {kind:'youtube',id:v,url:'https://www.youtube.com/watch?v='+v};}
  if(host==='youtu.be'&&YOUTUBE_ID.test(parts[0]??''))return {kind:'youtube',id:parts[0],url:'https://www.youtube.com/watch?v='+parts[0]};
  url.hash='';return {kind:'link',url:url.href};
}
const spotify=id=>({kind:'spotify',id,uri:'spotify:track:'+id,url:'https://open.spotify.com/track/'+id});

// "Luis Fonsi - Despacito ft. Daddy Yankee (Official Video)" -> {artist:'Luis Fonsi', title:'Despacito'}
export function splitVideoTitle(title,author=''){
  const clean=s=>s.replace(/\s*[([](?:[^)\]]*?(?:official|video|audio|lyric|lyrics|letra|visualizer|music|hd|4k|remaster)[^)\]]*)[)\]]/gi,'')
    .replace(/\s+(?:ft\.?|feat\.?|featuring)\s+.*$/i,'').replace(/\s*\|.*$/,'').replace(/\s{2,}/g,' ').trim();
  const t=String(title??'').trim(),dash=t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if(dash)return {artist:clean(dash[1]),title:clean(dash[2])};
  const channel=String(author??'').replace(/\s*-\s*Topic$/i,'').replace(/VEVO$/i,'').trim();
  return {artist:channel,title:clean(t)};
}

// Where tapping play goes. A Spotify song opens that song; anything else opens a Spotify search for it,
// so it plays as sound in Spotify (Free or Premium) instead of as a video.
export function spotifyOpenUrl(item){
  const id=item?.ref?.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1];
  if(id)return 'https://open.spotify.com/track/'+id;
  const q=[item?.artist,item?.title].filter(Boolean).join(' ').trim();
  return q?'https://open.spotify.com/search/'+encodeURIComponent(q):null;
}

// Song name (and cover) for a link. Returns {title, artist, cover} with whatever could be read.
export async function lookupLink(link,fetchImpl=globalThis.fetch){
  if(!link||!['spotify','youtube'].includes(link.kind))return {};
  const endpoint=link.kind==='spotify'?'https://open.spotify.com/oembed?url=':'https://www.youtube.com/oembed?format=json&url=';
  const res=await fetchImpl(endpoint+encodeURIComponent(link.url),{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout?.(8000)});
  if(!res.ok)throw new Error('lookup '+res.status);
  const data=await res.json();
  if(link.kind==='spotify')return {title:typeof data.title==='string'?data.title.trim().slice(0,200):'',artist:'',cover:COVER.test(data.thumbnail_url??'')?data.thumbnail_url:null};
  const split=splitVideoTitle(data.title,data.author_name);
  return {title:split.title.slice(0,200),artist:split.artist.slice(0,200),cover:null};
}
export const isCoverUrl=url=>COVER.test(url??'');
