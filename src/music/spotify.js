// Spotify inside Between us. You sign in to Spotify once on your phone (PKCE: no password or secret ever passes
// through this app). Then a Spotify song plays here through Spotify's Web Playback SDK (Premium). If this phone's
// browser cannot play it (some iPhones stay silent), the song plays on your Spotify app instead, still controlled
// from here. Without sign-in, or on a free account, the song opens in the Spotify app as before.
// The Client ID is public by design (it identifies the app, it is not a secret).
const CLIENT_ID='6b3df8097f77490f885867d3fd5ab7c4';
const SCOPES='streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state';
const KEY='spotify.auth',PKCE='spotify.pkce',API='https://api.spotify.com/v1';
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch{return null;}};
const write=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v));}catch{}};
const redirectUri=()=>new URL('./',document.baseURI).href;
const b64url=buf=>btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const randomText=n=>b64url(crypto.getRandomValues(new Uint8Array(n))).slice(0,n);

// Coming back from Spotify's sign-in page: take the code out of the address straight away (before anything else
// reads the address) and keep it for the exchange.
let pendingCode=null;
// Returns {state,code} when this page is Spotify's return inside the iPhone's separate sign-in browser (it has
// the code but not the verifier): that page hands the code over to the Home Screen app (leaveSpotifyCode).
export function takeSpotifyReturn(){
  try{const u=new URL(location.href),code=u.searchParams.get('code'),state=u.searchParams.get('state'),err=u.searchParams.get('error');
    if(!state||!(code||err)||!/^[A-Za-z0-9_-]{16,64}$/.test(state))return null;
    for(const k of ['code','state','error'])u.searchParams.delete(k);history.replaceState(history.state,'',u.pathname+u.search+u.hash);
    const saved=read(PKCE);
    if(saved&&state===saved.state){pendingCode=code?{code,verifier:saved.verifier}:{error:err};write(PKCE,null);return null;}
    return code?{state,code}:null;}catch{return null;}
}
export async function leaveSpotifyCode({state,code}){
  const r=await fetch(new URL('./public-config.json',document.baseURI),{cache:'no-store'});const c=await r.json();
  const res=await fetch(new URL('/rest/v1/rpc/put_spotify_code',c.supabaseUrl).href,{method:'POST',headers:{'Content-Type':'application/json',apikey:c.publishableKey},body:JSON.stringify({p_state:state,p_code:code})});
  if(!res.ok)throw new Error('handoff '+res.status);
}

