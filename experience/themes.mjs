// Independent token resources. No stylesheet, DOM or network side effects on import.
const palette = (id, scheme, night, panel, paper, muted, warm, sage, error, secondary) => Object.freeze({
  id, labelKey: `themes.${id}`, scheme,
  vars: Object.freeze({
    '--night': night, '--panel': panel, '--paper': paper, '--muted': muted,
    '--warm': warm, '--sage': sage, '--error': error, '--line': muted,
    '--control-bg': panel, '--control-hover': night, '--control-border': muted,
    '--active-bg': panel, '--on-accent': scheme === 'dark' ? '#111111' : '#ffffff',
    '--secondary-accent': secondary, '--on-secondary': '#ffffff',
    '--focus': warm, '--garden-bg': night, '--toast-bg': panel,
  }),
});
export const THEMES = Object.freeze({
  dark: palette('dark','dark','#14131f','#201f2d','#f1e6d6','#c0b8c7','#f1c98d','#b7c9b5','#ffbcad','#763952'),
  light: palette('light','light','#f7f8fa','#ffffff','#192536','#4f5d70','#244b8f','#315b49','#a12737','#65517d'),
  pastel: palette('pastel','light','#f7eef8','#fffaff','#34213e','#64506d','#793b76','#3d6354','#a12245','#69538a'),
  barcelona: palette('barcelona','dark','#0c2340','#14365b','#fff9ed','#c6d8eb','#f5cb55','#a8dddb','#ffbdc7','#8c2346'),
  tunisia: palette('tunisia','light','#fff5f5','#ffffff','#421b24','#79515a','#b01736','#486149','#ad1632','#b01736'),
  italy: palette('italy','light','#f3faf5','#ffffff','#173b2b','#4d6359','#196141','#1d6147','#a82938','#b52d3e'),
  lavender: palette('lavender','dark','#211833','#302342','#f5ecff','#d4bfeb','#d7b9fa','#b6dfce','#ffc0d4','#785096'),
  ocean: palette('ocean','dark','#092735','#103b4a','#e8faff','#b4d4df','#89dce8','#b9e6c9','#ffbfad','#346685'),
  forest: palette('forest','dark','#102c23','#1b3b2e','#edf9ee','#c0d6c3','#d4df9a','#a6ddbd','#ffc5b5','#606e35'),
  rose: palette('rose','light','#fff1f5','#fffafd','#482435','#795266','#9d2457','#386553','#ac203e','#9d2457'),
});
export const THEME_IDS = Object.freeze(Object.keys(THEMES));
export function getTheme(id) {
  if (!Object.hasOwn(THEMES, id)) throw new RangeError(`Unknown theme: ${id}`);
  return THEMES[id];
}
export function contrastRatio(a,b) {
  const luminance = hex => {
    if (!/^#[a-f\d]{6}$/i.test(hex)) throw new TypeError('Expected opaque six-digit hex');
    const c = hex.slice(1).match(/../g).map(x => parseInt(x,16)/255).map(x => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4);
    return .2126*c[0]+.7152*c[1]+.0722*c[2];
  };
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
export function checkThemeContrast(id) {
  const v=getTheme(id).vars, checks=[];
  for (const fg of ['--paper','--muted','--warm','--sage','--error']) {
    for (const bg of ['--night','--panel']) checks.push({fg,bg,minimum:4.5,ratio:contrastRatio(v[fg],v[bg])});
  }
  for (const [fg,bg,minimum] of [['--on-accent','--warm',4.5],['--on-secondary','--secondary-accent',4.5],['--control-border','--control-bg',3],['--focus','--panel',3]]) {
    checks.push({fg,bg,minimum,ratio:contrastRatio(v[fg],v[bg])});
  }
  return checks.map(c=>Object.freeze({...c,pass:c.ratio>=c.minimum}));
}
export function applyTheme(root,id) {
  const theme=getTheme(id);
  if (!root?.style?.setProperty || !root?.setAttribute) throw new TypeError('Expected a theme root element');
  for (const [name,value] of Object.entries(theme.vars)) root.style.setProperty(name,value);
  root.style.setProperty('color-scheme',theme.scheme);
  root.setAttribute('data-theme',id);
  return theme;
}
// Existing CSS contains hardcoded dark surfaces. Parent must install this override
// after its existing CSS; applyTheme alone cannot replace literal color values.
export const THEME_BRIDGE_CSS = `
button{background:var(--control-bg);border-color:var(--control-border);color:var(--paper)}
button:hover{background:var(--control-hover);border-color:var(--warm)}
button.primary{background:var(--warm);color:var(--on-accent);border-color:var(--warm)}
button.quiet{background:transparent}
button[aria-current=page],button[aria-pressed=true]{background:var(--active-bg);color:var(--warm)}
input,textarea,select{background:var(--control-bg);color:var(--paper);border-color:var(--control-border)}
input::file-selector-button{background:var(--control-bg);color:var(--paper);border-color:var(--control-border)}
input::placeholder,textarea::placeholder{color:var(--muted);opacity:1}
:focus-visible{outline-color:var(--focus)}
.garden-bed,.night-scene{background:var(--garden-bg);color:var(--paper)}
.statusbar,.pill,.note,.entry,.question,.plant,.record-controls{background:var(--panel);color:var(--paper);border-color:var(--line)}
#toast{background:var(--toast-bg);color:var(--paper);border-color:var(--line)}
[data-experience-accent=secondary]{background:var(--secondary-accent);color:var(--on-secondary)}
[dir=rtl] input[type=url],[dir=rtl] input[type=email]{direction:ltr;text-align:start}
@media(prefers-reduced-motion:reduce){[data-affection-flower]{animation:none!important;transition:none!important}}
`;
