// "How well do you know me?": the pure parts. Questions and their four answers live in the catalog
// (knowme.q01 … knowme.q24, each with .a .b .c .d); only question ids and picks (0-3) are stored.
export const KNOWME_SIZE=5;
export const QUESTIONS=Object.freeze(Array.from({length:24},(_,i)=>'km'+String(i+1).padStart(2,'0')));
export const OPTIONS=Object.freeze(['a','b','c','d']);
export const questionKey=id=>'knowme.q'+id.slice(2);
export const optionKey=(id,pick)=>questionKey(id)+'.'+OPTIONS[pick];

// Five questions, avoiding the ones asked in your recent rounds while enough others remain.
export function pickQuestions(recent=[],n=KNOWME_SIZE,random=Math.random){
  const used=new Set(recent),fresh=QUESTIONS.filter(q=>!used.has(q));
  const pool=fresh.length>=n?fresh:[...QUESTIONS];
  const a=[...pool];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a.slice(0,n);
}
export const matches=(self=[],guess=[])=>self.reduce((n,p,i)=>n+(p===guess[i]?1:0),0);
