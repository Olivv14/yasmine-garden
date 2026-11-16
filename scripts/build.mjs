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
await build({entryPoints:[path.join(root,'src/app.js')],outfile:path.join(dist,'assets/app.js'),bundle:true,minify:true,format:'esm',target:['es2022'],legalComments:'eof',metafile:true}).then(async r=>{await writeFile(path.join(dist,'build-meta.json'),JSON.stringify(r.metafile,null,2));});
const {THEME_BRIDGE_CSS}=await import('../experience/themes.mjs');
await writeFile(path.join(dist,'assets/app.css'),await readFile(path.join(root,'src/styles.css'),'utf8')+'\n'+THEME_BRIDGE_CSS+'\n'+await readFile(path.join(root,'src/experience.css'),'utf8')+'\n'+await readFile(path.join(root,'src/native.css'),'utf8'));
let csp="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data: https://*.supabase.co; media-src 'self' blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'";
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
