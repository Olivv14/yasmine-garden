// Voice and video calls between your two phones (approved PolishTalk). WebRTC, phone to phone; the private chat room
// carries the handshake ("call" events: ring, accept, decline, offer, answer, ice, hangup). Nothing goes through a
// server of ours. A public STUN server helps the phones find each other; on some mobile networks that is not enough
// and a relay (TURN) is needed: when one is configured in public-config (iceServers), it is used.
import {icon} from '../design/icons.js';
import {trackContext,stopAllSound} from '../sound.js';

export function createCalls({el,button,t,copy,me,person,partner,photoOf,signal,onSignal,iceServers=()=>[]}){
  let rv=null,lv=null,st='idle',kind='audio',id=null,pc=null,local=null,remote=null,view=null,ring=null,started=0,timer=null,pending=[],muted=false,camOff=false;
  const servers=()=>[{urls:'stun:stun.l.google.com:19302'},...(iceServers()||[])];
  const send=p=>signal({...p,id,from:me()});

  // ---- the call screen
  function paint(){
    if(!view){view=el('div',undefined,'call');view.setAttribute('role','dialog');view.setAttribute('aria-modal','true');document.body.append(view);document.documentElement.classList.add('call-open');}
    view.replaceChildren();view.dataset.state=st;view.dataset.kind=kind;
    // the two video elements stay the same across repaints, so the picture never blinks or pauses
    rv??=vid('call-remote',false);lv??=vid('call-local',true);
    if(rv.srcObject!==remote){rv.srcObject=remote;}if(lv.srcObject!==local){lv.srcObject=local;}
    const who=partner(),face=el('span',undefined,'call-face'),src=photoOf(who);
    if(src){const i=document.createElement('img');i.src=src;i.alt='';face.append(i);}else face.textContent=(person(who)||'?').charAt(0).toUpperCase();
    const name=el('p',undefined,'call-name');name.textContent=person(who);name.dir='auto';
    const line=el('p',()=>st==='calling'?t('call.calling'):st==='ringing'?t(kind==='video'?'call.incomingVideo':'call.incomingVoice'):st==='live'?clock():t('call.connecting'),'call-line');
    view.append(rv,el('div',undefined,'call-shade'),face,name,line);if(kind==='video'&&local)view.append(lv);
    const bar=el('div',undefined,'call-bar');
    if(st==='ringing'){
      const no=button(()=>'',()=>decline(),'call-btn end');no.append(icon('phoneOff',24));copy(no,()=>t('call.decline'),'aria-label');
      const yes=button(()=>'',()=>accept(),'call-btn yes');yes.append(icon(kind==='video'?'video':'phone',24));copy(yes,()=>t('call.accept'),'aria-label');bar.append(no,yes);
    }else{
      const m=button(()=>'',()=>{muted=!muted;local?.getAudioTracks().forEach(x=>x.enabled=!muted);paint();},'call-btn'+(muted?' off':''));m.append(icon(muted?'micOff':'mic',22));copy(m,()=>t(muted?'call.unmute':'call.mute'),'aria-label');bar.append(m);
      if(kind==='video'){const c=button(()=>'',()=>{camOff=!camOff;local?.getVideoTracks().forEach(x=>x.enabled=!camOff);paint();},'call-btn'+(camOff?' off':''));c.append(icon(camOff?'videoOff':'video',22));copy(c,()=>t(camOff?'call.cameraOn':'call.cameraOff'),'aria-label');bar.append(c);}
      const end=button(()=>'',()=>hangup(true),'call-btn end');end.append(icon('phoneOff',24));copy(end,()=>t('call.end'),'aria-label');bar.append(end);
    }
    view.append(bar);
    for(const v of [rv,lv])if(v.srcObject&&v.paused)v.play().catch(()=>{});
  }
  function vid(cls,muted){const v=document.createElement('video');v.className=cls;v.autoplay=true;v.muted=muted;v.playsInline=true;v.setAttribute('playsinline','');
    // phones (and some browsers) pause a video when it is moved: start it again as soon as it can play
    for(const ev of ['loadedmetadata','canplay','pause'])v.addEventListener(ev,()=>{if(v.srcObject&&v.paused&&view)v.play().catch(()=>{});});return v;}
  const clock=()=>{const s=Math.floor((Date.now()-started)/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
  // a soft two-note ring while waiting (stops with everything else)
  function startRing(){stopRing();try{const ac=trackContext(new (window.AudioContext||window.webkitAudioContext)());const tick=()=>{const tt=ac.currentTime;for(const [f,d] of [[659,0],[880,.18]]){const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=f;g.gain.setValueAtTime(.0001,tt+d);g.gain.exponentialRampToValueAtTime(.18,tt+d+.02);g.gain.exponentialRampToValueAtTime(.0001,tt+d+.16);o.connect(g).connect(ac.destination);o.start(tt+d);o.stop(tt+d+.2);}};tick();ring={ac,timer:setInterval(tick,1600)};}catch{}}
  function stopRing(){if(!ring)return;clearInterval(ring.timer);ring.ac.close().catch(()=>{});ring=null;}

  async function media(){local=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:kind==='video'?{facingMode:'user',width:{ideal:720}}:false});}
  function peer(){
    pc=new RTCPeerConnection({iceServers:servers()});
    for(const tr of local?.getTracks()??[])pc.addTrack(tr,local);
    pc.onicecandidate=e=>{if(e.candidate)send({t:'ice',c:e.candidate.toJSON()});};
    pc.ontrack=e=>{remote=e.streams[0];paint();};
    pc.onconnectionstatechange=()=>{if(pc?.connectionState==='connected'&&st!=='live'){st='live';started=Date.now();clearInterval(timer);timer=setInterval(()=>{const l=view?.querySelector('.call-line');if(l)l.textContent=clock();for(const v of [rv,lv])if(v?.srcObject&&v.paused)v.play().catch(()=>{});},1000);paint();}
      if(['failed','closed'].includes(pc?.connectionState))hangup(false);};
  }
  async function flushIce(){for(const c of pending)try{await pc.addIceCandidate(c);}catch{}pending=[];}

  // ---- you call
  async function start(k){
    if(st!=='idle')return;kind=k;id=crypto.randomUUID();st='calling';paint();
    try{await media();}catch{end(t('call.noDevice'));return;}
    stopAllSound();paint();send({t:'ring',kind});startRing();
    setTimeout(()=>{if(st==='calling')hangup(true,t('call.noAnswer'));},45000);
  }
  // ---- they call
  async function accept(){stopRing();stopAllSound();st='connecting';paint();try{await media();}catch{decline();return;}peer();paint();send({t:'accept'});}
  function decline(){send({t:'decline'});end();}
  function hangup(tell,message){if(tell&&st!=='idle')send({t:'hangup'});end(message);}
  function end(message){stopRing();clearInterval(timer);timer=null;try{pc?.close();}catch{}pc=null;for(const tr of local?.getTracks()??[])tr.stop();local=null;remote=null;if(rv)rv.srcObject=null;if(lv)lv.srcObject=null;rv=lv=null;st='idle';id=null;pending=[];muted=camOff=false;
    view?.remove();view=null;document.documentElement.classList.remove('call-open');if(message)toast(message);}
  function toast(m){const n=el('div',undefined,'call-toast');n.textContent=m;document.body.append(n);setTimeout(()=>n.remove(),3500);}

  onSignal(async p=>{
    if(!p||p.from===me())return;
    if(p.t==='ring'){if(st!=='idle'){signal({t:'busy',id:p.id,from:me()});return;}id=p.id;kind=p.kind==='video'?'video':'audio';st='ringing';paint();startRing();return;}
    if(p.id!==id)return;
    if(p.t==='accept'&&st==='calling'){stopRing();st='connecting';peer();paint();const offer=await pc.createOffer();await pc.setLocalDescription(offer);send({t:'offer',sdp:offer});}
    else if(p.t==='offer'&&pc){await pc.setRemoteDescription(p.sdp);await flushIce();const ans=await pc.createAnswer();await pc.setLocalDescription(ans);send({t:'answer',sdp:ans});}
    else if(p.t==='answer'&&pc){await pc.setRemoteDescription(p.sdp);await flushIce();}
    else if(p.t==='ice'){if(pc?.remoteDescription)try{await pc.addIceCandidate(p.c);}catch{}else pending.push(p.c);}
    else if(p.t==='decline')end(t('call.declined'));
    else if(p.t==='busy')end(t('call.busy'));
    else if(p.t==='hangup')end(st==='ringing'?t('call.missed'):t('call.ended'));
  });
  return {start,busy:()=>st!=='idle',end:()=>hangup(true)};
}
