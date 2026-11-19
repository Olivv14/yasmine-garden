import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSongLink,splitVideoTitle,spotifyOpenUrl,lookupLink,isCoverUrl} from '../src/music/links.js';
import {parseLRC,lineAt,bestMatch,fetchLyrics,lyricsKey} from '../src/music/lyrics.js';

const fake=routes=>async url=>{for(const [re,res] of routes)if(re.test(url))return typeof res==='function'?res(url):res;throw new Error('unexpected '+url);};
const json=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});

test('song links: Spotify, YouTube and other https links; nothing else',()=>{
  const id='6habFhsOp2NvshLv26DqMb';
  for(const s of ['https://open.spotify.com/track/'+id,'https://open.spotify.com/intl-es/track/'+id+'?si=abc','spotify:track:'+id])assert.deepEqual(parseSongLink(s),{kind:'spotify',id,uri:'spotify:track:'+id,url:'https://open.spotify.com/track/'+id},s);
  for(const s of ['https://www.youtube.com/watch?v=kJQP7kiw5Fk','https://youtu.be/kJQP7kiw5Fk?t=3','https://music.youtube.com/watch?v=kJQP7kiw5Fk&list=x','https://www.youtube.com/shorts/kJQP7kiw5Fk'])assert.equal(parseSongLink(s).kind,'youtube',s);
  assert.equal(parseSongLink('https://example.org/song#x').url,'https://example.org/song');
  for(const bad of ['','http://open.spotify.com/track/'+id,'javascript:alert(1)','https://user:pw@example.org/','spotify:track:short','not a link'])assert.equal(parseSongLink(bad),null,bad);
});
test('video titles become artist and song name without video words',()=>{
  assert.deepEqual(splitVideoTitle('Luis Fonsi - Despacito ft. Daddy Yankee','LuisFonsiVEVO'),{artist:'Luis Fonsi',title:'Despacito'});
  assert.deepEqual(splitVideoTitle('Ed Sheeran - Perfect (Official Music Video)'),{artist:'Ed Sheeran',title:'Perfect'});
  assert.deepEqual(splitVideoTitle('Bésame Mucho [Letra]','Andrea Bocelli - Topic'),{artist:'Andrea Bocelli',title:'Bésame Mucho'});
});
test('play goes to Spotify: the track itself, or a Spotify search for anything else',()=>{
  assert.equal(spotifyOpenUrl({ref:'spotify:track:6habFhsOp2NvshLv26DqMb'}),'https://open.spotify.com/track/6habFhsOp2NvshLv26DqMb');
  assert.equal(spotifyOpenUrl({ref:'https://www.youtube.com/watch?v=kJQP7kiw5Fk',artist:'Luis Fonsi',title:'Despacito'}),'https://open.spotify.com/search/Luis%20Fonsi%20Despacito');
  assert.equal(spotifyOpenUrl({ref:'x'}),null);
});
test('link lookups read only the song name and a Spotify cover',async()=>{
  const sp=await lookupLink(parseSongLink('https://open.spotify.com/track/6habFhsOp2NvshLv26DqMb'),fake([[/open\.spotify\.com\/oembed/,json({title:'Despacito',thumbnail_url:'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02ef0d4234e1a645740f77d59c'})]]));
  assert.deepEqual(sp,{title:'Despacito',artist:'',cover:'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02ef0d4234e1a645740f77d59c'});
  const yt=await lookupLink(parseSongLink('https://youtu.be/kJQP7kiw5Fk'),fake([[/youtube\.com\/oembed/,json({title:'Luis Fonsi - Despacito ft. Daddy Yankee',author_name:'LuisFonsiVEVO',thumbnail_url:'https://i.ytimg.com/x.jpg'})]]));
  assert.deepEqual(yt,{title:'Despacito',artist:'Luis Fonsi',cover:null},'no YouTube image is kept');
  const odd=await lookupLink(parseSongLink('https://open.spotify.com/track/6habFhsOp2NvshLv26DqMb'),fake([[/oembed/,json({title:'X',thumbnail_url:'https://evil.example/i.png'})]]));
  assert.equal(odd.cover,null);
  assert.ok(isCoverUrl('https://i.scdn.co/image/ab67616d0000b273abc')&&!isCoverUrl('https://i.scdn.co/image/../x'));
});
test('LRC lyrics: timed lines in order, the current line by time',()=>{
  const lines=parseLRC('[ti:x]\n[00:06.92] Ay, Fonsi\n[00:10.99][01:10.50] Oh, no\n[00:15.0]Hey\n\nplain text');
  assert.deepEqual(lines.map(l=>[l.t,l.text]),[[6.92,'Ay, Fonsi'],[10.99,'Oh, no'],[15,'Hey'],[70.5,'Oh, no']]);
  assert.deepEqual([0,6.92,8,12,15,100].map(s=>lineAt(lines,s)),[-1,0,0,1,2,3]);
  assert.equal(lineAt([],5),-1);
});
test('lyrics lookup: exact match first, then the closest search result by length',async()=>{
  const song={title:'Despacito',artist:'Luis Fonsi',durationMs:229000};
  const exact=await fetchLyrics(song,fake([[/api\/get/,json({syncedLyrics:'[00:01.00] Uno',plainLyrics:'Uno',instrumental:false})]]));
  assert.deepEqual(exact.synced,[{t:1,text:'Uno'}]);
  const searched=await fetchLyrics({...song,title:'Despacito (Remix)'},fake([[/api\/get/,json({},404)],[/api\/search/,json([{duration:180,syncedLyrics:'[00:01.00] Far'},{duration:231,syncedLyrics:'[00:02.00] Near'},{duration:229,plainLyrics:'Only plain'}])]]));
  assert.deepEqual(searched.synced,[{t:2,text:'Near'}],'prefers synced lyrics within 8 seconds');
  assert.equal(bestMatch([{duration:100,syncedLyrics:'x'}],{durationMs:229000}),null,'nothing that far off');
  const none=await fetchLyrics({title:'Nada',artist:'Nadie'},fake([[/api\/get/,json({},404)],[/api\/search/,json([])]]));
  assert.deepEqual(none,{synced:null,plain:null,instrumental:false});
  assert.equal(lyricsKey({title:'Bésame  Mucho',artist:'BOCELLI'}),'bocelli|besame mucho|');
  await assert.rejects(fetchLyrics({title:'Err',artist:'Or'},fake([[/api\/get/,json({},500)]])));
});
import {partnerPosition,needsSeek,DRIFT_S} from '../src/music/together.js';
test('listen together: where the partner is now, and when to correct drift',()=>{
  const at=1_000_000;
  assert.equal(partnerPosition({item:{id:'x'},playing:true,position:10,at},at+2500),12.5);
  assert.equal(partnerPosition({item:{id:'x'},playing:false,position:10,at},at+60000),10,'paused stays put');
  assert.equal(partnerPosition(null),0);
  assert.equal(DRIFT_S,1.5);assert.ok(!needsSeek(10,11.4));assert.ok(needsSeek(10,11.6));assert.ok(needsSeek(20,18));
});
