// Rebuilds supabase/functions/*/bundle.js, the single file each Edge Function deploys.
// Shared push code (push/*.mjs, _shared/*.ts) is inlined; npm:/jsr: imports stay remote.
// Run after changing push/ or supabase/functions/: node scripts/bundle-functions.mjs
import {build} from 'esbuild';
const root=new URL('../',import.meta.url).pathname;
for(const name of ['dispatch-thought','dispatch-notification']){
  await build({entryPoints:[`${root}supabase/functions/${name}/index.ts`],outfile:`${root}supabase/functions/${name}/bundle.js`,
    bundle:true,format:'esm',platform:'neutral',target:['es2022'],external:['npm:*','jsr:*'],logLevel:'warning'});
  console.log('bundled',name);
}
