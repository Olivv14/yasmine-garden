// LOCAL ONLY: serve a scratch copy of dist/ and forward Supabase paths to a local stack, same origin.
// The copy must be prepared with dev/prepare-local-site.sh (it relaxes the project-URL check in that copy only).
// Usage: SUPABASE_PUBLISHABLE_KEY=... node dev/serve-local.mjs <site-dir> [port]
import http from 'node:http';
import net from 'node:net';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(process.argv[2]??'dist'),port=Number(process.argv[3]??8766);
const UPSTREAM={host:'127.0.0.1',port:54321},key=process.env.SUPABASE_PUBLISHABLE_KEY;
if(!key)throw Error('Set SUPABASE_PUBLISHABLE_KEY (local stack only).');
// Optional: LOCAL_LOGIN_ALIASES='{"oliver":"oliver@garden-local.invalid",...}' lets the secret-word gate find the local accounts.
const aliases=process.env.LOCAL_LOGIN_ALIASES?JSON.parse(process.env.LOCAL_LOGIN_ALIASES):{};
const PROXIED=/^\/(auth|rest|realtime|storage|functions)\/v1\//;
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.mp3':'audio/mpeg','.webmanifest':'application/manifest+json','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const origin=req=>`${req.headers['x-forwarded-proto']??'http'}://${req.headers['x-forwarded-host']??req.headers.host}`;

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://x');
  if(PROXIED.test(url.pathname)){
    const up=http.request({...UPSTREAM,method:req.method,path:req.url,headers:{...req.headers,host:`${UPSTREAM.host}:${UPSTREAM.port}`}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
    up.on('error',()=>{res.writeHead(502);res.end('Local Supabase is not running.');});req.pipe(up);return;
  }
  if(url.pathname==='/public-config.json'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({supabaseUrl:origin(req),publishableKey:key,loginAliases:aliases}));return;}
  const file=path.join(root,path.normalize(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
  try{const body=await readFile(file);res.writeHead(200,{'content-type':TYPES[path.extname(file)]??'application/octet-stream','cache-control':'no-store'});res.end(body);}
  catch{res.writeHead(404);res.end('Not found');}
});
// Realtime WebSocket upgrade: pipe raw bytes to the local stack.
server.on('upgrade',(req,socket,head)=>{
  if(!PROXIED.test(req.url)){socket.destroy();return;}
  const up=net.connect(UPSTREAM.port,UPSTREAM.host,()=>{
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n`+Object.entries({...req.headers,host:`${UPSTREAM.host}:${UPSTREAM.port}`}).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');
    if(head?.length)up.write(head);up.pipe(socket);socket.pipe(up);
  });
  up.on('error',()=>socket.destroy());socket.on('error',()=>up.destroy());
});
server.listen(port,()=>console.log(`Local garden on http://localhost:${port} (backend: local Supabase only)`));
