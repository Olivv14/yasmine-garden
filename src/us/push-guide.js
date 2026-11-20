// "Get notifications on iPhone": iPhone only sends notifications to the app on the Home Screen. Four steps, always
// here in Us (approved PolishGuide), with what this phone already has done, and one button that runs the existing
// turn-on flow (native-ui.js: prepare, then enable).
import {openSheet} from '../design/sheet.js';
import {icon} from '../design/icons.js';

export function createPushGuide({$,el,button,t,copy}){
  const page=$('page-us');if(!page)return {render(){}};
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const allowed=()=>typeof Notification!=='undefined'&&Notification.permission==='granted';
  const card=button(()=>'',()=>open(),'us-guide');card.append(icon('bell',20),el('span',()=>t('guide.cardTitle'),'us-guide-title'),el('small',()=>allowed()?t('guide.statusOn'):standalone()?t('guide.statusReady'):t('guide.statusSafari')));
  const hero=page.querySelector('.us-hero-wrap');if(hero)hero.after(card);else page.querySelector('#openShop')?.before(card);
  function open(){
    const sheet=openSheet({title:h=>copy(h,()=>t('guide.title')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'guide-sheet'});
    sheet.body.append(el('p',()=>t('guide.intro'),'small'));
    const steps=el('ol',undefined,'guide-steps');
    for(const [n,key,ic] of [[1,'guide.step1','share'],[2,'guide.step2','plus'],[3,'guide.step3','home'],[4,'guide.step4','bell']]){
      const li=el('li',undefined,'guide-step'+((n<=3&&standalone())||(n===4&&allowed())?' done':''));
      const num=el('span',undefined,'guide-num');num.textContent=String(n);
      li.append(num,el('span',()=>t(key),'guide-text'));const art=el('span',undefined,'guide-art');art.append(icon(ic,20));li.append(art);steps.append(li);}
    sheet.body.append(steps);
    const status=el('p',()=>allowed()?t('guide.statusOn'):standalone()?t('guide.statusReady'):t('guide.statusSafari'),'guide-status');
    const go=button(()=>t('guide.turnOn'),async()=>{document.getElementById('nativePrepare')?.click();setTimeout(()=>document.getElementById('nativeEnable')?.click(),600);},'primary');
    go.disabled=!standalone()||allowed();
    sheet.body.append(go,status);
  }
  return {render(){}};
}
