// Listen together: a private live room for the two of you (pair:<pair id>:music, allowed by backend/006).
// Presence says what each of you is listening to and from which moment; nothing is stored anywhere.
// Without 006 the room simply refuses to open and Music works alone.
export const DRIFT_S=1.5;

// Where the partner is in the song right now, from their last shared position.
export function partnerPosition(p,now=Date.now()){
  if(!p?.item)return 0;
  const base=Number(p.position)||0;
  return p.playing?Math.max(0,base+(now-Number(p.at||now))/1000):base;
}
// Seek only when the two of you are more than DRIFT_S seconds apart.
export const needsSeek=(local,target)=>Math.abs(local-target)>DRIFT_S;

const pick=item=>item?{id:item.id,title:item.title,artist:item.artist??null,source:item.source,ref:item.ref,duration_ms:item.duration_ms??null,cover_url:item.cover_url??null}:null;

export function createTogether({getClient,getPairId,me,onChange}){
  let channel=null,mine={item:null,playing:false,position:0},partner=null,connecting=false,failedAt=0;
  const topic=()=>'pair:'+getPairId()+':music';
  async function connect(){
    const client=getClient(),pair=getPairId(),id=me();
    // a refused room (no 006 yet, or offline) is retried at most every five minutes
    if(channel||connecting||!client||!pair||!id||Date.now()-failedAt<300000)return;
    connecting=true;
    try{await client.realtime.setAuth();}catch{}
    channel=client.channel(topic(),{config:{private:true,broadcast:{self:false},presence:{key:id}}});
    channel.on('presence',{event:'sync'},()=>{
      const other=Object.entries(channel.presenceState()).find(([k])=>k!==me());
      partner=other?{...other[1][0],profile_id:other[0]}:null;onChange?.();
    }).subscribe(async st=>{
      connecting=false;
      if(st==='SUBSCRIBED')await channel.track(snapshot()).catch(()=>{});
      else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'||st==='CLOSED'){if(st!=='CLOSED')failedAt=Date.now();const c=channel;channel=null;partner=null;if(c)getClient()?.removeChannel(c);onChange?.();}
    });
  }
  const snapshot=()=>({item:pick(mine.item),playing:!!mine.playing,position:Math.round((Number(mine.position)||0)*100)/100,at:Date.now()});
  function share(next){mine={...mine,...next};channel?.track(snapshot()).catch(()=>{});}
  function disconnect(){const c=channel;channel=null;partner=null;mine={item:null,playing:false,position:0};if(c)getClient()?.removeChannel(c);}
  return {connect,share,disconnect,partner:()=>partner?.item?partner:null,connected:()=>!!channel};
}
