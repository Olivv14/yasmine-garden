// Minimal SVG builder. Colour always comes from CSS classes (c-*), never inline styles (CSP).
export const NS='http://www.w3.org/2000/svg';
export function s(tag,attrs={},children=[]){
  const n=document.createElementNS(NS,tag);
  for(const [k,v] of Object.entries(attrs))if(v!==undefined&&v!==null)n.setAttribute(k==='cls'?'class':k,String(v));
  for(const c of [].concat(children))if(c)n.append(c);
  return n;
}
export const g=(cls,children,attrs={})=>s('g',{cls,...attrs},children);
export const ellipse=(cx,cy,rx,ry,cls,rot)=>s('ellipse',{cx,cy,rx,ry,cls,transform:rot?`rotate(${rot} ${cx} ${cy})`:undefined});
export const circle=(cx,cy,r,cls)=>s('circle',{cx,cy,r,cls});
export const path=(d,cls)=>s('path',{d,cls});
export const rect=(x,y,width,height,cls,rx)=>s('rect',{x,y,width,height,cls,rx});
// Seeded random so the painted scenery is identical on every device and render.
export function rng(seed){let x=seed>>>0||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
export function star(cx,cy,r,cls,points=5,inner=.45){cx=+cx;cy=+cy;r=+r;let d='';for(let i=0;i<points*2;i++){const a=Math.PI*i/points-Math.PI/2,rr=i%2?r*inner:r;d+=(i?'L':'M')+(cx+Math.cos(a)*rr).toFixed(1)+' '+(cy+Math.sin(a)*rr).toFixed(1);}return path(d+'Z',cls);}
