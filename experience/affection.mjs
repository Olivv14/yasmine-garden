export const AFFECTION_PHRASE_KEYS=Object.freeze(Array.from({length:10},(_,i)=>`affection.phrase${String(i+1).padStart(2,'0')}`));
/** Pure interaction state, not a notification sender. One controller per mounted
 * button/session. Caller persists emitted intents BEFORE a future network send.
 * Adapter dedupes idempotencyKey across retry/reload. No timer or network here.
 */
export function createAffectionController({idFactory,onIntent,animate=()=>{},reducedMotion=false,startPhrase=0}={}) {
  if(typeof idFactory!=='function'||typeof onIntent!=='function'||typeof animate!=='function')throw new TypeError('Expected idFactory, onIntent and animation callbacks');
  if(!Number.isInteger(startPhrase)||startPhrase<0||startPhrase>=10)throw new RangeError('Invalid phrase cursor');
  if(typeof reducedMotion!=='boolean')throw new TypeError('Expected reducedMotion boolean');
  let taps=new Set(),intent=null,attempted=false,phrase=startPhrase;
  // Keep lifetime gesture/id ledgers: duplicate dispatch or ID reuse must not
  // create a second intent after reset. Dispose controller on authenticated logout.
  const gestures=new Set(),burstIds=new Set();
  const emit=()=>{attempted=true;onIntent(intent);};
  return Object.freeze({
    tap(gestureId){
      if(typeof gestureId!=='string'||!gestureId)throw new TypeError('Distinct activation ID required');
      if(intent||gestures.has(gestureId))return intent;
      if(taps.size===9){const id=idFactory();if(typeof id!=='string'||!id||burstIds.has(id))throw new Error('Fresh burst ID required');
        gestures.add(gestureId);taps.add(gestureId);burstIds.add(id);
        intent=Object.freeze({type:'affection.requested',version:1,idempotencyKey:id,phraseKey:AFFECTION_PHRASE_KEYS[phrase],tapCount:10});
        // Commit latch before callback: callback re-entry/throw cannot emit twice.
        try { emit(); }
        finally { animate(Object.freeze({kind:reducedMotion?'static-flower':'flower-bloom',reducedMotion})); }
        return intent;
      }
      gestures.add(gestureId);taps.add(gestureId);return null;
    },
    getState(){return Object.freeze({tapCount:taps.size,intent,emissionAttempted:attempted});},
    // Retrieval ONLY. Caller may retry the SAME intent through its durable,
    // idempotent backend adapter. This does NOT call onIntent a second time.
    retry(){return intent;},
    // Explicit user starts another burst; not an automatic timer reset.
    reset(){if(intent)phrase=(phrase+1)%10;taps=new Set();intent=null;attempted=false;},
  });
}
