// The top of Us at dusk (approved UsDusk): your two faces, "N days together" (the day you set, shared by both),
// your countries, and three numbers: points, the combo of days you both did something, flowers in the garden.
import {pointsBy} from '../games/score.js';
import {combo} from '../garden/model.js';

export const daysTogether=(since,now=Date.now())=>{
  if(!since)return null;const [y,m,d]=String(since).split('-').map(Number);if(!y)return null;
  const start=new Date(y,m-1,d),today=new Date(now);today.setHours(0,0,0,0);
  return Math.max(0,Math.round((today-start)/86400000));
};

export function createUsHero({$,el,button,t,copy,locale,getSnapshot,me,person,photoOf,rpc,notify}){
  const page=$('page-us');if(!page)return {render(){},clear(){}};
  const root=el('section',undefined,'us-hero-wrap');root.setAttribute('aria-label','');copy(root,()=>t('us.heroLabel'),'aria-label');
  page.querySelector('.section-head')?.after(root);
  const num=n=>new Intl.NumberFormat(locale()==='aeb-TN'?'ar-TN':locale()).format(n);
  const face=(id,cls)=>{const f=el('span',undefined,'us-face '+cls),src=id?photoOf(id):null;
    if(src){const img=document.createElement('img');img.src=src;img.alt='';f.append(img);}else f.textContent=(person(id)||'?').trim().charAt(0).toUpperCase();return f;};

  function render(){
    const snap=getSnapshot();if(!snap||!me()){root.replaceChildren();return;}
    const partner=snap.members?.find(m=>m.profile_id!==me())?.profile_id??null;
    const mine=snap.members?.find(m=>m.profile_id===me()),oliverFirst=(mine?.slot??1)===1;
    const [a,b]=oliverFirst?[me(),partner]:[partner,me()];
    const hero=el('div',undefined,'us-hero');
    const faces=el('div',undefined,'us-faces');faces.append(face(a,'one'),face(b,'two'));
    const cam=button(()=>'',()=>document.getElementById('profileBubble')?.click(),'us-cam');copy(cam,()=>t('us.changePhoto'),'aria-label');faces.append(cam);
    const words=el('div',undefined,'us-hero-words');
    const names=el('p',undefined,'us-names');names.textContent=[a,b].filter(Boolean).map(id=>person(id)).join(' & ');names.dir='auto';
    const days=daysTogether(snap.pairStory?.together_since);
    const since=button(()=>days===null?t('us.setSince'):t('us.daysTogether',{count:num(days)}),()=>editSince(snap),'us-days');
    const chips=el('div',undefined,'us-chips');chips.append(el('span',()=>t('us.venezuela'),'us-chip ve'),el('span',()=>t('us.tunisia'),'us-chip tn'));
    words.append(names,since,chips);hero.append(faces,words);
    const pts=[...pointsBy(snap).values()].reduce((x,y)=>x+y,0),c=combo(snap).days,flowers=(snap.flowers??[]).filter(f=>!f.removed_at&&!f.deleted_at).length;
    const stats=el('div',undefined,'us-stats');
    for(const [n,key,cls] of [[pts,'us.points','gold'],[c,'us.combo','mint'],[flowers,'us.flowers','rose']]){
      const s=el('div',undefined,'us-stat '+cls);const b0=el('b');b0.textContent=num(n);s.append(b0,el('span',()=>t(key)));stats.append(s);}
    root.replaceChildren(hero,stats);
  }
  function editSince(snap){
    const box=el('form',undefined,'us-since');const input=document.createElement('input');input.type='date';input.required=true;input.max=new Date().toISOString().slice(0,10);
    input.value=snap.pairStory?.together_since??'';copy(input,()=>t('us.sinceLabel'),'aria-label');
    const save=button(()=>t('us.saveSince'),null,'primary');save.type='submit';
    box.append(el('label',()=>t('us.sinceLabel')),input,save);
    box.onsubmit=async e=>{e.preventDefault();if(!input.value)return;save.disabled=true;
      try{await rpc('set_together_since',{p_date:input.value});notify(()=>t('us.sinceSaved'));box.remove();}
      catch{notify(()=>t('common.unknownError'));save.disabled=false;}};
    root.querySelector('.us-since')?.remove();root.append(box);input.focus();
  }
  return {render,clear(){root.replaceChildren();}};
}
