// Pure garden rules. No DOM: everything here is unit-tested in scripts/garden.test.mjs.
export const FLOWER_TYPES=Object.freeze(['rose','marigold','jasmine','lavender','lilium','orchid']);
// Types every deployed database accepts. The other three need backend/005_garden_games.sql.
export const LEGACY_FLOWER_TYPES=Object.freeze(['jasmine','lilium','orchid']);
export const STAGES=Object.freeze(['seed','sprout','bud','bloom']);
export const WIDTH=1500,HEIGHT=500;
const DAY=86400000;

// Every 3 waterings move a flower one stage up: 0-2 seed, 3-5 sprout, 6-8 bud, 9 bloom.
export function stageFor(water){const w=Math.max(0,Math.min(9,Number(water)||0));return w>=9?3:Math.floor(w/3);}
export function hash(text){let h=2166136261;for(const c of String(text)){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}

// Beds hold 24 slots each; ids map to slots deterministically, so a flower never jumps around.
export const BEDS=Object.freeze({
  back:Object.freeze({y:360,spread:9,scale:1.05,slots:24,x0:56,step:58}),
  front:Object.freeze({y:456,spread:20,scale:1.5,slots:24,x0:44,step:59}),
});
export function placeFlowers(flowers){
  const taken=new Set(),total=BEDS.back.slots+BEDS.front.slots,out=[];
  const ordered=[...flowers].sort((a,b)=>String(a.created_at??'').localeCompare(String(b.created_at??''))||String(a.id).localeCompare(String(b.id)));
  for(const f of ordered){
    const h=hash(f.id);let slot=h%total;
    for(let i=0;i<total&&taken.has(slot);i++)slot=(slot+1)%total;
    if(taken.has(slot))break;
    taken.add(slot);
    const bed=slot<BEDS.back.slots?'back':'front',b=BEDS[bed],index=bed==='back'?slot:slot-BEDS.back.slots;
    const jitterX=((h>>>8)%17)-8,jitterY=((h>>>16)%(b.spread*2+1))-b.spread;
    out.push(Object.freeze({flower:f,bed,x:b.x0+index*b.step+jitterX,y:b.y+jitterY,scale:b.scale*(.92+((h>>>24)%17)/100)}));
  }
  return out.sort((a,b)=>a.y-b.y);
}

// Authorship colour: names first (the app is for Oliver and Yasmine), pair slot as fallback.
export function authorTone(profileId,members=[],profiles=[]){
  const name=profiles.find(p=>p.id===profileId)?.display_name??'';
  if(/yasm/i.test(name))return 'yasmine';
  if(/oliv/i.test(name))return 'oliver';
  return members.find(m=>m.profile_id===profileId)?.slot===2?'yasmine':'oliver';
}
const time=v=>{const n=Date.parse(v??'');return Number.isFinite(n)?n:0;};
// No watering for 3 days: the flower droops. One watering (a newer updated_at) revives it. Nothing dies.
export const isDrooping=(f,now=Date.now())=>now-time(f.updated_at??f.created_at)>3*DAY;
export const needsWater=(f,now=Date.now())=>stageFor(f.water)<3&&now-time(f.updated_at??f.created_at)>DAY;

const localDay=ms=>{const d=new Date(ms);return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;};
// A lantern lights for each of the last 7 days on which both of you answered a question.
// Seven days in a row also light the pergola.
export function lanterns(rounds=[],answers=[],now=Date.now()){
  const done=new Set();
  for(const r of rounds){const own=answers.filter(a=>a.round_id===r.id&&a.submitted_at);if(new Set(own.map(a=>a.owner_id)).size<2)continue;done.add(localDay(Math.max(...own.map(a=>time(a.submitted_at)))));}
  let lit=0;for(let i=0;i<7;i++)if(done.has(localDay(now-i*DAY)))lit++;
  // The streak may end today or, if today is not answered yet, yesterday.
  const start=done.has(localDay(now))?0:1;let streak=0;
  while(streak<7&&done.has(localDay(now-(start+streak)*DAY)))streak++;
  return Object.freeze({lit,pergola:streak>=7});
}
// A finished game leaves a firefly (night) or butterfly (day) for one day.
export const visitors=(events=[],now=Date.now())=>Math.min(8,events.filter(e=>e.kind==='finish'&&now-time(e.created_at)<DAY).length);

export function summary(flowers,now=Date.now()){
  const live=flowers.filter(f=>!f.deleted_at);
  const today=live.filter(f=>localDay(time(f.created_at))===localDay(now)).sort((a,b)=>time(b.created_at)-time(a.created_at))[0]??null;
  return Object.freeze({count:live.length,thirsty:live.filter(f=>needsWater(f,now)).length,blooming:live.filter(f=>stageFor(f.water)===3).length,plantedToday:today});
}
