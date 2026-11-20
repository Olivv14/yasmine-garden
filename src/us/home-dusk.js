// Home, the diary and "How I am today" in the approved designs (PolishHome, PolishDiary, PolishMood).
// Home: one row of round icon buttons (Note, Poem, Photo, Voice, Mood) instead of the plain buttons.
// Mood: a full-screen dusk view with big mood buttons, one line on paper and a "for Yasmine too" switch.
// Diary: the journal composer on a paper page, feelings as icon chips, sharing as a switch.
// The original buttons and fields stay underneath, so every action and save works exactly as before.
import {icon} from '../design/icons.js';
import {chips,shareSwitch} from './dress.js';

export function createHomeDusk({$,el,button,t,copy,partnerName}){
  let done=false,moodView=null,moodHome=null;
  function quickRow(){
    const tools=document.querySelector('#page-garden .garden-tools');if(!tools||document.querySelector('.home-quick'))return;
    const row=el('div',undefined,'home-quick');
    for(const [id,key,ic,tone] of [['gardenNote','quick.note','pen','gold'],['gardenPoem','quick.poem','sparkles','rose'],['gardenPhoto','quick.photo','camera','mint'],['gardenVoice','quick.voice','mic','blue'],['gardenMood','home.moodShort','sun','amber']]){
      const b=button(()=>'',()=>$(id).click(),'home-quick-btn');b.dataset.tone=tone;b.append(icon(ic,22),el('span',()=>t(key)));row.append(b);}
    tools.after(row);
  }
  function openMood(){
    const panel=$('moodPanel');if(!panel||moodView)return;
    moodHome=document.createComment('mood');panel.replaceWith(moodHome);
    moodView=el('div',undefined,'mood-view');moodView.setAttribute('role','dialog');moodView.setAttribute('aria-modal','true');copy(moodView,()=>t('mood.title'),'aria-label');
    const top=el('div',undefined,'mood-top');const back=button(()=>'',()=>closeMood(),'mood-back');back.append(icon('back',18));copy(back,()=>t('common.close'),'aria-label');
    top.append(back,el('b',()=>t('mood.title')),el('span'));
    const glow=el('div',undefined,'mood-glow');glow.setAttribute('aria-hidden','true');const g=el('span',undefined,'mood-glow-disc');const name=el('p',undefined,'mood-glow-name');glow.append(g,name);
    const paint=()=>{const sel=$('moodValue');const v=sel?.value??'none';glow.dataset.mood=v;name.textContent=sel?.selectedOptions?.[0]?.textContent??'';};
    moodView.append(top,glow,panel);document.body.append(moodView);document.documentElement.classList.add('mood-open');
    $('moodValue')?.addEventListener('change',paint);paint();
  }
  function closeMood(){if(!moodView)return;const panel=$('moodPanel');if(panel&&moodHome?.parentNode)moodHome.replaceWith(panel);moodView.remove();moodView=null;document.documentElement.classList.remove('mood-open');}
  // the Mood button opens the mood view instead of scrolling to the old form
  document.addEventListener('click',e=>{if(e.target.closest?.('#gardenMood')){e.preventDefault();e.stopPropagation();openMood();}},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&moodView)closeMood();});
  function dress(){
    chips($('moodValue'),{t,big:true,cls:'dress-chips mood-chips'});
    shareSwitch($('moodVisibility'),{t,copy,partnerName});
    chips($('journal-mood'),{t});
    shareSwitch($('journal-visibility'),{t,copy,partnerName});
    shareSwitch($('question-visibility'),{t,copy,partnerName});
    $('journalComposer')?.closest('.note')?.classList.add('diary-page');
    $('moodNote')?.classList.add('paper-line');
  }
  return {render(){quickRow();dress();if(!done){done=true;}},clear(){closeMood();}};
}
