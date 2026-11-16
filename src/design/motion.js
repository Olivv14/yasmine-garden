// Thin wrapper over the motion library: one shared easing, one reduced-motion switch.
import {animate as motionAnimate} from 'motion';

export const EASE=[.2,.8,.2,1];
export const DURATION=Object.freeze({ui:.24,sheet:.28,reveal:.32,plant:.7,water:.9,bloom:1.6,heartTap:.4});
const query=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
export const reducedMotion=()=>!!query?.matches;
export function onReducedMotion(fn){query?.addEventListener?.('change',()=>fn(reducedMotion()));}

// With reduced motion every animation jumps to its final keyframe at once.
export function animate(target,keyframes,options={}){
  if(reducedMotion()){
    const finalFrame=Object.fromEntries(Object.entries(keyframes).map(([k,v])=>[k,Array.isArray(v)?v[v.length-1]:v]));
    return motionAnimate(target,finalFrame,{duration:0});
  }
  return motionAnimate(target,keyframes,{ease:EASE,duration:DURATION.ui,...options});
}
