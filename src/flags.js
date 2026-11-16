// Original inline vector flag indicators. Windows emoji fonts may render flags
// as regional-letter codes; these assets never depend on emoji-font support.
const NS='http://www.w3.org/2000/svg';
export function flagIcon(locale){
 const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 60 40');svg.setAttribute('aria-hidden','true');svg.dataset.flag=locale;
 const shape=(tag,attrs)=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));svg.append(n);};
 if(locale==='fr'){
  shape('rect',{width:60,height:40,fill:'#fff'});shape('rect',{width:20,height:40,fill:'#002395'});shape('rect',{x:40,width:20,height:40,fill:'#ed2939'});
 }else if(locale==='en'){
  shape('rect',{width:60,height:40,fill:'#012169'});shape('path',{d:'M0 0L60 40M60 0L0 40',stroke:'#fff','stroke-width':9});shape('path',{d:'M0 0L60 40M60 0L0 40',stroke:'#c8102e','stroke-width':3});shape('path',{d:'M30 0V40M0 20H60',stroke:'#fff','stroke-width':14});shape('path',{d:'M30 0V40M0 20H60',stroke:'#c8102e','stroke-width':8});
 }else if(locale==='aeb-TN'){
  shape('rect',{width:60,height:40,fill:'#e70013'});shape('circle',{cx:30,cy:20,r:12,fill:'#fff'});shape('circle',{cx:29,cy:20,r:9,fill:'#e70013'});shape('circle',{cx:32,cy:18.8,r:7,fill:'#fff'});shape('path',{d:'M34 14.5L35.4 18.5L39.6 18.5L36.2 21L37.5 25L34 22.5L30.5 25L31.8 21L28.4 18.5L32.6 18.5Z',fill:'#e70013'});
 }else throw new RangeError('Unknown flag locale');
 return svg;
}
