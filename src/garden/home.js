// Garden home: greeting, partner line, the panorama, the Today card, flower/plant sheets and the terminal.
// Data calls stay in app.js (same RPCs as before); this module only renders and asks.
import {createGarden} from './panorama.js';
import {flowerArt} from './flowers.js';
import {s} from './svg.js';
import {FLOWER_TYPES,STAGES,stageFor,placeFlowers,authorTone,isDrooping,lanterns,visitors,summary,hockeyWins} from './model.js';
import {webglAvailable,createGarden3D} from '../garden3d/garden3d.js';
import {CULTURE,cultureById} from '../garden3d/culture.js';
import {addDiscovery} from '../garden3d/discoveries.js';
import {openSheet} from '../design/sheet.js';
import {pointsBy,weekStart} from '../games/score.js';
import {icon} from '../design/icons.js';
import {currentGardenTheme,onGardenTheme,setHarissa,harissaOn} from '../design/theme.js';

const specimen=(type,stage,size=96)=>s('svg',{viewBox:'-40 -84 80 92',width:size,height:size,cls:'specimen','aria-hidden':'true',focusable:'false'},[flowerArt(type,stage)]);

export function createGardenHome({$,el,button,t,copy,locale,getSnapshot,me,person,navigate,plant,water,remove,notify,onToad,onDiscover,canStart3D=()=>true,seeds=()=>null}){
  let flowerSheet=null,flowerSheetId=null,lastBloomCount=0;
  const garden=createGarden({onFlower:id=>openFlower(id),onSoil:()=>openPlant(),onMoon:()=>openTerminal()});
  $('gardenMount').append(garden.element);
  // The 3D garden replaces the flat one when this phone can draw it; the flat one comes back if it fails.
  let g3=null;
  if(webglAvailable()){
    garden.element.hidden=true;$('gardenMount').classList.add('is-3d');
    g3=createGarden3D({t,copy,onEvent:e=>skyEvent(e),
      onWater:async id=>{const f=(getSnapshot()?.flowers??[]).find(x=>x.id===id&&!x.deleted_at);if(f&&await water(f))notify(()=>t('garden3d.watered',{flower:t('flowers.'+f.flower_type)}));},
      onPlant:async(type,spot)=>{try{const id=await plant(type,spot);if(id)notify(()=>t('garden3d.planted',{flower:t('flowers.'+type)}));}catch(err){notify(()=>err?.gardenKey?t(err.gardenKey):t('common.unknownError'));}},
      seedsLeft:()=>seeds()?.left??0,goldenLeft:()=>seeds()?.golden??0,
      mySide:()=>{const snap=getSnapshot();if(!snap)return 0;return authorTone(me(),snap.members,snap.profiles)==='yasmine'?-1:1;},onFlower:id=>openFlower(id),onMoon:()=>openTerminal(),onSpot:id=>openCulture(id),onToad:()=>onToad?.(),
      onFail:()=>{g3?.destroy();g3=null;garden.element.hidden=false;$('gardenMount').classList.remove('is-3d');render();}});
    $('gardenMount').append(g3.element);
  }
  onGardenTheme(()=>render());

  const rel=ms=>{const diff=(ms-Date.now())/1000,abs=Math.abs(diff),f=new Intl.RelativeTimeFormat(locale(),{numeric:'auto'});
    return abs<3600?f.format(Math.round(diff/60),'minute'):abs<86400?f.format(Math.round(diff/3600),'hour'):f.format(Math.round(diff/86400),'day');};
  const dateText=v=>new Intl.DateTimeFormat(locale(),{dateStyle:'medium'}).format(new Date(v));
  const partner=snap=>snap.members.map(m=>m.profile_id).find(id=>id!==me())??null;
  const tones=snap=>Object.fromEntries(snap.flowers.map(f=>[f.id,authorTone(f.planted_by,snap.members,snap.profiles)]));

  // night events in the 3D sky: a shooting star (at most one note every two minutes) and a full moon
  let lastStarNote=0;
  function skyEvent(e){if(document.hidden)return;if(e.kind==='ownSide'){notify(()=>t('garden3d.ownSide'));return;}if(e.kind==='star'){if(Date.now()-lastStarNote<120000)return;lastStarNote=Date.now();notify(()=>t('garden.shootingStar'));}if(e.kind==='fullMoon')notify(()=>t('garden.fullMoon'));if(e.kind==='egg'&&e.id)notify(()=>t('egg.'+e.id));}
  function greeting(){const h=new Date().getHours(),key=h<5||h>=22?'home.greetNight':h<12?'home.greetMorning':h<18?'home.greetAfternoon':'home.greetEvening';copy($('gardenTitle'),()=>t(key,{name:person(me())}));}
  // What's new from your partner, in one line: their latest planting, shared note or answer.
  function partnerLine(snap){
    const p=partner(snap),node=$('partnerLine');if(!p){copy(node,()=>t('sync.pendingPartner'));return;}
    const events=[...snap.flowers.filter(f=>f.planted_by===p).map(f=>({at:f.created_at,key:'home.partnerPlanted',params:{flower:t('flowers.'+f.flower_type)}})),
      ...snap.content.filter(c=>c.owner_id===p&&c.visibility==='shared').map(c=>({at:c.created_at,key:'home.partnerWrote'})),
      ...snap.answers.filter(a=>a.owner_id===p&&a.submitted_at).map(a=>({at:a.submitted_at,key:'home.partnerAnswered'})),
      ...(snap.gameEvents??[]).filter(e=>e.profile_id===p).map(e=>({at:e.created_at,key:e.game==='hockey'?'home.partnerHockey':'home.partnerPlayed'}))].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
    const last=events[0];
    copy(node,()=>last?t(last.key,{name:person(p),...(last.params??{})})+' · '+rel(Date.parse(last.at)):t('home.partnerQuiet',{name:person(p)}));
    node.dataset.tone=authorTone(p,snap.members,snap.profiles);
  }
  function todayCard(snap){
    const card=$('todayCard');card.replaceChildren();
    const open=snap.rounds.find(r=>!r.revealed_at),q=open?snap.questions.find(x=>x.id===open.question_id):null;
    const head=el('p',()=>t('home.todayEyebrow'),'eyebrow');
    const question=el('h3',()=>q?q.prompt:t('home.noRound'),'title');question.dir='auto';
    const mineAnswered=open&&snap.answers.some(a=>a.round_id===open.id&&a.owner_id===me());
    const answer=button(()=>open?(mineAnswered?t('home.waitingPartner'):t('home.answer')):t('home.startQuestion'),()=>navigate('questions'),mineAnswered?'':'primary');
    const p=partner(snap),note=p&&snap.content.filter(c=>c.owner_id===p&&c.visibility==='shared'&&c.item_type==='journal').sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
    const noteRow=el('div',undefined,'today-note');
    if(note){const who=el('p',()=>t('home.latestNote',{name:person(p)}),'small');who.dataset.tone=authorTone(p,snap.members,snap.profiles);const text=el('p',()=>(note.title||note.body).slice(0,140),'body');noteRow.append(who,text,button(()=>t('home.openNotes'),()=>navigate('journal'),'quiet'));}
    const lit=lanterns(snap.rounds,snap.answers);const row=el('div',undefined,'lantern-row');row.setAttribute('role','img');copy(row,()=>t('home.lanterns',{count:lit.lit}),'aria-label');
    for(let i=0;i<7;i++)row.append(s('svg',{viewBox:'-10 -14 20 24',width:18,height:22,cls:'mini-lantern'+(i<lit.lit?' lit':''),'aria-hidden':'true'},[s('rect',{x:-5,y:-8,width:10,height:12,rx:2,cls:'c-lant-glass'}),s('path',{d:'M-7 -8 L0 -14 L7 -8Z',cls:'c-trunk'})]));
    card.append(head,question,answer,noteRow,row,el('p',()=>lit.pergola?t('home.pergolaLit'):t('home.lanternHint'),'small'));
  }

  function render(){
    const snap=getSnapshot();if(!snap)return;
    // the 3D garden loads once someone is signed in, not behind the sign-in screen
    if(g3&&!g3.started&&canStart3D()){g3.started=true;g3.start();}
    greeting();partnerLine(snap);todayCard(snap);
    const live=snap.flowers.filter(f=>!f.deleted_at),placed=placeFlowers(live),sum=summary(live),theme=currentGardenTheme();
    const finished=(snap.gameEvents??[]);
    let text=t('garden.summary',{count:sum.count,thirsty:sum.thirsty});
    if(sum.plantedToday)text+=' '+t('garden.plantedToday',{name:person(sum.plantedToday.planted_by),flower:t('flowers.'+sum.plantedToday.flower_type)});
    garden.update({flowers:placed,tones:tones(snap),droop:new Set(live.filter(f=>isDrooping(f)).map(f=>f.id)),...(()=>{const l=lanterns(snap.rounds,snap.answers);return {lanternsLit:l.lit,pergola:l.pergola};})(),
      visitors:visitors(finished),mode:theme,summary:text,
      items:placed.map(p=>({id:p.flower.id,label:t('garden.flowerItem',{flower:t('flowers.'+p.flower.flower_type),stage:t('garden.stage.'+STAGES[stageFor(p.flower.water)]),count:p.flower.water,name:person(p.flower.planted_by)})}))});
    if(g3){g3.update({flowers:live,mode:theme});
      // the houses show this week's points, the same numbers as Play
      const wins=Object.fromEntries(pointsBy(snap,weekStart())),houses={};
      for(const m of snap.members){const who=authorTone(m.profile_id,snap.members,snap.profiles);if(!houses[who])houses[who]={name:person(m.profile_id),isMe:m.profile_id===me(),count:wins[m.profile_id]??0};}
      g3.setScores(snap.members.length===2?houses:null);}
    copy($('gardenCount'),()=>t('garden.count',{count:sum.count}));$('gardenEmpty').hidden=!!sum.count;
    if(flowerSheet?.open)paintFlower();
  }

  function openFlower(id){if(flowerSheet?.open)flowerSheet.close();flowerSheetId=id;flowerSheet=openSheet({title:h=>copy(h,()=>{const f=current();return f?t('flowers.'+f.flower_type):'';}),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'flower-sheet',onClose:()=>{flowerSheet=null;flowerSheetId=null;}});paintFlower();}
  const current=()=>getSnapshot()?.flowers.find(f=>f.id===flowerSheetId&&!f.deleted_at);
  function paintFlower(){
    const f=current(),body=flowerSheet.body;body.replaceChildren();if(!f){body.append(el('p',()=>t('garden.gone'),'body'));return;}
    const snap=getSnapshot(),stage=stageFor(f.water),tone=authorTone(f.planted_by,snap.members,snap.profiles);
    const art=el('div',undefined,'flower-sheet-art');art.append(specimen(f.flower_type,stage,128));
    const meta=el('p',()=>t('garden.plantedBy',{name:person(f.planted_by),date:dateText(f.created_at)}),'small');meta.dataset.tone=tone;
    const stageText=el('p',()=>t('garden.stageLine',{stage:t('garden.stage.'+STAGES[stage])}),'body-strong');
    const drops=el('div',undefined,'drops');drops.setAttribute('role','img');copy(drops,()=>t('garden.waterLevel',{count:f.water}),'aria-label');
    for(let i=0;i<9;i++){const d=icon('droplet',20);if(i<f.water)d.classList.add('filled');drops.append(d);}
    const actions=el('div',undefined,'sheet-actions');
    // no water button here: the watering can in the garden does it (drag it onto the flower)
    if(g3&&f.water<9){const w=button(()=>t('garden3d.useCan'),()=>{flowerSheet?.close();g3.openFull();notify(()=>t('garden3d.dragCan'));},'primary');w.prepend(icon('droplet'));actions.append(w);}
    else if(f.water>=9)actions.append(el('p',()=>t('garden.fullWater'),'small'));
    // phones without 3D keep the simple button
    else if(!g3){const w=button(()=>t('garden.water'),async e=>{const b=e.currentTarget;b.disabled=true;try{if(await water(f))garden.watered(f.id);}finally{if(b.isConnected)b.disabled=false;}},'primary');w.prepend(icon('droplet'));actions.append(w);}
    if(f.planted_by===me())actions.append(button(()=>t('garden.remove'),async()=>{if(await remove(f))flowerSheet?.close();},'quiet danger'));
    body.append(art,stageText,meta,drops,el('p',()=>t('garden.growthHint'),'small'),actions);
  }

  function openPlant(){
    let chosen=FLOWER_TYPES[0];
    const sheet=openSheet({title:h=>copy(h,()=>t('garden.plantTitle')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'plant-sheet'});
    const group=el('div',undefined,'flower-picker');group.setAttribute('role','radiogroup');copy(group,()=>t('garden.nextFlower'),'aria-label');
    for(const type of FLOWER_TYPES){const b=button(()=>t('flowers.'+type),()=>{chosen=type;for(const x of group.children)x.setAttribute('aria-checked',String(x.dataset.type===type));},'flower-option');b.setAttribute('role','radio');b.dataset.type=type;b.setAttribute('aria-checked',String(type===chosen));b.prepend(specimen(type,3,64));group.append(b);}
    const status=el('p',undefined,'small');status.setAttribute('role','status');
    const go=button(()=>t('garden.plant'),async e=>{const b=e.currentTarget;b.disabled=true;try{const id=await plant(chosen);if(id){sheet.close();setTimeout(()=>garden.planted(id),350);}}catch(err){copy(status,()=>err?.gardenKey?t(err.gardenKey):String(err?.message??err));}finally{if(b.isConnected)b.disabled=false;}},'primary');
    go.prepend(icon('shovel'));
    // Planting uses a seed; seeds come from playing together (Play shows how).
    const have=seeds(),count=el('p',undefined,'plant-seeds');count.append(icon('sprout',18),el('span',()=>t('garden.seeds',{count:have?.left??0})));
    sheet.body.append(group,el('p',()=>t('garden.limit'),'small'));
    if(have&&have.left<=0){go.disabled=true;sheet.body.append(count,el('p',()=>t('garden.noSeeds'),'small'),button(()=>t('garden.goPlay'),()=>{sheet.close();navigate('play');},'quiet'),status,go);}
    else sheet.body.append(...(have?[count]:[]),status,go);
  }

  // Something from Tunisia or Venezuela, found in the 3D garden: a small card with a word to learn.
  function openCulture(id){
    const c=cultureById(id);if(!c)return;
    const {seen,fresh}=addDiscovery(id);onDiscover?.(seen);
    const sheet=openSheet({title:h=>copy(h,()=>t(`culture.${id}.title`)),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'culture-sheet'});
    const chip=el('p',()=>t('culture.from.'+c.from),'culture-chip');chip.dataset.from=c.from;
    const word=el('p',undefined,'culture-word');word.textContent=c.word;if(c.lang)word.lang=c.lang;word.dir='ltr';
    const label=el('p',()=>t('culture.wordLabel'),'culture-label');
    const meaning=el('p',()=>t(`culture.${id}.meaning`),'culture-meaning');
    const text=el('p',()=>t(`culture.${id}.text`),'culture-text clamp');
    const more=button(()=>text.classList.contains('clamp')?t('culture.more'):t('culture.less'),()=>{text.classList.toggle('clamp');copy(more,()=>text.classList.contains('clamp')?t('culture.more'):t('culture.less'));},'link');
    const count=el('p',()=>t('culture.found',{count:seen.size,total:CULTURE.length})+(fresh?' · '+t('culture.new'):''),'culture-count');
    sheet.body.append(chip,label,word,meaning,text,more,count);
  }

  // Hidden terminal (long-press the moon or sun). Local commands only.
  function openTerminal(){
    const sheet=openSheet({title:h=>copy(h,()=>t('terminal.title')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),size:'full',className:'terminal'});
    const log=el('div',undefined,'terminal-log');log.setAttribute('role','log');log.setAttribute('aria-live','polite');
    const form=document.createElement('form');form.className='terminal-form';const label=el('label','> ');const input=document.createElement('input');input.id='terminalInput';input.autocomplete='off';input.spellcheck=false;input.setAttribute('autocapitalize','off');label.htmlFor=input.id;copy(input,()=>t('terminal.inputLabel'),'aria-label');form.append(label,input);
    const history=[];let cursor=0;
    const say=(text,cls='')=>{const p=document.createElement('p');p.className=cls;p.textContent=text;log.append(p);log.scrollTop=log.scrollHeight;};
    say(t('terminal.welcome'));
    form.onsubmit=e=>{e.preventDefault();const cmd=input.value.trim().toLowerCase();if(!cmd)return;history.push(cmd);cursor=history.length;input.value='';say('> '+cmd,'cmd');
      if(cmd==='help')say(t('terminal.help'));else if(cmd==='harissa on'){setHarissa(true);say(t('terminal.harissaOn'));}else if(cmd==='harissa off'){setHarissa(false);say(t('terminal.harissaOff'));}
      else if(cmd==='bloom'){sheet.close();setTimeout(()=>garden.bloomAll(),300);}else if(cmd==='clear')log.replaceChildren();else if(cmd==='exit')sheet.close();else say(t('terminal.unknown'));};
    input.onkeydown=e=>{if(e.key==='ArrowUp'&&history.length){e.preventDefault();cursor=Math.max(0,cursor-1);input.value=history[cursor];}else if(e.key==='ArrowDown'){e.preventDefault();cursor=Math.min(history.length,cursor+1);input.value=history[cursor]??'';}};
    sheet.body.append(log,form);setTimeout(()=>input.focus(),50);
    if(harissaOn())say(t('terminal.harissaOn'));
  }

  // The 10th heart tap: every visible flower blooms for a moment.
  window.addEventListener('garden:bloom',()=>{lastBloomCount++;garden.bloomAll();});
  // Sign-out: nothing private may stay on screen (flowers, names, notes, the open sheet).
  function clear(){flowerSheet?.close();for(const d of document.querySelectorAll('dialog.sheet[open]'))d.close();for(const d of document.querySelectorAll('dialog.sheet'))d.remove();
    garden.update({flowers:[],summary:'',items:[],mode:currentGardenTheme()});g3?.update({flowers:[]});g3?.setScores(null);g3?.setSong(null);$('todayCard').replaceChildren();copy($('partnerLine'),'');copy($('gardenTitle'),()=>t('garden.title'));}
  return {render,clear,openPlant,openFlower,openTerminal,openCulture,garden,get garden3d(){return g3;}};
}

// Small painted night scene for the Today page (replaces the old character art).
export function todayScene(){
  return s('svg',{viewBox:'0 0 240 150',cls:'today-scene garden','aria-hidden':'true',focusable:'false'},[
    s('circle',{cx:170,cy:46,r:22,cls:'c-jas moon-disc'}),s('circle',{cx:170,cy:46,r:28,cls:'c-lant sun-disc'}),
    ...[[30,20],[70,40],[110,16],[210,90],[20,80],[140,90]].map(([x,y],i)=>s('circle',{cx:x,cy:y,r:1.4,cls:'c-jas twinkle t'+(i%4)})),
    s('path',{d:'M0 120 C60 108 120 126 240 112 L240 150 L0 150Z',cls:'c-leaf-d'}),
    ...[60,120,180].map(x=>s('g',{cls:'lantern lit'},[s('rect',{x:x-1.5,y:108,width:3,height:22,cls:'c-trunk'}),s('rect',{x:x-6,y:96,width:12,height:13,rx:3,cls:'c-lant-glass'}),s('path',{d:`M${x-8} 96 L${x} 89 L${x+8} 96Z`,cls:'c-trunk'})])),
  ]);
}
