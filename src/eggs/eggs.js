// Easter eggs (approved EasterEggsDusk), found by trying things:
// - the toad dances bachata: tap the toad 5 times while music plays;
// - Nejma night: write "nejma" in the chat and stars fall over the screen (her name means star);
// - Regenbogen: shake the phone on Home (or write "regenbogen") and a rainbow crosses the garden (his word);
// - green hour: at 11:11 the whole app turns her green for one minute;
// - same moon: open the app after midnight and the moon says goodnight to both of you (once a night);
// - letters that open on a date live in Talk (chat.js).
// Pure helpers are tested in scripts/eggs.test.mjs.
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const KEY_MOON='eggs.moon',KEY_PROVERB='eggs.proverb',PROVERBS=6,NAV_STEPS=['garden','talk','play','learn','us'];
// Friday's proverb: the same for both of you that Friday.
export const proverbFor=(d=new Date())=>d.getDay()!==5?null:1+Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000/7)%PROVERBS;
// The secret dance step: Home, Talk, Play, Learn, Us, quickly, in that order.
export function navSequence(within=3500){let taps=[];return (page,now)=>{taps=[...taps.filter(x=>now-x.at<within),{page,at:now}].slice(-NAV_STEPS.length);
  if(taps.length===NAV_STEPS.length&&taps.every((x,i)=>x.page===NAV_STEPS[i])){taps=[];return true;}return false;};}

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
  // ---- Friday: a Tunisian proverb, once that day
  function proverb(){
    const n=proverbFor();if(!n||!me())return;const key=new Date().toDateString();let seen=null;try{seen=localStorage.getItem(KEY_PROVERB);}catch{}if(seen===key)return;try{localStorage.setItem(KEY_PROVERB,key);}catch{}
    const box=el('div',undefined,'egg-layer egg-proverb');box.setAttribute('role','status');const card=el('div',undefined,'egg-proverb-card');
    const words=el('p',undefined,'egg-proverb-words');words.textContent=t('eggs.proverb.'+n+'.text');words.lang='ar-TN';words.dir='rtl';
    card.append(el('p',()=>t('eggs.proverbTitle'),'egg-proverb-title'),words,el('p',()=>t('eggs.proverb.'+n+'.meaning'),'egg-proverb-meaning'),el('p',()=>t('eggs.tapToClose'),'egg-proverb-close'));
    box.append(card);card.onclick=()=>box.remove();document.body.append(box);setTimeout(()=>box.remove(),14000);
  }
  // ---- the secret dance step on the bottom bar
  const navTaps=navSequence();
  document.addEventListener('click',e=>{const b=e.target.closest?.('.bottom-nav [data-page]');if(!b)return;
    if(navTaps(b.dataset.page,Date.now())){const nav=b.closest('.bottom-nav');nav.classList.remove('nav-dance');void nav.offsetWidth;nav.classList.add('nav-dance');setTimeout(()=>nav.classList.remove('nav-dance'),4200);notify(()=>t('eggs.navDance'));}},true);
  function start(){startMotion();setTimeout(proverb,2500);clearInterval(greenTimer);checkGreen();greenTimer=setInterval(checkGreen,15000);setTimeout(moon,1500);}
  function stop(){clearInterval(greenTimer);greenTimer=null;document.documentElement.classList.remove('green-hour','toad-bachata');}
  return {start,stop,toadTapped,chatWords,stars,rainbow};
}
