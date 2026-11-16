// node dev/build-preview.mjs -> dev/out/ (dev-only, never deployed)
import {build} from 'esbuild';import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const out=new URL('./out/',import.meta.url);await mkdir(out,{recursive:true});
await build({entryPoints:[new URL('./preview.js',import.meta.url).pathname],outfile:new URL('preview.bundle.js',out).pathname,bundle:true,format:'esm',target:['es2022']});
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const {fontFaceCSS,FONT_FILES}=await import('../src/design/fonts.mjs');await mkdir(new URL('fonts/',out),{recursive:true});
for(const f of FONT_FILES)await copyFile(new URL(`../node_modules/@fontsource/${f.pkg}/files/${f.file}`,import.meta.url),new URL('fonts/'+f.file,out));
await writeFile(new URL('preview.css',out),[fontFaceCSS('./fonts/'),await read('src/design/tokens.css'),await read('src/design/app.css'),await read('src/garden/garden.css'),'body.preview{margin:0;padding:16px;background:var(--bg);color:var(--ink);font-family:var(--font-sans)}.specimens{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}.specimens figure{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:12px;text-align:center;font-size:11px;padding:4px}'].join('\n'));
await copyFile(new URL('./preview.html',import.meta.url),new URL('index.html',out));console.log('dev/out ready');
