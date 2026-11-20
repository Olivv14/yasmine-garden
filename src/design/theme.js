// Night / Day / Harissa on top of the stored legacy theme ids (the server keeps its 10-id contract).
// Pure resolver + a small DOM applier. No network, no account writes.
import {getTheme,THEMES} from '../../experience/themes.mjs';

export const GARDEN_THEMES=Object.freeze(['night','day','harissa']);
export const THEME_COLOR=Object.freeze({night:'#0F1424',day:'#F6EFE3',harissa:'#1C0A08'});
const KEY_FOLLOW='garden.followTime',KEY_HARISSA='garden.harissa',KEY_DARK='garden.alwaysDark',KEY_LIGHT='garden.alwaysLight';

// Day is 06:00 to 20:00 in the viewer's own local time.
export function isDaytime(date=new Date()){const h=date.getHours();return h>=6&&h<20;}
// The 3D garden's own light: day, golden hour from 18:00, night from 20:00 to 6:00.
export function gardenLight(date=new Date()){const h=date.getHours();return h>=6&&h<18?'day':h>=18&&h<20?'dusk':'night';}
// Appearance, chosen on each phone: follow the time of day (light by day), always light, or always dark.
export function resolveGardenTheme({legacy='dark',followTime=true,harissa=false,alwaysDark=false,alwaysLight=false,now=new Date()}={}){
  if(harissa)return 'harissa';
  if(alwaysDark)return 'night';
  if(alwaysLight)return 'day';
  if(followTime)return isDaytime(now)?'day':'night';
  const scheme=Object.hasOwn(THEMES,legacy)?getTheme(legacy).scheme:'dark';
  return scheme==='light'?'day':'night';
}
// Picker shows Night and Day; a stored legacy choice stays selectable so its value still displays.
export function themeChoices(current){const base=['dark','light'];return base.includes(current)||!Object.hasOwn(THEMES,current)?base:[...base,current];}

const read=(k,fallback)=>{try{const v=localStorage.getItem(k);return v===null?fallback:v==='1';}catch{return fallback;}};
const write=(k,v)=>{try{localStorage.setItem(k,v?'1':'0');}catch{}};
let legacyTheme='dark',timer=null;
const listeners=new Set();
export const followsTime=()=>read(KEY_FOLLOW,true);
export const harissaOn=()=>read(KEY_HARISSA,false);
export const alwaysDark=()=>read(KEY_DARK,false);
export const alwaysLight=()=>!alwaysDark()&&read(KEY_LIGHT,false);
export function setAppearance(mode){write(KEY_DARK,mode==='dark');write(KEY_LIGHT,mode==='light');if(mode==='auto')write(KEY_FOLLOW,true);refreshGardenTheme();}
export const appearance=()=>alwaysDark()?'dark':alwaysLight()?'light':'auto';
export function setFollowTime(on){write(KEY_FOLLOW,on);refreshGardenTheme();}
export function setHarissa(on){write(KEY_HARISSA,on);refreshGardenTheme();}
export function onGardenTheme(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export function currentGardenTheme(){return document.documentElement.dataset.gardenTheme||'night';}

export function applyGardenTheme(root,legacy){
  legacyTheme=legacy??legacyTheme;
  // themes.mjs writes legacy names inline; two of them collide with design tokens.
  for(const name of ['--line','--on-accent'])root.style.removeProperty(name);
  const id=resolveGardenTheme({legacy:legacyTheme,followTime:followsTime(),harissa:harissaOn(),alwaysDark:alwaysDark(),alwaysLight:alwaysLight()});
  const changed=root.dataset.gardenTheme!==id;
  root.dataset.gardenTheme=id;root.style.setProperty('color-scheme',id==='day'?'light':'dark');
  const color=document.querySelector('meta[name=theme-color]');if(color)color.content=THEME_COLOR[id];
  const scheme=document.querySelector('meta[name=color-scheme]');if(scheme)scheme.content=id==='day'?'light':'dark';
  if(changed)for(const fn of listeners)fn(id);
  if(!timer)timer=setInterval(()=>{if(followsTime())refreshGardenTheme();},60000);
  return id;
}
export function refreshGardenTheme(){return applyGardenTheme(document.documentElement);}
