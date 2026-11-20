// Every sound in the app in one place: the music player, voice notes and videos (any <audio>/<video>), the piano
// and dance beats (Web Audio), and words read aloud. The toad's pause stops all of them, so nothing keeps playing
// somewhere you can't reach.
const contexts=new Set(),listeners=new Set();
const changed=()=>{for(const fn of listeners)try{fn();}catch{}};
export function trackContext(ac){if(ac){contexts.add(ac);ac.addEventListener?.('statechange',()=>{if(ac.state==='closed')contexts.delete(ac);changed();});changed();}return ac;}
export const onSound=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
export function soundPlaying(){
  const media=[...document.querySelectorAll('audio,video')].some(m=>!m.paused&&!m.ended&&!m.muted&&!m.srcObject);
  return media||[...contexts].some(c=>c.state==='running');
}
export function stopAllSound(){
  for(const m of document.querySelectorAll('audio,video'))if(!m.paused&&!m.srcObject)m.pause();
  for(const c of contexts)if(c.state==='running')c.suspend().catch(()=>{});
  try{speechSynthesis.cancel();}catch{}
  changed();
}
// any media element starting or stopping anywhere updates whoever shows the state
for(const ev of ['play','pause','ended'])document.addEventListener(ev,changed,true);