export function createSpotify({onChange,rpc}={}){
  let auth=read(KEY),player=null,deviceId=null,sdkState=null,sdkBroken=false,loading=null,mode=null,remote=null,profile=null,lastError=null;
  const changed=()=>{try{onChange?.();}catch{}};

  async function tokenRequest(body){
    const r=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT_ID,...body})});
    const j=await r.json().catch(()=>({}));if(!r.ok||!j.access_token)throw Object.assign(new Error(j.error_description||j.error||'token'),{code:j.error});
    auth={access:j.access_token,refresh:j.refresh_token||auth?.refresh,until:Date.now()+(j.expires_in-60)*1000};write(KEY,auth);return auth;
  }
  async function token(){
    if(!auth)return null;
    if(Date.now()<auth.until)return auth.access;
    try{return (await tokenRequest({grant_type:'refresh_token',refresh_token:auth.refresh})).access;}catch{disconnect();return null;}
  }
  async function finishReturn(){
    if(!pendingCode)return;const p=pendingCode;pendingCode=null;
    if(p.error){lastError=p.error;changed();return;}
    try{await tokenRequest({grant_type:'authorization_code',code:p.code,redirect_uri:redirectUri(),code_verifier:p.verifier});lastError=null;await me();}
    catch(e){lastError=e.code||'token';}changed();
  }
  async function connect(){
    const verifier=randomText(64),state=randomText(16);
    const challenge=b64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
    write(PKCE,{verifier,state,at:Date.now()});
    const u=new URL('https://accounts.spotify.com/authorize');
    for(const [k,v] of Object.entries({client_id:CLIENT_ID,response_type:'code',redirect_uri:redirectUri(),code_challenge_method:'S256',code_challenge:challenge,scope:SCOPES,state}))u.searchParams.set(k,v);
    location.assign(u.href);
  }
  function disconnect(){auth=null;write(KEY,null);profile=null;try{player?.disconnect();}catch{}player=null;deviceId=null;sdkState=null;mode=null;changed();}

  async function call(path,{method='GET',body}={}){
    const tk=await token();if(!tk)throw Object.assign(new Error('signed out'),{code:'signed_out'});
    const r=await fetch(API+path,{method,headers:{Authorization:'Bearer '+tk,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    if(r.status===204)return null;const j=await r.json().catch(()=>null);
    if(!r.ok)throw Object.assign(new Error(j?.error?.message||String(r.status)),{status:r.status,reason:j?.error?.reason});return j;
  }
  async function me(){try{profile=await call('/me');}catch{profile=null;}changed();return profile;}

  // ---- the player inside the app (Spotify's Web Playback SDK, Premium only)
  function loadSdk(){
    if(window.Spotify?.Player)return Promise.resolve();
    loading??=new Promise((res,rej)=>{window.onSpotifyWebPlaybackSDKReady=()=>res();const s=document.createElement('script');s.src='https://sdk.scdn.co/spotify-player.js';s.async=true;s.onerror=()=>rej(new Error('sdk'));document.head.append(s);setTimeout(()=>rej(new Error('sdk timeout')),15000);});
    return loading;
  }
  async function ensurePlayer(){
    if(sdkBroken)return null;if(deviceId&&player)return deviceId;
    try{await loadSdk();}catch{sdkBroken=true;return null;}
    if(!player){
      player=new window.Spotify.Player({name:'Between us',getOAuthToken:cb=>{token().then(tk=>cb(tk||''));},volume:.85});
      player.addListener('ready',({device_id})=>{deviceId=device_id;changed();});
      player.addListener('not_ready',()=>{deviceId=null;changed();});
      player.addListener('player_state_changed',s=>{sdkState=s?{paused:s.paused,position:s.position,duration:s.duration,at:Date.now(),uri:s.track_window?.current_track?.uri}:null;changed();});
      for(const ev of ['initialization_error','account_error','playback_error'])player.addListener(ev,({message})=>{lastError=ev;if(ev!=='playback_error')sdkBroken=true;void message;changed();});
      player.addListener('authentication_error',()=>{lastError='auth';changed();});
      const ok=await player.connect().catch(()=>false);if(!ok){sdkBroken=true;return null;}
    }
    // wait a moment for the device to appear
    for(let i=0;i<30&&!deviceId&&!sdkBroken;i++)await new Promise(r=>setTimeout(r,200));
    return deviceId;
  }

  // Play a Spotify song. Returns 'app' (playing here), 'device' (on your Spotify app), or null (not possible).
  async function play(uri,positionMs=0){
    if(!auth)return null;lastError=null;
    try{player?.activateElement?.();}catch{}
    const id=await ensurePlayer();
    if(id){try{await call('/me/player/play?device_id='+encodeURIComponent(id),{method:'PUT',body:{uris:[uri],position_ms:Math.max(0,Math.round(positionMs))}});mode='app';remote=null;
        // some phones never actually make sound: if nothing starts within 4 s, use the Spotify app instead
        await new Promise(r=>setTimeout(r,4000));if(sdkState&&!sdkState.paused&&sdkState.uri===uri){changed();return 'app';}
        sdkBroken=true;}catch(e){if(e.reason==='PREMIUM_REQUIRED'){lastError='premium';changed();return null;}}}
    try{const d=await call('/me/player/devices');const dev=(d?.devices??[]).find(x=>x.is_active)??(d?.devices??[]).find(x=>x.type==='Smartphone')??d?.devices?.[0];
      if(!dev){lastError='no_device';changed();return null;}
      await call('/me/player/play?device_id='+encodeURIComponent(dev.id),{method:'PUT',body:{uris:[uri],position_ms:Math.max(0,Math.round(positionMs))}});
      mode='device';remote={paused:false,position:positionMs,at:Date.now(),uri,duration:0,device:dev.name};changed();return 'device';}
    catch(e){lastError=e.reason==='PREMIUM_REQUIRED'?'premium':'device';changed();return null;}
  }
  async function pause(){if(mode==='app')await player?.pause().catch(()=>{});else if(mode==='device'){await call('/me/player/pause',{method:'PUT'}).catch(()=>{});if(remote){remote.position=position();remote.paused=true;}}changed();}
  async function resume(){if(mode==='app')await player?.resume().catch(()=>{});else if(mode==='device'){await call('/me/player/play',{method:'PUT'}).catch(()=>{});if(remote){remote.at=Date.now();remote.paused=false;}}changed();}
  async function seek(ms){if(mode==='app')await player?.seek(ms).catch(()=>{});else if(mode==='device'){await call('/me/player/seek?position_ms='+Math.round(ms),{method:'PUT'}).catch(()=>{});if(remote){remote.position=ms;remote.at=Date.now();}}}
  function stop(){if(mode)pause();mode=null;remote=null;}
  const cur=()=>mode==='app'?sdkState:mode==='device'?remote:null;
  function position(){const s=cur();if(!s)return 0;return s.paused?s.position:s.position+(Date.now()-s.at);}
  const playingNow=()=>{const s=cur();return !!s&&!s.paused;};
  const duration=()=>cur()?.duration||0;

  // search (development mode allows up to 10 results)
  async function search(q){if(!q.trim())return [];const j=await call('/search?type=track&limit=10&q='+encodeURIComponent(q));
    return (j?.tracks?.items??[]).map(x=>({uri:x.uri,title:x.name,artist:(x.artists??[]).map(a=>a.name).join(', '),cover:(x.album?.images??[]).slice(-2)[0]?.url??null,duration_ms:x.duration_ms??null}));}

  // The Home Screen app waits for the code left by the sign-in browser (up to 10 minutes after "Connect Spotify").
  let waiting=null;
  async function pickUp(){
    const saved=read(PKCE);if(!saved||auth||!rpc)return;if(Date.now()-(saved.at||0)>600000){write(PKCE,null);return;}
    try{const code=await rpc('take_spotify_code',{p_state:saved.state});
      if(code){write(PKCE,null);pendingCode={code,verifier:saved.verifier};await finishReturn();return;}}catch{}
    clearTimeout(waiting);if(!document.hidden)waiting=setTimeout(pickUp,2500);
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)pickUp();});
  finishReturn().then(()=>{if(auth&&!profile)me();pickUp();});
  return {connected:()=>!!auth,pickUp,connect,disconnect,play,pause,resume,seek,stop,search,position,duration,playing:playingNow,mode:()=>mode,
    deviceName:()=>remote?.device??null,error:()=>lastError,name:()=>profile?.display_name??null,premium:()=>profile?profile.product==='premium':null};
}
