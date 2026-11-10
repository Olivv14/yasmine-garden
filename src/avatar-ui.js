import {t,copy} from './experience.js';
import {createAvatarController} from './avatar.js';
import {createAvatarContextAdapter} from './auth.js';

// Files/URLs stay in memory. Only the controller can publish or remove bytes.
export function createAvatarUI({$,el,button,client,getApi,getGeneration,onIdentityFailure,isFrozen=()=>false,beginHost=()=>()=>{}}){
 let serial=0,viewSerial=0,busy=false,error=null,message='avatar.empty',previewURL=null,recovery=[],ownId=null,photoId=null,loaded=false,scope=null;
 const adapter=createAvatarContextAdapter({client,getTransport:getApi,getGeneration,onIdentityFailure,onUnavailable:()=>unavailable()});
 const controller=createAvatarController({client,getVerifiedContext:adapter.getVerifiedContext,isCurrentContext:adapter.isCurrentContext});
 const root=$('avatarEditor'),title=el('h3',()=>t('avatar.title')),hint=el('p',()=>t('avatar.hint'),'hint');
 const input=el('input');input.id='avatarFile';input.type='file';input.accept='image/jpeg,image/png,image/webp,image/gif';
 const label=el('label',()=>t('avatar.choose'));label.htmlFor=input.id;
 const preview=el('img');preview.id='avatarPreview';preview.className='avatar-preview';preview.hidden=true;copy(preview,()=>t('avatar.previewAlt'),'alt');
 const consent=el('input');consent.id='avatarConsent';consent.type='checkbox';
 const consentLabel=el('label',()=>t('avatar.consent'));consentLabel.htmlFor=consent.id;
 const status=el('p');status.id='avatarStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const upload=button(()=>t('avatar.upload'),()=>run(async current=>{if(controller.getState()?.fileRetained&&!consent.checked){error={code:'AVATAR_CONSENT_REQUIRED'};return;}await controller.retry();current();clearPreview();message='avatar.saved';await refresh();current();}));upload.id='avatarUpload';
 const discard=button(()=>t('avatar.discard'),()=>cleanup(controller.getState()?.id));discard.id='avatarDiscard';
 const removeActive=button(()=>t('avatar.discard'),()=>cleanup(photoId));removeActive.id='avatarRemoveActive';
 const list=el('div');list.id='avatarRecovery';
 const refreshButton=button(()=>t('avatar.refresh'),()=>run(async current=>{const rows=await controller.listRecovery();current();recovery=rows;message='avatar.recoveryHint';}));refreshButton.id='avatarRefresh';
 title.id='avatarTitle';root.append(title,hint,label,input,preview,consent,consentLabel,upload,discard,removeActive,status,el('p',()=>t('avatar.recoveryHint'),'hint'),refreshButton,list);
 const header=el('img');header.id='profilePhoto';header.hidden=true;copy(header,()=>t('avatar.ownAlt'),'alt');$('profileBubble').prepend(header);
 function clearPreview(){if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;preview.removeAttribute('src');preview.hidden=true;}
 function releaseView(){viewSerial++;loaded=false;header.removeAttribute('src');delete header.dataset.avatarId;header.hidden=true;$('profileInitials').hidden=false;if(ownId)controller.releasePhoto(ownId);}
 function unavailable(){serial++;controller.setUnavailable();busy=false;adapter.markUnavailable();releaseView();clearPreview();error={code:'AVATAR_REQUEST_FAILED',recovery:'reverify_context'};paint();}
 function text(e){const key='avatar.error.'+e?.code?.replaceAll('_','.');return t(ERROR_CODES.has(e?.code)?key:'avatar.error.generic');}
 function paint(){const intent=controller.getState();const frozen=isFrozen();input.disabled=frozen||busy||!!intent&&intent.state!=='complete';consent.disabled=frozen||busy;upload.hidden=!intent||intent.state==='complete'||intent.publicationInvalidated||intent.recovery==='cleanup_only';upload.disabled=frozen||busy;discard.hidden=!intent||intent.state==='complete';discard.disabled=frozen;refreshButton.disabled=frozen||busy;removeActive.hidden=!photoId;removeActive.disabled=frozen||busy;
  copy(upload,()=>t(intent?.state==='selected'?'avatar.upload':'avatar.retry'));copy(status,()=>busy?t('avatar.working'):error?text(error):t(message));
  list.replaceChildren();for(const row of recovery){const box=el('article',undefined,'entry');box.dataset.avatarId=row.id;box.append(el('p',()=>t(row.status==='deleting'?'avatar.deleting':row.publication_invalidated?'avatar.invalidated':'avatar.pending')));
   if(row.status==='pending'&&!row.publication_invalidated){const resume=button(()=>t('avatar.recover'),()=>run(async current=>{await controller.recoverPending(row.id);current();message='avatar.saved';await refresh();current();}));resume.disabled=frozen||busy||!!intent&&intent.id!==row.id&&intent.state!=='complete';box.append(resume);}
   const remove=button(()=>t('avatar.discard'),()=>cleanup(row.id));remove.disabled=frozen||busy;box.append(remove);list.append(box);}
 }
 async function run(fn){if(busy||isFrozen())return;const end=beginHost(),token=serial;busy=true;error=null;paint();try{await fn(()=>{if(token!==serial||isFrozen())throw {code:'AVATAR_SESSION_CHANGED'};});}catch(e){if(token===serial){error=e;if(['AVATAR_PUBLICATION_CONFLICT','AVATAR_PUBLICATION_INVALIDATED'].includes(e.code))await getApi()?.refresh().catch(()=>{});}}finally{end();if(token===serial){busy=false;paint();}}}
 async function refresh(){await getApi().refresh();}
 async function cleanup(id){if(!id||isFrozen())return;if(!confirm(t('avatar.deleteConfirm')))return;serial++;busy=false;clearPreview();releaseView();if(id===photoId){releaseView();photoId=null;}await run(async current=>{await controller.cleanup(id);current();consent.checked=false;message='avatar.deleted';const rows=await controller.listRecovery();current();recovery=rows;await refresh();current();});}
 let pickerBinding=null,selection=null;
 const hostBinding=()=>{const ctx=getApi()?.context;return ctx?[getGeneration(),ctx.user.id,ctx.me.id,ctx.pairId,scope].join(':'):null;};
 const bindPicker=()=>{pickerBinding=!isFrozen()&&input.isConnected?hostBinding():null;};input.onclick=bindPicker;input.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')bindPicker();};
 input.onchange=()=>{const file=input.files?.[0],binding=pickerBinding;input.value='';pickerBinding=null;if(isFrozen()||!file||!binding||binding!==hostBinding()||!input.isConnected)return;const request=selection={file,binding,token:serial};run(async()=>{try{if(request.binding!==hostBinding()||request.token!==serial||!request.file)return;await controller.select(request.file,{userSelected:true});if(request.binding!==hostBinding()||request.token!==serial||!request.file||!input.isConnected)return;clearPreview();previewURL=URL.createObjectURL(request.file);preview.src=previewURL;preview.hidden=false;consent.checked=false;message='avatar.selected';}finally{request.file=null;if(selection===request)selection=null;}});};
 consent.onchange=paint;
 function freeze(){serial++;pickerBinding=null;if(selection)selection.file=null;selection=null;controller.setUnavailable();adapter.markUnavailable();busy=false;releaseView();paint();}
 async function load(id,owner){const token=serial,view=++viewSerial;const current=()=>token===serial&&view===viewSerial&&owner===ownId&&id===photoId;try{const photo=await controller.loadPhoto(owner);if(!current())return;if(photo&&photo.id===id){header.src=photo.url;header.dataset.avatarId=photo.id;header.hidden=false;$('profileInitials').hidden=true;loaded=true;}}catch(e){if(current()){error=e;paint();}}}
 paint();
 return {
  receive(data){if(isFrozen()){paint();return;}const nextScope=[data.me.auth_user_id,data.me.id,data.pairId,...data.members.map(m=>m.profile_id).sort()].join(':');if(scope&&scope!==nextScope){onIdentityFailure({code:'AVATAR_CONTEXT_INVALID'});return;}scope=nextScope;const nextOwn=data.me.id,active=(data.avatars??[]).filter(r=>r.owner_id===nextOwn&&r.status==='ready'&&r.active===true);const next=active.length===1?active[0].id:null;
   if(ownId&&ownId!==nextOwn)this.clear();ownId=nextOwn;recovery=(data.avatars??[]).filter(r=>r.owner_id===ownId&&!(r.status==='ready'&&r.active));
   if(photoId!==next){releaseView();photoId=next;}if(next&&!loaded)load(next,ownId);paint();},
  clear(){serial++;pickerBinding=null;if(selection)selection.file=null;selection=null;adapter.reset();controller.clear();busy=false;error=null;message='avatar.empty';input.value='';consent.checked=false;clearPreview();releaseView();ownId=photoId=null;scope=null;recovery=[];paint();},
  unavailable,freeze,
  dirty(){const s=controller.getState();return busy||!!s&&s.state!=='complete';},
 };
}
const ERROR_CODES=new Set(['AVATAR_CONSENT_REQUIRED','AVATAR_HEIC_UNSUPPORTED','AVATAR_TYPE_UNSUPPORTED','AVATAR_SIZE_INVALID','AVATAR_SIGNATURE_MISMATCH','AVATAR_DECODE_FAILED','AVATAR_DIMENSIONS_INVALID','AVATAR_DECODE_UNAVAILABLE','AVATAR_RESELECTION_REQUIRED','AVATAR_PUBLICATION_INVALIDATED','AVATAR_PUBLICATION_CONFLICT','AVATAR_CLEANUP_REQUIRED','AVATAR_REQUEST_FAILED','AVATAR_UPLOAD_UNCONFIRMED','AVATAR_SESSION_CHANGED','AVATAR_CLEANUP_RETRY_REQUIRED','AVATAR_DELETE_UNCONFIRMED','AVATAR_INTENT_EXISTS']);
