// The bell's page, "Under the arch" (mockup NArch5, option 1): a Sidi Bou Said doorway with jasmine, tabs by kind
// (All, Love, Play, Garden, Learn) with their counts, then New, Earlier today, Yesterday and This week. Every card
// has its one-tap action; what is finished shows as a small ticked line. Everything comes from the snapshot:
// thoughts (thought_events), the bell rows (notifications, backend/006) and thirsty flowers in the garden.
import {icon} from '../design/icons.js';
import {waitingForMe} from '../games/score.js';
import {isDrooping} from '../garden/model.js';

const NS='http://www.w3.org/2000/svg';
const TABS=['all','love','play','garden','learn'];
const TAB_OF={thought:'love',message:'love',dedication:'love',song_added:'love',game_invite:'play',game_turn:'play',game_result:'play',teach_card:'learn',thirsty:'garden'};
const DAY=86400000;
function svg(viewBox,body,cls){const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox',viewBox);s.setAttribute('aria-hidden','true');if(cls)s.setAttribute('class',cls);s.innerHTML=body;return s;}
const JASMINE='<g fill="#FFFFFF"><ellipse cx="30" cy="14" rx="7" ry="12"/><ellipse cx="30" cy="14" rx="7" ry="12" transform="rotate(72 30 30)"/><ellipse cx="30" cy="14" rx="7" ry="12" transform="rotate(144 30 30)"/><ellipse cx="30" cy="14" rx="7" ry="12" transform="rotate(216 30 30)"/><ellipse cx="30" cy="14" rx="7" ry="12" transform="rotate(288 30 30)"/></g><circle cx="30" cy="30" r="5" fill="#F2D27A"/>';
const BUD='<path d="M30 56V26" stroke="#3F8A5E" stroke-width="5"/><ellipse cx="30" cy="20" rx="9" ry="13" fill="#E8F5EC"/>';
const ARCH='<path d="M22 900V200a173 173 0 0 1 346 0v700" fill="none" stroke="#F3EEE6" stroke-width="12" opacity=".85"/><path d="M22 900V200a173 173 0 0 1 346 0v700" fill="none" stroke="#1F5FA8" stroke-width="4"/>'+
  '<path d="M14 900C4 740 24 620 12 500S4 330 14 220" fill="none" stroke="#5FA77A" stroke-width="3"/><path d="M378 900C388 740 368 640 378 540S388 380 376 260" fill="none" stroke="#5FA77A" stroke-width="3"/>'+
  '<g fill="#3F8A5E"><path d="M12 640c16-8 24 2 24 2s-10 12-24-2z"/><path d="M14 330c-12-10-4-22-4-22s14 8 4 22z"/><path d="M378 460c-16-6-22 6-22 6s12 10 22-6z"/></g>';

export function createInbox({el,button,t,copy,locale,getSnapshot,me,person,markRead,markThought,actions}){
  let root=null,tab='all',busy=false;
  const partner=()=>getSnapshot()?.members?.find(m=>m.profile_id!==me())?.profile_id??null;
  const time=iso=>{const d=new Date(iso),loc=locale()==='aeb-TN'?'ar-TN':locale();try{return Date.now()-d<3600000?new Intl.RelativeTimeFormat(loc,{numeric:'auto',style:'short'}).format(-Math.max(0,Math.round((Date.now()-d)/60000)),'minute'):new Intl.DateTimeFormat(loc,{hour:'2-digit',minute:'2-digit'}).format(d);}catch{return '';}};
  const dayOf=iso=>{const d=new Date(iso);d.setHours(0,0,0,0);return d.getTime();};

  // Everything for me, newest first, as {kind, at, unread, open (still asks for something), title, sub, hand, action}
  function items(){
    const snap=getSnapshot(),id=me();if(!snap||!id)return [];
    const out=[],songs=snap.playlistItems??[],waiting=new Set(waitingForMe(snap,id).map(r=>r.id));
    for(const e of snap.thoughts??[]){if(e.recipient_id!==id||!/^affection\.phrase(?:0[1-9]|10)$/.test(e.phrase_key))continue;
      out.push({key:'t'+e.id,kind:'thought',at:e.created_at,unread:!e.read_at,open:!e.read_at,hand:true,
        title:()=>t('arch.thought',{name:person(e.sender_id)}),sub:()=>t(e.phrase_key,{sender:person(e.sender_id)}),
        action:{label:()=>t('arch.sendBack'),cls:'blue',run:()=>actions.sendThought()},read:()=>e.read_at?null:markThought(e)});}
    for(const n of snap.notifications??[]){if(n.recipient_id!==id||!TAB_OF[n.kind])continue;
      const base={key:'n'+n.id,kind:n.kind,at:n.created_at,unread:!n.read_at,open:!n.read_at,read:()=>n.read_at?null:markRead([n.id])};
      if(n.kind==='dedication'||n.kind==='song_added'){const item=songs.find(i=>i.id===n.ref_id);
        out.push({...base,title:()=>t(n.kind==='dedication'?'arch.dedication':'arch.songAdded',{name:person(n.sender_id)}),sub:()=>(item?.title??'♪')+(item?.note?' · “'+item.note+'”':''),
          action:{label:()=>t('arch.play'),cls:'blue',run:()=>actions.playSong(item)}});}
      else if(n.kind==='message')out.push({...base,title:()=>t('arch.message',{name:person(n.sender_id)}),sub:()=>t('arch.messageSub'),action:{label:()=>t('arch.reply'),cls:'blue',run:()=>actions.openTalk()}});
      else if(n.kind==='game_turn'){const still=waiting.has(n.ref_id);out.push({...base,open:still,title:()=>t('arch.gameTurn',{name:person(n.sender_id)}),sub:()=>still?t('arch.gameTurnSub'):t('arch.played'),action:{label:()=>still?t('arch.play'):t('arch.see'),cls:'gold',run:()=>actions.openRound(n.ref_id)}});}
      else if(n.kind==='game_result')out.push({...base,title:()=>t('arch.gameResult',{name:person(n.sender_id)}),sub:()=>t('arch.gameResultSub'),action:{label:()=>t('arch.see'),cls:'gold',run:()=>actions.openRound(n.ref_id)}});
      else if(n.kind==='game_invite')out.push({...base,open:!n.read_at&&Date.now()-Date.parse(n.created_at)<600000,title:()=>t('arch.invite',{name:person(n.sender_id)}),sub:()=>t('arch.inviteSub'),action:{label:()=>t('arch.join'),cls:'gold',run:()=>actions.openGame('hockey')}});
      else if(n.kind==='teach_card')out.push({...base,title:()=>t('arch.teach',{name:person(n.sender_id)}),sub:()=>t('arch.teachSub'),action:{label:()=>t('arch.practise'),cls:'lilac',run:()=>actions.openLearn()}});
    }
    // the garden: flowers that droop (not watered for three days) wait for the can
    for(const f of (snap.flowers??[]).filter(f=>!f.deleted_at&&isDrooping(f)).slice(0,3))
      out.push({key:'f'+f.id,kind:'thirsty',at:new Date(Date.parse(f.updated_at??f.created_at)+3*DAY).toISOString(),unread:false,open:true,
        title:()=>t('arch.thirsty',{flower:t('flowers.'+f.flower_type)}),sub:()=>f.planted_by===id?t('arch.yourSide'):t('arch.herSide',{name:person(f.planted_by)}),
        action:{label:()=>t('arch.water'),cls:'green',run:()=>actions.water()},read:()=>null});
    return out.filter(x=>Date.now()-Date.parse(x.at)<7*DAY||x.open).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  }
  const unreadCount=()=>items().filter(x=>x.unread).length;

  function card(x){
    const c=el('article',undefined,'arch-card'+(x.unread?'':' seen'));c.dataset.kind=x.kind;
    c.append(svg('0 0 60 60',x.unread?JASMINE:BUD,'arch-flower'));
    const words=el('div',undefined,'arch-words');const top=el('div',undefined,'arch-top');
    const title=el('b',x.title,'arch-title');title.dir='auto';const when=el('span',undefined,'arch-time');when.textContent=time(x.at);top.append(title,when);
    const sub=el('p',x.sub,x.hand?'arch-sub hand':'arch-sub');sub.dir='auto';words.append(top,sub);c.append(words);
    if(x.action)c.append(button(x.action.label,()=>act(x),'arch-act '+x.action.cls));
    return c;
  }
  function line(x){const b=button(()=>'',()=>act(x),'arch-done');b.dataset.kind=x.kind;b.append(icon('check',14));const s=el('span',x.title);s.dir='auto';b.append(s);return b;}
  async function act(x){close();try{await x.read?.();}catch{}x.action?.run();}
  function section(label,count,extra){const h=el('div',undefined,'arch-sec');h.append(el('span',label,'arch-sec-name'));
    if(count){const n=el('span',undefined,'arch-count');n.textContent=String(count);h.append(n);}h.append(el('span',undefined,'arch-rule'));if(extra)h.append(extra);return h;}

  function paint(){
    if(!root)return;const all=items(),shown=tab==='all'?all:all.filter(x=>TAB_OF[x.kind]===tab);
    const body=root.querySelector('.arch-body'),tabsBox=root.querySelector('.arch-tabs');
    const newN=all.filter(x=>x.unread).length;copy(root.querySelector('.arch-sub-head'),()=>newN?t('arch.subNew',{count:all.length,fresh:newN}):t('arch.subNone',{count:all.length}));
    tabsBox.replaceChildren();
    for(const k of TABS){const n=k==='all'?all.length:all.filter(x=>TAB_OF[x.kind]===k).length;if(k!=='all'&&!n&&k!==tab)continue;
      const b=button(()=>t('arch.tab.'+k)+' '+n,()=>{tab=k;paint();},'arch-tab');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(k===tab));tabsBox.append(b);}
    body.replaceChildren();
    const today=dayOf(Date.now()),fresh=shown.filter(x=>x.unread);
    if(fresh.length){const mark=button(()=>t('arch.markAll'),()=>markAll(),'arch-mark');body.append(section(()=>t('arch.new'),fresh.length,mark));for(const x of fresh)body.append(card(x));}
    const rest=shown.filter(x=>!x.unread);
    const groups=[['arch.today',x=>dayOf(x.at)===today],['arch.yesterday',x=>dayOf(x.at)===today-DAY],['arch.week',x=>dayOf(x.at)<today-DAY]];
    for(const [key,test] of groups){const g=rest.filter(test);if(!g.length)continue;body.append(section(()=>t(key)));
      for(const x of g)body.append(x.open?card(x):line(x));}
    if(!shown.length){const e=el('div',undefined,'arch-empty');e.append(svg('0 0 60 60',JASMINE,'arch-empty-flower'),el('p',()=>t('arch.empty',{name:person(partner())})));body.append(e);}
  }
  async function markAll(){if(busy)return;busy=true;try{const all=items().filter(x=>x.unread);await Promise.all([markRead([]),...all.filter(x=>x.kind==='thought').map(x=>x.read())].map(p=>Promise.resolve(p).catch(()=>{})));}finally{busy=false;}}

  function open(){
    if(root){paint();return;}
    root=el('div',undefined,'arch-inbox');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');copy(root,()=>t('notifications.title'),'aria-label');
    const bg=svg('0 0 390 900',ARCH,'arch-bg');bg.setAttribute('preserveAspectRatio','xMidYMin slice');
    const x=button(()=>'',()=>close(),'arch-close');x.append(icon('close',18));copy(x,()=>t('common.close'),'aria-label');
    const head=el('header',undefined,'arch-head');head.append(el('h2',()=>t('arch.title'),'arch-h'),el('p',undefined,'arch-sub-head'));
    const tabs=el('div',undefined,'arch-tabs');tabs.setAttribute('role','tablist');copy(tabs,()=>t('arch.show'),'aria-label');
    const body=el('div',undefined,'arch-body');
    const foot=el('footer',undefined,'arch-foot');foot.append(el('span',()=>t('arch.older')),button(()=>t('arch.settings'),()=>{close();actions.openSettings();},'arch-settings'));
    root.append(bg,x,head,tabs,body,foot);document.body.append(root);document.documentElement.classList.add('arch-open');
    root.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
    paint();x.focus({preventScroll:true});
  }
  function close(){root?.remove();root=null;document.documentElement.classList.remove('arch-open');}
  return {open,close,render:paint,isOpen:()=>!!root,unreadCount};
}
