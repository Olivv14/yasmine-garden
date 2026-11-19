// Self-hosted fonts (the CSP blocks remote fonts). Build copies these woff2 files from @fontsource.
export const FONT_FILES=Object.freeze([
  {family:'Inter',pkg:'inter',subset:'latin',weight:400},
  {family:'Inter',pkg:'inter',subset:'latin',weight:600},
  {family:'Bricolage Grotesque',pkg:'bricolage-grotesque',subset:'latin',weight:700},
  {family:'Bricolage Grotesque',pkg:'bricolage-grotesque',subset:'latin',weight:800},
  {family:'Caveat',pkg:'caveat',subset:'latin',weight:700},
  {family:'Inter',pkg:'inter',subset:'latin',weight:700},
  {family:'JetBrains Mono',pkg:'jetbrains-mono',subset:'latin',weight:400},
  {family:'Noto Naskh Arabic',pkg:'noto-naskh-arabic',subset:'arabic',weight:400},
  {family:'Noto Naskh Arabic',pkg:'noto-naskh-arabic',subset:'arabic',weight:600},
].map(f=>Object.freeze({...f,file:`${f.pkg}-${f.subset}-${f.weight}-normal.woff2`})));
const RANGES={latin:'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',arabic:'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC,U+102E0-102FB,U+10E60-10E7E,U+10EC2-10EC4,U+10EFC-10EFF,U+1EE00-1EEFF'};
export function fontFaceCSS(base='./fonts/'){
  return FONT_FILES.map(f=>`@font-face{font-family:"${f.family}";font-style:normal;font-weight:${f.weight};font-display:swap;src:url(${base}${f.file}) format("woff2");unicode-range:${RANGES[f.subset]}}`).join('\n');
}
