import {build} from 'esbuild';
import {readFile,writeFile,mkdir,copyFile,access,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');await mkdir(path.join(dist,'assets'),{recursive:true});
const expected='1aa2f6330a9e5f6fa16479367c24fe6786dfb0480fd3fbf842900c926243b433';
const candidates=[path.join(root,'vendor/love-frequency-adeline-yeo.mp3'),path.resolve(root,'../../yasmine-garden-20261109/assets/love-frequency-adeline-yeo.mp3')];
let audio;for(const p of candidates){try{audio=await readFile(p);break;}catch{}}
if(!audio)throw Error('Missing licensed audio: provide vendor/love-frequency-adeline-yeo.mp3 from approved source.');
if(createHash('sha256').update(audio).digest('hex')!==expected)throw Error('Included recording checksum changed.');
await writeFile(path.join(dist,'assets/love-frequency-adeline-yeo.mp3'),audio);
await copyFile(path.join(root,'vendor/MUSIC-CREDITS.md'),path.join(dist,'MUSIC-CREDITS.md'));
await copyFile(path.join(root,'node_modules/@supabase/supabase-js/LICENSE'),path.join(dist,'SUPABASE-LICENSE.txt'));
// The 3D garden (three.js) is split into its own chunk, loaded after the app starts.
await build({entryPoints:[path.join(root,'src/app.js')],outdir:path.join(dist,'assets'),entryNames:'[name]',chunkNames:'chunks/[name]-[hash]',splitting:true,bundle:true,minify:true,format:'esm',target:['es2022'],legalComments:'eof',loader:{'.svg':'text'},metafile:true}).then(async r=>{await writeFile(path.join(dist,'build-meta.json'),JSON.stringify(r.metafile,null,2));});
const {THEME_BRIDGE_CSS}=await import('../experience/themes.mjs');
const {FONT_FILES,fontFaceCSS}=await import('../src/design/fonts.mjs');
// pixel art (mascot sprite sheets) ships as plain files next to the bundle
await cp(path.join(root,'src/assets'),path.join(dist,'assets/art'),{recursive:true});
await mkdir(path.join(dist,'assets/fonts'),{recursive:true});
for(const f of FONT_FILES)await copyFile(path.join(root,'node_modules/@fontsource',f.pkg,'files',f.file),path.join(dist,'assets/fonts',f.file));
const css=async f=>await readFile(path.join(root,f),'utf8');
// Order matters: legacy CSS, then design tokens (which remap legacy variables), then the design layer.
await writeFile(path.join(dist,'assets/app.css'),[fontFaceCSS('./fonts/'),await css('src/styles.css'),THEME_BRIDGE_CSS,await css('src/experience.css'),await css('src/native.css'),await css('src/design/tokens.css'),await css('src/design/app.css'),await css('src/garden/garden.css'),await css('src/games/games.css'),await css('src/games/toad-cards.css'),await css('src/games/scene-art.css'),await css('src/games/piano-dance.css'),await css('src/shop/shop.css'),await css('src/us/dusk-pages.css'),await css('src/learn/learn.css'),await css('src/talk/talk-media.css'),await css('src/us/us-redo.css'),await css('src/talk/bottles.css'),await css('src/notify/inbox.css'),await css('src/design/shell.css'),await css('src/design/dusk-all.css')].join('\n'));
// Music adds exact hosts only: Spotify covers (img), LRCLIB lyrics and Spotify/YouTube song-name lookups (connect).
let csp="default-src 'none'; script-src 'self' https://sdk.scdn.co; style-src 'self'; font-src 'self'; img-src 'self' blob: data: https://*.supabase.co https://i.scdn.co https://image-cdn-fa.spotifycdn.com https://image-cdn-ak.spotifycdn.com; media-src 'self' blob:; connect-src 'self' https://api.spotify.com https://accounts.spotify.com https://*.spotify.com wss://*.spotify.com https://*.scdn.co https://*.supabase.co wss://*.supabase.co https://lrclib.net https://open.spotify.com https://www.youtube.com; worker-src 'self'; frame-src https://sdk.scdn.co; manifest-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'";
const template=await readFile(path.join(root,'src/template.html'),'utf8');if(!template.includes('__CSP__'))throw Error('CSP marker missing.');
await writeFile(path.join(dist,'index.html'),template.replace('__CSP__',`<meta http-equiv="Content-Security-Policy" content="${csp}">`));
await copyFile(path.join(root,'public-config.example.json'),path.join(dist,'public-config.example.json'));
// No config fallback: build does not invent a project. Parent supplies runtime public-config.json.
try{await access(path.join(root,'public-config.json'));await copyFile(path.join(root,'public-config.json'),path.join(dist,'public-config.json'));}catch{}
await cp(path.join(root,'push'),path.join(dist,'push'),{recursive:true,filter:source=>!/(?:test|regressions|generate-icons)/.test(path.basename(source))});
await writeFile(path.join(dist,'sw.js'),"importScripts('./push/service-worker.js');\n");
await copyFile(path.join(root,'push-config.example.json'),path.join(dist,'push-config.example.json'));
try{await access(path.join(root,'push-config.json'));await copyFile(path.join(root,'push-config.json'),path.join(dist,'push-config.json'));}catch{}
await writeFile(path.join(dist,'.nojekyll'),'');
console.log('Built dist/index.html + local JS/CSS/audio. Audio SHA-256 verified. No root artifact replaced.');
