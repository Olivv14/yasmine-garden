// What this phone has discovered in the garden. Kept on the phone for now; nothing is sent anywhere.
import {CULTURE_IDS} from './culture.js';
const KEY='garden.discoveries';
export function loadDiscoveries(){try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return new Set(Array.isArray(v)?v.filter(id=>CULTURE_IDS.includes(id)):[]);}catch{return new Set();}}
export function addDiscovery(id){const seen=loadDiscoveries();if(!CULTURE_IDS.includes(id))return {seen,fresh:false};const fresh=!seen.has(id);seen.add(id);try{localStorage.setItem(KEY,JSON.stringify([...seen]));}catch{}return {seen,fresh};}
