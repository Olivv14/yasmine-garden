// Easter eggs (approved EasterEggsDusk), found by trying things:
// - the toad dances bachata: tap the toad 5 times while music plays;
// - Nejma night: write "nejma" in the chat and stars fall over the screen (her name means star);
// - Regenbogen: shake the phone on Home (or write "regenbogen") and a rainbow crosses the garden (his word);
// - green hour: at 11:11 the whole app turns her green for one minute;
// - same moon: open the app after midnight and the moon says goodnight to both of you (once a night);
// - letters that open on a date live in Talk (chat.js).
// Pure helpers are tested in scripts/eggs.test.mjs.
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const KEY_MOON='eggs.moon';

export const isGreenHour=(d=new Date())=>d.getMinutes()===11&&(d.getHours()===11||d.getHours()===23);
export const isMoonTime=(d=new Date())=>d.getHours()>=0&&d.getHours()<4;
export const nightKey=(d=new Date())=>{const x=new Date(d);x.setHours(x.getHours()-6);return x.toISOString().slice(0,10);};
export const wordIn=(text,word)=>new RegExp('(^|[^\\p{L}])'+word+'($|[^\\p{L}])','iu').test(String(text??'').normalize('NFC'));
// A shake: enough acceleration changes within a short time.
export function shakeDetector({threshold=18,hits=3,within=900}={}){
  let last=null,times=[];
  return (a,now)=>{if(!a)return false;const v=[a.x??0,a.y??0,a.z??0];
    if(last){const d=Math.abs(v[0]-last[0])+Math.abs(v[1]-last[1])+Math.abs(v[2]-last[2]);if(d>threshold){times=times.filter(t=>now-t<within);times.push(now);}}
    last=v;if(times.length>=hits){times=[];return true;}return false;};
}

export function createEggs({el,t,copy,notify,me,person,partner,isMusicPlaying,page}){
  let toadTaps=[],greenTimer=null,lastGreen='';
  const layer=(cls,ms)=>{const n=el('div',undefined,'egg-layer '+cls);n.setAttribute('aria-hidden','true');document.body.append(n);setTimeout(()=>n.remove(),ms);return n;};

  // ---- the toad dances bachata
  function toadTapped(){
    if(!isMusicPlaying())return false;const now=Date.now();toadTaps=toadTaps.filter(x=>now-x<2500);toadTaps.push(now);
    if(toadTaps.length<5)return false;toadTaps=[];
    document.documentElement.classList.add('toad-bachata');setTimeout(()=>document.documentElement.classList.remove('toad-bachata'),8000);
    if(!reduced()){const n=layer('egg-bachata',8000);for(let i=0;i<14;i++){const s=el('i');s.style.setProperty('--x',(Math.random()*100).toFixed(1)+'%');s.style.animationDelay=(i*.35).toFixed(2)+'s';s.textContent=['♪','♫','♬'][i%3];n.append(s);}}
    notify(()=>t('eggs.bachata'));return true;
  }
  // ---- Nejma night: falling stars
  function stars(){
    if(reduced()){notify(()=>t('eggs.nejma'));return;}
    const n=layer('egg-stars',6500);
    for(let i=0;i<46;i++){const s=el('i');s.style.setProperty('--x',(Math.random()*110-5).toFixed(1)+'vw');s.style.setProperty('--d',(1.6+Math.random()*2.2).toFixed(2)+'s');
      s.style.setProperty('--s',(6+Math.random()*12).toFixed(0)+'px');s.style.animationDelay=(Math.random()*3).toFixed(2)+'s';n.append(s);}
    notify(()=>t('eggs.nejma'));
  }
  // ---- Regenbogen: a rainbow across the screen
  function rainbow(){
    const n=layer('egg-rainbow',6000);n.append(el('i'));notify(()=>t('eggs.regenbogen'));
  }
  function chatWords(text){if(wordIn(text,'nejma'))stars();if(wordIn(text,'regenbogen'))rainbow();}
  // shaking the phone on Home (iPhone asks once, on a tap)
  const shaken=shakeDetector();let lastShake=0,motionOn=false;
  function onMotion(e){if(page()!=='garden')return;const now=Date.now();if(shaken(e.accelerationIncludingGravity,now)&&now-lastShake>8000){lastShake=now;rainbow();}}
  function startMotion(){if(motionOn||typeof DeviceMotionEvent==='undefined')return;
    const go=()=>{motionOn=true;addEventListener('devicemotion',onMotion);};
    if(typeof DeviceMotionEvent.requestPermission==='function'){
      const ask=()=>{removeEventListener('pointerup',ask,true);DeviceMotionEvent.requestPermission().then(s=>{if(s==='granted')go();}).catch(()=>{});};
      addEventListener('pointerup',ask,true);}
    else go();}
  // ---- green hour, 11:11
  function checkGreen(){
    const d=new Date(),on=isGreenHour(d),key=d.toDateString()+d.getHours();
    document.documentElement.classList.toggle('green-hour',on);
    if(on&&lastGreen!==key){lastGreen=key;notify(()=>t('eggs.greenHour'));}
  }
  // ---- same moon after midnight, once a night
  function moon(){
    const d=new Date();if(!isMoonTime(d)||!me())return;let seen=null;try{seen=localStorage.getItem(KEY_MOON);}catch{}
    const key=nightKey(d);if(seen===key)return;try{localStorage.setItem(KEY_MOON,key);}catch{}
    const n=layer('egg-moon',7000);const card=el('div',undefined,'egg-moon-card');
    card.append(el('span',undefined,'egg-moon-disc'),el('p',()=>t('eggs.moon',{a:person(me()),b:person(partner())})));n.append(card);n.onclick=()=>n.remove();n.removeAttribute('aria-hidden');n.setAttribute('role','status');
  }
  function start(){startMotion();clearInterval(greenTimer);checkGreen();greenTimer=setInterval(checkGreen,15000);setTimeout(moon,1500);}
  function stop(){clearInterval(greenTimer);greenTimer=null;document.documentElement.classList.remove('green-hour','toad-bachata');}
  return {start,stop,toadTapped,chatWords,stars,rainbow};
}
