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
 }else if(locale==='es'){
  // Venezuela: yellow, blue, red, and the arc of eight white stars
  shape('rect',{width:60,height:13.34,fill:'#FFCC00'});shape('rect',{y:13.33,width:60,height:13.34,fill:'#00247D'});shape('rect',{y:26.66,width:60,height:13.34,fill:'#CF142B'});shape('path',{d:'M20.42 23.06L20.77 24.02L21.79 24.06L20.99 24.70L21.27 25.68L20.42 25.12L19.56 25.68L19.84 24.70L19.04 24.06L20.06 24.02ZM22.19 19.99L22.54 20.95L23.57 21.00L22.77 21.63L23.04 22.62L22.19 22.05L21.33 22.62L21.61 21.63L20.81 21.00L21.83 20.95ZM24.90 17.72L25.26 18.67L26.28 18.72L25.48 19.35L25.75 20.34L24.90 19.78L24.05 20.34L24.32 19.35L23.52 18.72L24.54 18.67ZM28.23 16.50L28.59 17.46L29.61 17.51L28.81 18.14L29.08 19.13L28.23 18.56L27.38 19.13L27.65 18.14L26.85 17.51L27.87 17.46ZM31.77 16.50L32.13 17.46L33.15 17.51L32.35 18.14L32.62 19.13L31.77 18.56L30.92 19.13L31.19 18.14L30.39 17.51L31.41 17.46ZM35.10 17.72L35.46 18.67L36.48 18.72L35.68 19.35L35.95 20.34L35.10 19.78L34.25 20.34L34.52 19.35L33.72 18.72L34.74 18.67ZM37.81 19.99L38.17 20.95L39.19 21.00L38.39 21.63L38.67 22.62L37.81 22.05L36.96 22.62L37.23 21.63L36.43 21.00L37.46 20.95ZM39.58 23.06L39.94 24.02L40.96 24.06L40.16 24.70L40.44 25.68L39.58 25.12L38.73 25.68L39.01 24.70L38.21 24.06L39.23 24.02Z',fill:'#fff'});
 }else if(locale==='it'){
  shape('rect',{width:60,height:40,fill:'#fff'});shape('rect',{width:20,height:40,fill:'#009246'});shape('rect',{x:40,width:20,height:40,fill:'#ce2b37'});
 }else if(locale==='aeb-TN'){
  shape('rect',{width:60,height:40,fill:'#e70013'});shape('circle',{cx:30,cy:20,r:12,fill:'#fff'});shape('circle',{cx:29,cy:20,r:9,fill:'#e70013'});shape('circle',{cx:32,cy:18.8,r:7,fill:'#fff'});shape('path',{d:'M34 14.5L35.4 18.5L39.6 18.5L36.2 21L37.5 25L34 22.5L30.5 25L31.8 21L28.4 18.5L32.6 18.5Z',fill:'#e70013'});
 }else throw new RangeError('Unknown flag locale');
 return svg;
}
