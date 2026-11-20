// The real sky over the garden, pure (scripts/eggs.test.mjs): the moon's phase tonight and when a shooting star passes.
const SYNODIC=29.530588853,NEW_MOON=Date.UTC(2000,0,6,18,14);
// 0 new moon, .25 first quarter, .5 full moon, .75 last quarter.
export function moonPhase(date=new Date()){const days=(date.getTime()-NEW_MOON)/86400000;return ((days/SYNODIC)%1+1)%1;}
export const isFullMoon=(date=new Date())=>Math.abs(moonPhase(date)-.5)<.034;
// The lit side faces this way (view space): towards you at full moon, away at new moon, from the right while waxing.
export function moonLight(phase){const a=phase*2*Math.PI;return [Math.sin(a),0,-Math.cos(a)];}
// Seconds until the next shooting star, a little random.
export const nextShootingStar=(random=Math.random)=>18+random*40;
