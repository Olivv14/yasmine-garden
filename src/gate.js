// The way in. A black screen with one beating phrase; tap it and type your secret word (nothing else:
// no username, no email); your own log lines run while the garden loads; then the app.
// It also locks the app each time it is opened. Every word shown comes from the catalog.
import {t,copy,locale,setExperience,LANGUAGE_CHOICES} from './experience.js';

const KEY='gate.lang',LOG_LINES=5,LINE_MS=480;
const supported=v=>LANGUAGE_CHOICES.some(c=>c.value===v);
// The phrase speaks the language this phone last used here, else the phone's own language.
export function gateLanguage(stored,preferred=[]){
  if(stored&&supported(stored))return stored;
  for(const l of preferred){const s=String(l).toLowerCase();if(s.startsWith('ar'))return 'aeb-TN';const b=s.slice(0,2);if(supported(b))return b;}
  return 'en';
}
const read=()=>{try{return localStorage.getItem(KEY);}catch{return null;}};
const write=v=>{try{localStorage.setItem(KEY,v);}catch{}};

export function createGate({$,signInWithWord,reducedMotion=()=>false,onHidden}){
  const gate=$('gate'),phrase=$('gatePhrase'),form=$('gateForm'),word=$('gateWord'),log=$('gateLog'),status=$('gateStatus');
  const shell=document.querySelector('.shell');
  let appReady=false,logsDone=false,busy=false,timers=[];
  const clearTimers=()=>{for(const id of timers)clearTimeout(id);timers=[];};
  function step(name){for(const [n,el] of [['phrase',phrase.parentElement],['word',form],['log',log]])el.hidden=n!==name;gate.dataset.step=name;}

  const speak=()=>{try{setExperience({language:gateLanguage(read(),navigator.languages??[navigator.language])});}catch{}};
  function show(){
    clearTimers();appReady=false;logsDone=false;busy=false;
    speak();
    gate.hidden=false;gate.classList.remove('leaving');if(shell)shell.inert=true;
    word.value='';copy(status,'');status.classList.remove('visible');log.replaceChildren();step('phrase');
  }
  function hide(){clearTimers();gate.hidden=true;gate.classList.remove('leaving');if(shell)shell.inert=false;onHidden?.();}
  phrase.onclick=()=>{step('word');word.focus();};
  form.onsubmit=async e=>{
    e.preventDefault();const value=word.value;if(!value||busy)return;
    busy=true;copy(status,'');
    try{const who=await signInWithWord(value);word.value='';runLog(who);}
    catch(err){word.value='';form.classList.remove('wrong');void form.offsetWidth;form.classList.add('wrong');
      status.classList.toggle('visible',!!err?.gateKey);copy(status,()=>err?.gateKey?t(err.gateKey):t('gate.wrong'));word.focus();}
    finally{busy=false;}
  };
  // Five lines of your own while the garden loads behind the black screen.
  function runLog(who){
    step('log');log.dataset.who=who;log.replaceChildren();logsDone=false;
    const quick=reducedMotion();
    for(let i=1;i<=LOG_LINES;i++)timers.push(setTimeout(()=>{const li=document.createElement('li');copy(li,()=>t(`gate.log.${who}.${i}`));log.append(li);
      if(i===LOG_LINES){logsDone=true;finish();}},quick?0:i*LINE_MS));
  }
  function finish(){
    if(!appReady||!logsDone||gate.hidden)return;
    timers.push(setTimeout(()=>{gate.classList.add('leaving');timers.push(setTimeout(hide,reducedMotion()?0:620));},reducedMotion()?0:420));
  }
  return {show,hide,
    open:()=>!gate.hidden,
    // signing out resets the app to English; the open gate keeps speaking this phone's language
    language:speak,
    // the app calls this when the private space is loaded; the gate leaves once the log has run
    ready(){appReady=true;finish();},
    // signed in but the app could not load: back to the field, with the reason
    failed(message){clearTimers();appReady=false;logsDone=false;step('word');form.classList.add('wrong');status.classList.add('visible');copy(status,message);word.focus();},
    // remember the language in use while signed in, for the next time the phrase shows
    remember(){if(gate.hidden&&supported(locale()))write(locale());},
  };
}
