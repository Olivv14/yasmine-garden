// The 3D garden on the home screen: a small Mediterranean island modelled in code, with Dar Yasmine
// (Tunisia), Casa Oliver (Italy), a toad playing guitar, and things from Tunisia and Venezuela to discover.
// Loaded on its own after the app starts. It reads nothing from the network and stores nothing.
// mountGarden(element,{light,reducedMotion}) resolves to a small API; see the end of this file.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {Water} from 'three/addons/objects/Water.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';


import {moonPhase,moonLight,isFullMoon,nextShootingStar} from './sky.js';
export async function mountGarden(GEL,{light='night',reducedMotion=false}={}){
const G={},reduce=reducedMotion;
let LIGHT=['day','dusk','night'].includes(light)?light:'night';const VIEW='home';
const W=GEL.clientWidth||375, H=GEL.clientHeight||420;
const PR=Math.min(devicePixelRatio||1,2);

// ---------- seeded random + value noise ----------
let seed=7;const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return ((seed>>>0)%100000)/100000;};
const rr=(a,b)=>a+(b-a)*rnd();
const hash=(x,y)=>{const s=Math.sin(x*127.1+y*311.7)*43758.5453;return s-Math.floor(s);};
const noise=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hash(xi,yi),b=hash(xi+1,yi),c=hash(xi,yi+1),d=hash(xi+1,yi+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;};

// ---------- palette per light ----------
const PALS={
 day:{skyTop:'#1E6CCB',skyBot:'#8FC6EE',fog:'#A9D2F0',sea:'#2A85B8',seaDeep:'#0F5A86',sun:'#FFE7C2',sunI:3.6,sunPos:[10,8,6],hemiSky:'#BFDDFF',hemiGnd:'#8C7752',hemiI:.75,env:.35,lamp:0,exposure:1.0,bloom:0},
 dusk:{skyTop:'#3B2B66',skyBot:'#FF9F6E',fog:'#F2A27D',sea:'#5B4E8C',seaDeep:'#3A2F6A',sun:'#FFAE6A',sunI:2.8,sunPos:[12,4,-14],hemiSky:'#FFC8A8',hemiGnd:'#5A3A4A',hemiI:.9,env:.35,lamp:.6,exposure:1.05,bloom:.55},
 night:{skyTop:'#070B22',skyBot:'#23356A',fog:'#1B2752',sea:'#13254F',seaDeep:'#0A1636',sun:'#A9BCFF',sunI:.9,sunPos:[-8,12,-5],hemiSky:'#3C4F92',hemiGnd:'#1A1530',hemiI:.55,env:.12,lamp:1,exposure:1.15,bloom:1.05},
};let P=PALS[LIGHT];

// ---------- renderer ----------
// HD: antialiasing on every phone (cheap on phone GPUs), soft shadow edges, textures sharp at grazing angles
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(PR);renderer.setSize(W,H);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=P.exposure;
renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
GEL.append(renderer.domElement);

const scene=new THREE.Scene();
scene.fog=new THREE.Fog(P.fog,45,140);
const pmrem=new THREE.PMREMGenerator(renderer);
scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=P.env;

// sky dome: vertical gradient + sun / moon glow
const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{top:{value:new THREE.Color(P.skyTop)},bot:{value:new THREE.Color(P.skyBot)},sunDir:{value:new THREE.Vector3(...P.sunPos).normalize()},glow:{value:new THREE.Color(LIGHT==='night'?'#C9D6FF':'#FFE2B0')},gs:{value:LIGHT==='night'?.35:LIGHT==='dusk'?.42:.6}},
 vertexShader:'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'uniform vec3 top,bot,glow,sunDir;uniform float gs;varying vec3 vP;void main(){float h=clamp(vP.y*2.6+.04,0.,1.);vec3 c=mix(bot,top,pow(h,.7));float s=max(dot(vP,sunDir),0.);c+=glow*(pow(s,40.)*1.4+pow(s,6.)*.25)*gs;gl_FragColor=vec4(c,1.);}'});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(200,32,16),skyMat));

// ---------- materials ----------
const M=(color,o={})=>new THREE.MeshStandardMaterial({color,roughness:.85,metalness:0,...o});
const mat={
 stucco:M('#F5EFE4',{roughness:.95}),stuccoWarm:M('#EFE3CF',{roughness:.95}),
 rock:M('#D9B98C',{flatShading:true,roughness:1}),rockDark:M('#B88F63',{flatShading:true,roughness:1}),
 grass:M('#6FAF4E',{roughness:1}),grassDark:M('#4E8F3A',{flatShading:true,roughness:1}),
 stone:M('#E8DCC6',{roughness:.9}),stoneDark:M('#CDBB9D',{roughness:.9}),
 terra:M('#C8683F',{roughness:.8}),terraDark:M('#A44F2E',{roughness:.8}),
 soil:M('#5B3B26',{roughness:1}),wood:M('#8A5A36',{roughness:.75}),woodDark:M('#6A4127',{roughness:.75}),
 blue:M('#1F5FB0',{roughness:.55}),blueLight:M('#3E86D6',{roughness:.55}),stud:M('#1A1A22',{roughness:.4,metalness:.6}),
 olive:M('#8FA266',{flatShading:true,roughness:.95}),oliveLight:M('#AEBF86',{flatShading:true,roughness:.95}),
 cypress:M('#2F5A35',{flatShading:true,roughness:.95}),leaf:M('#4C8A3A',{flatShading:true}),leafLight:M('#73AE4E',{flatShading:true}),
 bougain:M('#D9318A',{flatShading:true,roughness:.8}),bougain2:M('#F25BA8',{flatShading:true,roughness:.8}),
 wisteria:M('#9A7FE0',{flatShading:true}),wisteria2:M('#C2B0F5',{flatShading:true}),
 lemon:M('#F6D33C',{roughness:.6}),water:new THREE.MeshPhysicalMaterial({color:'#5FB3E0',roughness:.08,metalness:0,transmission:.2,transparent:true,opacity:.86,clearcoat:1}),
 sea:M(P.sea,{flatShading:true,roughness:.5,metalness:.02}),foam:M('#E8F4F8',{flatShading:true,roughness:1,transparent:true,opacity:.85}),
 white:M('#FFFFFF'),ink:M('#1B1530'),
 lamp:new THREE.MeshStandardMaterial({color:'#FFE3A6',emissive:'#FFC764',emissiveIntensity:P.lamp*3.2,roughness:.4}),
 bulb:new THREE.MeshStandardMaterial({color:'#FFF2C8',emissive:'#FFD27A',emissiveIntensity:P.lamp*5,roughness:.3}),
 window:new THREE.MeshStandardMaterial({color:LIGHT==='day'?'#2B4F7A':'#FFD38A',emissive:'#FFB860',emissiveIntensity:P.lamp*1.8}),
 green:M('#12A150'),red:M('#EE3B3B'),flagWhite:M('#FAFAF5'),
};
const mesh=(geo,m,{cast=true,recv=true}={})=>{const o=new THREE.Mesh(geo,m);o.castShadow=cast;o.receiveShadow=recv;return o;};
const at=(o,x,y,z,s)=>{o.position.set(x,y,z);if(s!==undefined)(typeof s==='number'?o.scale.setScalar(s):o.scale.set(...s));return o;};
const group=(...c)=>{const g=new THREE.Group();g.add(...c);return g;};
const blob=(r,m,detail=1)=>mesh(new THREE.IcosahedronGeometry(r,detail),m);
// a real leaf blade (almond shape) and a clump of them, used wherever small foliage grows
const leafS=new THREE.Shape();leafS.moveTo(0,0);leafS.quadraticCurveTo(.55,.42,0,1);leafS.quadraticCurveTo(-.55,.42,0,0);
const leafG=new THREE.ShapeGeometry(leafS,5);
mat.bougD=M('#D9318A',{side:THREE.DoubleSide,roughness:.7});mat.boug2D=M('#F25BA8',{side:THREE.DoubleSide,roughness:.7});
mat.leafD=M('#3F7F33',{side:THREE.DoubleSide,roughness:.7});mat.leafLightD=M('#69A845',{side:THREE.DoubleSide,roughness:.7});
const UP=new THREE.Vector3(0,1,0);const BOUG=[mat.bougD,mat.boug2D,mat.bougD,mat.leafD];
const foliage=(r,flat=0,ms)=>{const g=new THREE.Group();const n=r>.12?8:6;for(let i=0;i<n;i++){const l=mesh(leafG,ms?ms[i%ms.length]:rnd()>.45?mat.leafD:mat.leafLightD,{cast:r>.09});const s=r*rr(.95,1.3);l.scale.set(s*.85,s*1.25,1);
 const a=i/n*6.28+rr(0,.6),e=flat?rr(-.15,.25):rr(-.5,.9);const d=new THREE.Vector3(Math.cos(a)*Math.cos(e),Math.sin(e),Math.sin(a)*Math.cos(e));
 l.quaternion.setFromUnitVectors(UP,d);l.rotateY(rr(0,3.14));l.position.copy(d).multiplyScalar(-r*.15);g.add(l);}return g;};
// one shared jasmine flower: five white petals, brighter at night
const jasS=new THREE.Shape();for(let k=0;k<5;k++){const a=k/5*Math.PI*2+Math.PI/2,b=a+Math.PI/5;const R=.036,r=.01;if(!k)jasS.moveTo(Math.cos(a-Math.PI/5)*r,Math.sin(a-Math.PI/5)*r);jasS.quadraticCurveTo(Math.cos(a-.35)*R*1.25,Math.sin(a-.35)*R*1.25,Math.cos(a)*R,Math.sin(a)*R);jasS.quadraticCurveTo(Math.cos(a+.35)*R*1.25,Math.sin(a+.35)*R*1.25,Math.cos(b)*r,Math.sin(b)*r);}
const jasG=new THREE.ShapeGeometry(jasS,3);const jasM=new THREE.MeshStandardMaterial({color:'#FFFFFF',side:THREE.DoubleSide,roughness:.5,emissive:'#FFFFFF',emissiveIntensity:LIGHT==='night'?.35:.06});
const jasmineAt=(parent,pos,dir)=>{const st=new THREE.Mesh(jasG,jasM);st.position.copy(pos);st.lookAt(pos.clone().add(dir));st.rotateZ(rnd()*6);parent.add(st);return st;};

// ---------- island ----------
// IR: the island's radius at the lawn (it was 6.2; now roomier). IK scales everything around the edge with it.
const IR=7.0,IK=IR/6.2;
const world=new THREE.Group();scene.add(world);
{ // cliff: irregular cylinder, wider at the bottom
 const g=new THREE.CylinderGeometry(IR,7.2*IK,2.4,84,6,false);const p=g.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const a=Math.atan2(z,x);const n=noise(a*3+7,y*1.3)*0.9+noise(a*9,y*3)*0.35;const k=1+(n-.5)*.16;if(Math.abs(y)<1.19){p.setX(i,x*k);p.setZ(i,z*k);}p.setY(i,y+(noise(a*5,3)-.5)*.25*(y<0?1:0));}
 g.computeVertexNormals();{const cols=[];const top=new THREE.Color('#E6C9A0'),mid=new THREE.Color('#C99A68'),low=new THREE.Color('#9C7350');for(let i=0;i<p.count;i++){const y=p.getY(i),a=Math.atan2(p.getZ(i),p.getX(i));const t=(y+1.2)/2.4+(noise(a*4,y*2)-.5)*.25;const c=t>.55?mid.clone().lerp(top,(t-.55)/.45):low.clone().lerp(mid,Math.max(0,t)/.55);cols.push(c.r,c.g,c.b);}g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));}const cliff=mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1}));cliff.position.y=-1.2;world.add(cliff);
 // strata band
 const band=mesh(new THREE.TorusGeometry(6.35*IK,.12,6,84),mat.rockDark);band.rotation.x=Math.PI/2;band.position.y=-.7;world.add(band);
 // lawn cap
 const lawn=mesh(new THREE.CylinderGeometry(6.05*IK,6.15*IK,.18,84),mat.grass);lawn.position.y=.0;world.add(lawn);
 // terracotta coping around the edge, gap at the front for the steps
 for(let i=0;i<170;i++){const a=i/170*Math.PI*2;if(Math.abs(Math.atan2(Math.sin(a),Math.cos(a))-Math.PI/2.6)<.16)continue;const c=mesh(new THREE.BoxGeometry(.27,.14,.3),i%5===0?mat.terraDark:mat.terra);c.position.set(Math.cos(a)*6.0*IK,.14,Math.sin(a)*6.0*IK);c.rotation.y=-a+Math.PI/2;world.add(c);}
 // lawn variation and grass tufts
 {const lp=lawn.geometry.attributes.position;const cols=[];const g1=new THREE.Color('#78B652'),g2=new THREE.Color('#5E9E43');for(let i=0;i<lp.count;i++){const t=noise(lp.getX(i)*.6+3,lp.getZ(i)*.6);const c=g2.clone().lerp(g1,t);cols.push(c.r,c.g,c.b);}lawn.geometry.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));lawn.material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});}
 for(let i=0;i<220;i++){const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*5.6*IK;const t=new THREE.Group();for(let k=0;k<3;k++){const bl=mesh(new THREE.ConeGeometry(.035,rr(.14,.26),4),rnd()>.5?mat.grassDark:mat.leafLight,{cast:false});bl.position.set(rr(-.05,.05),.1,rr(-.05,.05));bl.rotation.set(rr(-.3,.3),0,rr(-.3,.3));t.add(bl);}t.position.set(Math.cos(a)*r,0,Math.sin(a)*r);world.add(t);}
 // ivy spilling over the cliff edge
 for(let i=0;i<26;i++){const a=rnd()*Math.PI*2;if(Math.abs(Math.atan2(Math.sin(a),Math.cos(a))-Math.PI/2.6)<.3)continue;const len=Math.floor(rr(3,8));for(let k=0;k<len;k++){const r=6.15*IK+k*.04,b=foliage(rr(.1,.15));b.position.set(Math.cos(a+rr(-.03,.03))*r,.05-k*.2,Math.sin(a+rr(-.03,.03))*r);world.add(b);}}
 // little rocks at the waterline
 for(let i=0;i<46;i++){const a=rnd()*Math.PI*2,r=rr(7.2*IK,8.3*IK);const b=blob(rr(.25,.7),rnd()>.5?mat.rock:mat.rockDark,0);b.position.set(Math.cos(a)*r,-2.3+rr(-.1,.2),Math.sin(a)*r);b.rotation.set(rnd()*3,rnd()*3,rnd()*3);b.scale.y=.6;world.add(b);}
}
// sea: faceted low-poly water + foam ring
{// tileable wave normal map, drawn in code (integer frequencies so it repeats seamlessly)
 const N=256,cv=document.createElement('canvas');cv.width=cv.height=N;const cx=cv.getContext('2d'),img=cx.createImageData(N,N);
 const WV=[[1,2,.5,.3],[3,1,.35,1.1],[2,5,.22,2.2],[7,3,.13,.7],[5,9,.08,1.9],[11,6,.05,.4],[13,17,.03,2.8]];
 const hgt=(u,v)=>{let t=0;for(const [a,b,amp,ph] of WV)t+=amp*(Math.sin(2*Math.PI*(a*u+b*v)+ph)+Math.sin(2*Math.PI*(b*u-a*v)+ph*1.7));return t;};
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){const u=x/N,v=y/N,e=1/N;const dx=(hgt(u+e,v)-hgt(u-e,v))/(2*e)*.016,dy=(hgt(u,v+e)-hgt(u,v-e))/(2*e)*.016;const l=Math.hypot(dx,dy,1);const k=(y*N+x)*4;img.data[k]=(-dx/l*.5+.5)*255;img.data[k+1]=(-dy/l*.5+.5)*255;img.data[k+2]=(1/l*.5+.5)*255;img.data[k+3]=255;}
 cx.putImageData(img,0,0);const wn=new THREE.CanvasTexture(cv);wn.wrapS=wn.wrapT=THREE.RepeatWrapping;
 const water=new Water(new THREE.PlaneGeometry(420,420),{textureWidth:512,textureHeight:512,waterNormals:wn,sunDirection:new THREE.Vector3(...P.sunPos).normalize(),sunColor:new THREE.Color(P.sun),waterColor:new THREE.Color(P.seaDeep),distortionScale:LIGHT==='night'?1.2:2.0,fog:true});
 water.rotation.x=-Math.PI/2;water.position.y=-2.4;water.material.uniforms.size.value=2.2;water.material.uniforms.time.value=3.7;scene.add(water);G.water=water;
 // turquoise shallows fading out around the island
 const sc=document.createElement('canvas');sc.width=sc.height=256;const sx=sc.getContext('2d');G.drawShallows=L=>{const gr=sx.createRadialGradient(128,128,40,128,128,128);const sh=L==='night'?'30,80,110':L==='dusk'?'90,170,170':'60,200,190';gr.addColorStop(0,`rgba(${sh},.0)`);gr.addColorStop(.45,`rgba(${sh},${L==='night'?.35:.75})`);gr.addColorStop(.62,`rgba(${sh},.45)`);gr.addColorStop(1,`rgba(${sh},0)`);sx.clearRect(0,0,256,256);sx.fillStyle=gr;sx.fillRect(0,0,256,256);if(G.shallowTex)G.shallowTex.needsUpdate=true;};G.drawShallows(LIGHT);
 const shallow=new THREE.Mesh(new THREE.PlaneGeometry(26*IK,26*IK),new THREE.MeshBasicMaterial({map:(G.shallowTex=new THREE.CanvasTexture(sc)),transparent:true,depthWrite:false,fog:true}));shallow.rotation.x=-Math.PI/2;shallow.position.y=-2.37;scene.add(shallow);
 const fg=new THREE.TorusGeometry(7.55*IK,.13,5,80);const fp=fg.attributes.position;for(let i=0;i<fp.count;i++){const a=Math.atan2(fp.getY(i),fp.getX(i));const k=1+(noise(a*6,1)-.5)*.08;fp.setX(i,fp.getX(i)*k);fp.setY(i,fp.getY(i)*k);}const foam=mesh(fg,mat.foam,{cast:false});foam.rotation.x=Math.PI/2;foam.position.y=-2.33;foam.scale.z=.3;scene.add(foam);}

// ---------- stone steps carved down the front-right cliff ----------
{const a0=Math.PI/2.6;for(let i=0;i<9;i++){const a=a0+i*.035,r=6.15*IK+i*.17;const s=mesh(new THREE.BoxGeometry(.9,.18,.36),mat.stone);s.position.set(Math.cos(a)*r,-.1-i*.25,Math.sin(a)*r);s.rotation.y=-a+Math.PI/2;world.add(s);}}

// ---------- rowboat moored at the steps ----------
{const b=new THREE.Group();const hull=mesh(new THREE.SphereGeometry(1,24,12,0,Math.PI*2,Math.PI/2,Math.PI/2),M('#F4EFE6',{roughness:.6,side:THREE.DoubleSide}));const inner=mesh(new THREE.CircleGeometry(.98,24),mat.wood);inner.rotation.x=-Math.PI/2;inner.position.y=-.22;inner.scale.set(1,.9,1);b.add(inner);hull.scale.set(1.25,.42,.5);hull.rotation.x=0;b.add(hull);
 const rim=mesh(new THREE.TorusGeometry(1,.05,6,32),mat.wood);rim.rotation.x=Math.PI/2;rim.scale.set(1.25,.5,1);b.add(rim);
 const cols=[mat.green,mat.flagWhite,mat.red];for(let i=0;i<3;i++){const st=mesh(new THREE.TorusGeometry(1,.06,6,32,Math.PI*.9),cols[i]);st.rotation.x=Math.PI/2;st.scale.set(1.25-.0*i,.5,1);st.position.y=-.1-i*.1;st.rotation.z=.15;b.add(st);}
 for(const x of [-.4,.35]){const seat=mesh(new THREE.BoxGeometry(.12,.05,.85),mat.wood);seat.position.set(x,-.05,0);b.add(seat);}
 const oar=mesh(new THREE.CylinderGeometry(.025,.025,1.6,6),mat.woodDark);oar.rotation.z=1.2;oar.position.set(.2,0,.45);b.add(oar);
 b.position.set(Math.cos(Math.PI/2.6+.25)*8.7*IK,-2.2,Math.sin(Math.PI/2.6+.25)*8.7*IK);b.rotation.y=-.9;world.add(b);}
// ---------- path pavers ----------
const paver=(x,z,rot=0,s=1)=>{const g=new THREE.CylinderGeometry(.34*s,.36*s,.08,7);const m=mesh(g,rnd()>.4?mat.stone:mat.stoneDark);m.position.set(x,.1,z);m.rotation.y=rot;m.scale.z=rr(.75,1);world.add(m);};
for(let i=0;i<9;i++){const t=i/8;const x=THREE.MathUtils.lerp(2.2,0.2,t)+Math.sin(t*3)*.4,z=THREE.MathUtils.lerp(5.2,1.6,t);paver(x,z,rnd()*3);}
for(let i=0;i<5;i++){const t=i/4;paver(THREE.MathUtils.lerp(-.2,-.1,t)+rr(-.1,.1),THREE.MathUtils.lerp(-1.7,-3.0,t),rnd()*3,.9);}

// ---------- back wall with Tunisian blue door ----------
{const wall=new THREE.Group();world.add(wall);
 const seg=(x0,x1,h,z)=>{const w=x1-x0;const m=mesh(new THREE.BoxGeometry(w,h,.32),mat.stucco);m.position.set((x0+x1)/2,h/2+.08,z);wall.add(m);const cap=mesh(new THREE.CylinderGeometry(.18,.18,w,10),mat.stuccoWarm);cap.rotation.z=Math.PI/2;cap.position.set((x0+x1)/2,h+.1,z);wall.add(cap);return m;};
 seg(-3.3,-.75,1.9,-3.7);{const it=seg(.75,4.2,1.9,-3.7);it.material=M('#E8B877',{roughness:.95});for(let k=0;k<16;k++){const tl=mesh(new THREE.CylinderGeometry(.11,.11,.42,10,1,false,0,Math.PI),k%3?mat.terra:mat.terraDark);tl.rotation.x=Math.PI/2;tl.position.set(.85+k*.215,2.1,-3.7);wall.add(tl);}}
 // arch above the door
 const sh=new THREE.Shape();sh.moveTo(-.75,0);sh.lineTo(-.75,1.05);sh.absarc(0,1.05,.75,Math.PI,0,true);sh.lineTo(.75,0);sh.lineTo(1.0,0);sh.lineTo(1.0,2.35);sh.lineTo(-1.0,2.35);sh.lineTo(-1.0,0);
 const hole=new THREE.Path();hole.moveTo(-.62,0);hole.lineTo(-.62,1.02);hole.absarc(0,1.02,.62,Math.PI,0,true);hole.lineTo(.62,0);
 const archG=new THREE.ExtrudeGeometry(sh,{depth:.37,bevelEnabled:false,curveSegments:24});const arch=mesh(archG,mat.stucco);arch.position.set(0,.08,-3.885);wall.add(arch);
 // door: arched blue panel with studs and a yellow ochre frame
 const ds=new THREE.Shape();ds.moveTo(-.62,0);ds.lineTo(-.62,1.02);ds.absarc(0,1.02,.62,Math.PI,0,true);ds.lineTo(.62,0);ds.lineTo(-.62,0);
 const door=mesh(new THREE.ExtrudeGeometry(ds,{depth:.08,bevelEnabled:true,bevelSize:.02,bevelThickness:.02,curveSegments:24}),mat.blue);door.position.set(0,.08,-3.72);wall.add(door);
 const frame=mesh(new THREE.TorusGeometry(.66,.05,8,32,Math.PI),M('#E3B04B'));frame.position.set(0,1.1,-3.62);wall.add(frame);
 for(let r=0;r<5;r++)for(let c=0;c<3;c++){const s=mesh(new THREE.SphereGeometry(.035,8,6),mat.stud);s.position.set(-.3+c*.3,.35+r*.3,-3.6);wall.add(s);}
 const knocker=mesh(new THREE.TorusGeometry(.08,.015,6,16),M('#C99A3A',{metalness:.7,roughness:.3}));knocker.position.set(.0,.95,-3.58);wall.add(knocker);
 // windows with blue shutters
 for(const x of [-2.4,2.6]){const w=mesh(new THREE.BoxGeometry(.55,.65,.05),mat.window,{cast:false});w.position.set(x,1.15,-3.52);wall.add(w);
  for(const sx of [-1,1]){const sh2=mesh(new THREE.BoxGeometry(.28,.7,.04),x>0?M('#3E7B4C',{roughness:.6}):mat.blueLight);sh2.position.set(x+sx*.43,1.15,-3.49);sh2.rotation.y=sx*.35;wall.add(sh2);}
  const sill=mesh(new THREE.BoxGeometry(.75,.06,.18),mat.stuccoWarm);sill.position.set(x,.8,-3.47);wall.add(sill);
  for(let k=0;k<3;k++){const pot=mesh(new THREE.CylinderGeometry(.07,.05,.12,10),mat.terra);pot.position.set(x-.2+k*.2,.89,-3.45);wall.add(pot);const fl=blob(.08,k%2?mat.bougain:M('#F25F3A',{flatShading:true}),0);fl.position.set(x-.2+k*.2,1.0,-3.45);wall.add(fl);}}
 // the wall ends in proper pillars instead of stopping in the middle of the lawn
 for(const x of [-3.42,4.32]){const pl=mesh(new THREE.BoxGeometry(.42,2.25,.5),mat.stuccoWarm);pl.position.set(x,1.205,-3.7);wall.add(pl);const pc=mesh(new THREE.BoxGeometry(.52,.1,.6),mat.stucco);pc.position.set(x,2.38,-3.7);wall.add(pc);const urn=mesh(new THREE.SphereGeometry(.16,12,8),mat.terra);urn.position.set(x,2.55,-3.7);wall.add(urn);}
}
// bougainvillea spilling over the right of the wall
const bougWall=(x0,x1,n)=>{for(let i=0;i<n;i++){const x=rr(x0,x1),t=(x-x0)/(x1-x0),drop=Math.sin(t*Math.PI)*.9;const onTop=rnd()<.3;const b=foliage(rr(.11,.19),1,rnd()>.3?BOUG:undefined);
 if(onTop){b.position.set(x,2.2,-3.7+rr(-.1,.1));b.scale.y=.5;}else{b.position.set(x,rr(2.05-drop,2.1),-3.5);b.rotation.x=Math.PI/2;b.scale.y=.45;}world.add(b);}};
bougWall(1.0,4.0,110);bougWall(-3.15,-1.05,45);


// ---------- trees ----------
const cypress=(x,z,h)=>{const pts=[];for(let i=0;i<=12;i++){const t=i/12;pts.push(new THREE.Vector2(Math.sin(Math.PI*Math.pow(t,.8))*.55*(1-t*.25)+.02,t*h));}const c=mesh(new THREE.LatheGeometry(pts,9),mat.cypress);c.position.set(x,.05,z);world.add(c);const tr=mesh(new THREE.CylinderGeometry(.08,.1,.3,6),mat.woodDark);tr.position.set(x,.15,z);world.add(tr);};
cypress(4.5,-2.6,4.6);cypress(5.0,-1.2,3.6);
// olive tree: twisted trunk + faceted silver-green canopy
{const og=new THREE.Group();og.position.set(-2.25,0,2.48);og.scale.setScalar(.85);world.add(og);}
{const og=world.children.at(-1);const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-3.0,0,-.8),new THREE.Vector3(-3.25,.6,-.7),new THREE.Vector3(-2.9,1.2,-.9),new THREE.Vector3(-3.15,1.8,-.75),new THREE.Vector3(-2.9,2.3,-.8)]);
 og.add(mesh(new THREE.TubeGeometry(curve,30,.17,8,false),mat.woodDark));
 for(const [dx,dy,dz] of [[.7,.5,.3],[-.7,.4,-.2],[.2,.6,-.6]]){const b=new THREE.CatmullRomCurve3([new THREE.Vector3(-3.0,1.7,-.8),new THREE.Vector3(-3.0+dx*.6,1.7+dy*.6,-.8+dz*.6),new THREE.Vector3(-3.0+dx,1.7+dy+.2,-.8+dz)]);og.add(mesh(new THREE.TubeGeometry(b,10,.07,6,false),mat.woodDark));}
 for(let i=0;i<34;i++){const a=rnd()*Math.PI*2,r=rr(0,1.25),b=blob(rr(.38,.62),rnd()>.45?mat.olive:mat.oliveLight,1);b.position.set(-3.0+Math.cos(a)*r,rr(2.1,3.0)-r*.2,-.8+Math.sin(a)*r*.85);b.scale.y=.75;og.add(b);}
 for(let i=0;i<22;i++){const o=mesh(new THREE.SphereGeometry(.05,6,4),M('#3B3A57'));o.position.set(-3.0+rr(-1.1,1.1),rr(1.9,2.6),-.8+rr(-.9,.9));og.add(o);}}

// ---------- pergola with wisteria, string lights and tricolore bunting ----------
const lights=[];
{const px=2.3,pz=-.4,w=2.6,d=2.0,h=2.35;const g=new THREE.Group();g.position.set(px,0,pz);g.rotation.y=-.35;world.add(g);
 for(const [x,z] of [[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2]]){const p=mesh(new THREE.BoxGeometry(.16,h,.16),mat.wood);p.position.set(x,h/2+.05,z);g.add(p);const base=mesh(new THREE.BoxGeometry(.26,.12,.26),mat.stone);base.position.set(x,.12,z);g.add(base);}
 for(const z of [-d/2,d/2]){const b=mesh(new THREE.BoxGeometry(w+.5,.16,.14),mat.wood);b.position.set(0,h+.08,z);g.add(b);}
 for(let i=0;i<7;i++){const b=mesh(new THREE.BoxGeometry(.1,.1,d+.5),mat.woodDark);b.position.set(-w/2-.1+i*(w+.2)/6,h+.2,0);g.add(b);}
 // wisteria clusters hanging from the slats
 for(let i=0;i<38;i++){const x=rr(-w/2,w/2),z=rr(-d/2,d/2);const len=rr(.55,1.0);for(let k=0;k<7;k++){const r=.17*(1-k/8);const b=blob(r,k%2?mat.wisteria:mat.wisteria2,0);b.position.set(x+rr(-.03,.03),h+.12-k*len/6,z+rr(-.03,.03));g.add(b);}if(i%3===0){const lf=foliage(.14,1);lf.position.set(x,h+.25,z);g.add(lf);}}
 // string lights along the front beam
 for(let i=0;i<=10;i++){const t=i/10;const x=-w/2-.2+t*(w+.4),y=h-.05-Math.sin(t*Math.PI)*.28;const b=mesh(new THREE.SphereGeometry(.05,10,8),mat.bulb,{cast:false});b.position.set(x,y,d/2+.05);g.add(b);lights.push(b);}
 // tricolore bunting under the back beam
 const cols=[mat.green,mat.flagWhite,mat.red];for(let i=0;i<9;i++){const t=i/8;const x=-w/2+t*w,y=h-.02-Math.sin(t*Math.PI)*.22;const sh=new THREE.Shape();sh.moveTo(-.11,0);sh.lineTo(.11,0);sh.lineTo(0,-.24);sh.lineTo(-.11,0);const f=mesh(new THREE.ShapeGeometry(sh),cols[i%3]);f.material=f.material.clone();f.material.side=THREE.DoubleSide;f.position.set(x,y,-d/2-.02);g.add(f);}
 // bench for two, guitar and football: Oliver and Yasmine were here
 const bench=new THREE.Group();bench.position.set(0,0,-.35);g.add(bench);
 for(let i=0;i<4;i++){const s=mesh(new THREE.BoxGeometry(1.5,.05,.1),mat.wood);s.position.set(0,.48,-.18+i*.12);bench.add(s);}
 for(let i=0;i<3;i++){const s=mesh(new THREE.BoxGeometry(1.5,.08,.05),mat.wood);s.position.set(0,.65+i*.13,-.27);s.rotation.x=-.15;bench.add(s);}
 for(const x of [-.68,.68])for(const z of [-.2,.2]){const l=mesh(new THREE.BoxGeometry(.07,.46,.07),mat.woodDark);l.position.set(x,.25,z);bench.add(l);}
 const cushionG=mesh(new THREE.BoxGeometry(.42,.08,.32),mat.green);cushionG.position.set(-.38,.55,0);bench.add(cushionG);
 const cushionR=mesh(new THREE.BoxGeometry(.42,.08,.32),mat.red);cushionR.position.set(.38,.55,0);bench.add(cushionR);
 // guitar leaning on the bench
 const guitar=new THREE.Group();const gb=M('#C9853F',{roughness:.45});const gb2=M('#7A3E1D',{roughness:.5});
 const lower=mesh(new THREE.CylinderGeometry(.2,.2,.09,24),gb);lower.rotation.x=Math.PI/2;const upper=mesh(new THREE.CylinderGeometry(.15,.15,.09,24),gb);upper.rotation.x=Math.PI/2;upper.position.y=.27;
 const hole2=mesh(new THREE.CircleGeometry(.055,16),M('#1A0F0A'));hole2.position.set(0,.16,.047);
 const neck=mesh(new THREE.BoxGeometry(.06,.55,.04),gb2);neck.position.y=.66;const head=mesh(new THREE.BoxGeometry(.09,.13,.04),gb2);head.position.y=.99;
 guitar.add(lower,upper,hole2,neck,head);
 // football
 const ball=new THREE.Group();ball.add(mesh(new THREE.SphereGeometry(.13,24,16),mat.white));const ico=new THREE.IcosahedronGeometry(.13,0).attributes.position;const seen=new Set();for(let i=0;i<ico.count;i++){const v=new THREE.Vector3(ico.getX(i),ico.getY(i),ico.getZ(i));const k=v.toArray().map(n=>n.toFixed(2)).join();if(seen.has(k))continue;seen.add(k);const pt=mesh(new THREE.CircleGeometry(.045,5),mat.ink);pt.position.copy(v.clone().multiplyScalar(1.01));pt.lookAt(v.clone().multiplyScalar(2));ball.add(pt);}
 ball.position.set(-.85,.13,.45);bench.add(ball);
}

// ---------- fountain ----------
{const prof=[[0,0],[1.05,0],[1.15,.05],[1.15,.42],[1.02,.46],[.95,.12],[.22,.12],[.2,.9],[.55,.95],[.62,1.05],[.5,1.1],[.14,1.08],[.12,1.45],[.25,1.5],[.18,1.6],[0,1.62]].map(([x,y])=>new THREE.Vector2(x,y));
 const f=mesh(new THREE.LatheGeometry(prof,40),mat.stone);f.position.set(-.1,.08,-.4);world.add(f);
 const w1=mesh(new THREE.CylinderGeometry(.97,.97,.04,40),mat.water,{cast:false});w1.position.set(-.1,.42,-.4);world.add(w1);
 const w2=mesh(new THREE.CylinderGeometry(.5,.5,.03,32),mat.water,{cast:false});w2.position.set(-.1,1.07,-.4);world.add(w2);
 for(let i=0;i<10;i++){const a=i/10*Math.PI*2;const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.1,1.6,-.4),new THREE.Vector3(-.1+Math.cos(a)*.35,1.85,-.4+Math.sin(a)*.35),new THREE.Vector3(-.1+Math.cos(a)*.5,1.08,-.4+Math.sin(a)*.5));world.add(mesh(new THREE.TubeGeometry(curve,12,.018,5,false),mat.water,{cast:false}));}}

// ---------- flowers: six kinds, four stages ----------
const FL={rose:'#D9405F',marigold:'#F28A12',jasmine:'#FFFFFF',lavender:'#8E6FD8',lilium:'#FFF1E8',orchid:'#C548A8'};
const stem=(h,bend=0)=>{const c=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,0,0),new THREE.Vector3(bend*.5,h*.5,0),new THREE.Vector3(bend,h,0));return mesh(new THREE.TubeGeometry(c,8,.018,5,false),mat.leaf);};
const leafM=(x,y,rot,s=1,m=mat.leaf)=>{const l=mesh(new THREE.SphereGeometry(.1*s,8,6),m);l.scale.set(1,.18,.42);l.position.set(x,y,0);l.rotation.set(0,rot,rot>0?-.5:.5);return l;};
// the golden jasmine (a legendary prize, backend/020): a jasmine whose flowers are gold and glow a little
const goldM=new THREE.MeshStandardMaterial({color:'#F2C14E',side:THREE.DoubleSide,roughness:.28,metalness:.55,emissive:'#8A6418',emissiveIntensity:.45});
function flower(type,stage){if(type==='golden'){const j=flower('jasmine',stage);j.traverse(o=>{if(o.isMesh&&(o.material===jasM||o.material===mat.white))o.material=goldM;});return j;}
 const g=new THREE.Group();
 const mound=mesh(new THREE.SphereGeometry(.16,10,6),mat.soil);mound.scale.y=.32;g.add(mound);
 if(stage===0){const sd=mesh(new THREE.SphereGeometry(.03,8,6),M('#C9A86B'));sd.position.y=.05;g.add(sd);return g;}
 if(stage===1){g.add(stem(.18),leafM(-.07,.15,.3,.9,mat.leafLight),leafM(.07,.17,-.3,.9));return g;}
 const col=M(FL[type],{roughness:.6,flatShading:type!=='lilium'});
 if(type==='lavender'){const n=stage===2?3:6;for(let i=0;i<n;i++){const bend=rr(-.12,.12),h=stage===2?.32:rr(.5,.68);const s=stem(h,bend);s.rotation.y=i/n*Math.PI*2;g.add(s);const sp=new THREE.Group();sp.position.set(bend,0,0);sp.rotation.y=i/n*Math.PI*2;for(let k=0;k<(stage===2?3:8);k++){const b=mesh(new THREE.SphereGeometry(.035,6,5),k%2?col:M('#B39BEA',{flatShading:true}));b.position.set(bend*(1-k*.04),h-k*.04,0);sp.add(b);}g.add(sp);}return g;}
 if(type==='jasmine'){const clumps=[];
  for(let i=0;i<(stage===2?7:11);i++){const r=rr(.05,.075);const b=foliage(r);const a=rnd()*6.28,d=rr(0,.15);b.position.set(Math.cos(a)*d,rr(.08,.3)-d*.35,Math.sin(a)*d);g.add(b);clumps.push([b.position,r]);}
  if(stage===3)for(let i=0;i<20;i++){const [p,r]=clumps[i%clumps.length];const d=new THREE.Vector3(rr(-1,1),rr(.2,1.2),rr(-1,1)).normalize();jasmineAt(g,p.clone().addScaledVector(d,r*1.05),d);}
  if(stage===2)for(let i=0;i<8;i++){const [p,r]=clumps[i%clumps.length];const b=mesh(new THREE.SphereGeometry(.014,6,4),mat.white);b.position.copy(p).add(new THREE.Vector3(rr(-.02,.02),r,rr(-.02,.02)));b.scale.y=1.6;g.add(b);}return g;}
 if(type==='orchid'){const h=stage===2?.35:.6;const c=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,0,0),new THREE.Vector3(0,h,0),new THREE.Vector3(.28,h*.9,0));g.add(mesh(new THREE.TubeGeometry(c,10,.015,5,false),mat.leaf));g.add(leafM(-.08,.04,.2,1.4),leafM(.08,.04,-.2,1.3,mat.leafLight));
  const pts=stage===2?[[.2,h*.92]]:[[.1,h*.95],[.2,h*.93],[.28,h*.88]];for(const [x,y] of pts){const fl=new THREE.Group();fl.position.set(x,y-.04,.02);for(let k=0;k<5;k++){const p=mesh(new THREE.SphereGeometry(.05,8,6),col);p.scale.set(1,.55,.25);p.position.set(Math.cos(k/5*6.28)*.04,Math.sin(k/5*6.28)*.04,0);p.rotation.z=k/5*6.28;if(stage===2)p.scale.multiplyScalar(.5);fl.add(p);}const lip=mesh(new THREE.SphereGeometry(.025,8,6),M('#7A1F66'));lip.position.z=.02;fl.add(lip);g.add(fl);}return g;}
 const h=type==='lilium'?.62:type==='rose'?.56:.48;g.add(stem(stage===2?h*.75:h),leafM(-.08,h*.35,.4),leafM(.08,h*.55,-.4,1,mat.leafLight));
 const head=new THREE.Group();head.position.y=stage===2?h*.75:h;g.add(head);
 if(stage===2){const bd=mesh(new THREE.SphereGeometry(.06,10,8),col);bd.scale.set(1,1.6,1);bd.position.y=.06;head.add(bd);const cal=mesh(new THREE.ConeGeometry(.05,.07,6),mat.leaf);cal.rotation.x=Math.PI;cal.position.y=.0;head.add(cal);return g;}
 if(type==='rose'){head.add(mesh(new THREE.SphereGeometry(.07,12,10),col));for(let ring=0;ring<3;ring++){const n=5+ring*2;for(let k=0;k<n;k++){const a=k/n*6.28+ring;const p=mesh(new THREE.SphereGeometry(.06+ring*.012,10,8),col);p.scale.set(.9,.75,.35);p.position.set(Math.cos(a)*(.04+ring*.04),.02-ring*.015,Math.sin(a)*(.04+ring*.04));p.lookAt(head.position.clone().add(new THREE.Vector3(Math.cos(a)*2,1.5,Math.sin(a)*2)));head.add(p);}}}
 if(type==='marigold'){for(let ring=0;ring<3;ring++){const n=14-ring*3;for(let k=0;k<n;k++){const a=k/n*6.28+ring*.3;const p=mesh(new THREE.SphereGeometry(.05,8,6),ring===1?M('#F6B21B',{flatShading:true}):col);p.scale.set(.5,.4,1);p.position.set(Math.cos(a)*(.1-ring*.03),.02+ring*.025,Math.sin(a)*(.1-ring*.03));p.rotation.y=-a;p.rotation.x=-.4-ring*.3;head.add(p);}}head.add(at(mesh(new THREE.SphereGeometry(.035,8,6),M('#8A3A0C')),0,.08,0));}
 if(type==='lilium'){for(let k=0;k<6;k++){const a=k/6*6.28;const p=mesh(new THREE.ConeGeometry(.045,.24,8),col);p.position.set(Math.cos(a)*.08,.06,Math.sin(a)*.08);p.rotation.z=-Math.cos(a)*1.0;p.rotation.x=Math.sin(a)*1.0;head.add(p);}for(let k=0;k<5;k++){const st=mesh(new THREE.CylinderGeometry(.005,.005,.14,4),M('#7A9A3A'));const a=k/5*6.28;st.position.set(Math.cos(a)*.02,.08,Math.sin(a)*.02);head.add(st);const an=mesh(new THREE.SphereGeometry(.014,6,4),M('#B5531F'));an.position.set(Math.cos(a)*.03,.15,Math.sin(a)*.03);head.add(an);}head.add(at(mesh(new THREE.SphereGeometry(.04,8,6),M('#F2A0B4')),0,.03,0));}
 return g;}
// who planted it: a small ceramic tag in their colour
const tag=(owner)=>{const t=new THREE.Group();t.add(at(mesh(new THREE.CylinderGeometry(.008,.008,.25,4),mat.woodDark),0,.12,0));t.add(at(mesh(new THREE.BoxGeometry(.09,.06,.01),owner==='y'?mat.green:mat.red),0,.25,0));return t;};

// raised terracotta beds, front left and front right
const bed=(x,z,rot,len,items)=>{const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;world.add(g);
 const wallM=mat.terra;const wl=(w,d,px,pz)=>{const m=mesh(new THREE.BoxGeometry(w,.36,d),wallM);m.position.set(px,.26,pz);g.add(m);const cap=mesh(new THREE.BoxGeometry(w+.04,.05,d+.04),mat.terraDark);cap.position.set(px,.45,pz);g.add(cap);};
 wl(len,.12,0,-.5);wl(len,.12,0,.5);wl(.12,1.0,-len/2,0);wl(.12,1.0,len/2,0);
 const s=mesh(new THREE.BoxGeometry(len-.1,.3,.9),mat.soil);s.position.y=.25;g.add(s);
 items.forEach(([type,stage,owner],i)=>{const f=flower(type,stage);const fx=-len/2+.35+i*(len-.7)/Math.max(1,items.length-1);const fz=(i%2?.18:-.15);f.position.set(fx,.42,fz);f.scale.setScalar(1.95);f.rotation.y=rr(-.5,.5);g.add(f);const tg=tag(owner);tg.position.set(fx+.18,.4,fz+.2);g.add(tg);});};
bed(-2.7,3.1,.35,3.3,[['jasmine',3,'y'],['orchid',3,'o'],['rose',3,'o'],['lilium',3,'y'],['jasmine',3,'o'],['lavender',3,'y']]);
bed(2.55,3.75,-.35,2.6,[['lilium',3,'y'],['orchid',3,'y'],['jasmine',2,'o'],['marigold',3,'o'],['rose',1,'y']]);

// potted lemon trees and terracotta pots
const pot=(x,z,s=1,kind='lemon')=>{const g=new THREE.Group();g.position.set(x,.08,z);g.scale.setScalar(s);world.add(g);
 const prof=[[0,0],[.26,0],[.3,.05],[.36,.5],[.42,.55],[.42,.62],[.33,.62],[.3,.56],[0,.56]].map(([a,b])=>new THREE.Vector2(a,b));g.add(mesh(new THREE.LatheGeometry(prof,24),mat.terra));
 if(kind==='lemon'){g.add(at(mesh(new THREE.CylinderGeometry(.04,.05,.6,6),mat.woodDark),0,.85,0));for(let i=0;i<10;i++){const b=blob(rr(.18,.28),rnd()>.5?mat.leaf:mat.leafLight,1);b.position.set(rr(-.25,.25),rr(1.15,1.5),rr(-.25,.25));g.add(b);}for(let i=0;i<9;i++){const l=mesh(new THREE.SphereGeometry(.06,10,8),mat.lemon);l.scale.y=1.25;l.position.set(rr(-.35,.35),rr(1.0,1.55),rr(-.35,.35));g.add(l);}}
 else{for(let i=0;i<7;i++){const b=rnd()>.4?foliage(rr(.12,.18),0,BOUG):foliage(rr(.12,.18));b.position.set(rr(-.18,.18),rr(.62,.85),rr(-.18,.18));g.add(b);}}};
pot(-1.75,-2.75,.95,'lemon');pot(1.35,-3.0,.8,'flowers');pot(-1.45,-3.0,.8,'flowers');pot(-1.9,4.7,.75,'flowers');pot(0.9,4.6,.6,'flowers');

// lanterns along the path
const lanterns=[];
const lantern=(x,z)=>{const g=new THREE.Group();g.position.set(x,.08,z);world.add(g);g.add(at(mesh(new THREE.CylinderGeometry(.13,.15,.05,6),mat.ink),0,.02,0));
 g.add(at(mesh(new THREE.CylinderGeometry(.11,.11,.32,6,1,true),mat.lamp,{cast:false}),0,.22,0));for(let k=0;k<6;k++){const a=k/6*6.28;g.add(at(mesh(new THREE.BoxGeometry(.015,.34,.015),mat.ink),Math.cos(a)*.115,.22,Math.sin(a)*.115));}
 g.add(at(mesh(new THREE.ConeGeometry(.15,.16,6),mat.ink),0,.46,0));g.add(at(mesh(new THREE.TorusGeometry(.03,.008,6,12),mat.ink),0,.56,0));lanterns.push(g);};
// behind the wall: a back terrace with lemon trees, pots and lanterns (seen when you turn the island around)
for(const [x,z,sc,k] of [[-2.2,-5.0,1.05,'lemon'],[2.9,-5.0,1.0,'lemon'],[0.3,-5.55,.85,'flowers'],[-.9,-4.55,.7,'flowers'],[1.5,-4.5,.7,'flowers']])pot(x,z,sc,k);
lantern(-.8,-5.6);lantern(1.4,-5.6);
lantern(1.25,5.15);lantern(.6,2.6);lantern(.9,1.3);lantern(-1.2,-1.9);lantern(1.0,-2.4);lantern(-4.9,2.6);

// ---------- Tunisian house: Dar Yasmine ----------
const plaque=(text,bg,fg,w=.9,h=.28)=>{const c=document.createElement('canvas');c.width=512;c.height=160;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,512,160);x.strokeStyle=fg;x.lineWidth=10;x.strokeRect(10,10,492,140);x.fillStyle=fg;x.font='bold 74px Georgia, serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text,256,84);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,roughness:.4}),{cast:false});};
{const hx=-4.15,hz=-2.2,g=new THREE.Group();g.position.set(hx,0,hz);g.rotation.y=.42;world.add(g);
 const body=mesh(new THREE.BoxGeometry(1.9,1.55,1.5),mat.stucco);body.position.y=.86;g.add(body);
 const drum=mesh(new THREE.CylinderGeometry(.52,.56,.22,32),mat.stucco);drum.position.y=1.74;g.add(drum);
 const dome=mesh(new THREE.SphereGeometry(.52,32,16,0,Math.PI*2,0,Math.PI/2),M('#FBF8F2',{roughness:.6}));dome.position.y=1.85;g.add(dome);
 const fin=mesh(new THREE.ConeGeometry(.04,.22,8),M('#C99A3A',{metalness:.7,roughness:.3}));fin.position.y=2.45;g.add(fin);
 for(const c of [[-.95,.75],[.95,.75],[-.95,-.75],[.95,-.75]]){const m=mesh(new THREE.BoxGeometry(.14,.1,.14),mat.stuccoWarm);m.position.set(c[0],1.68,c[1]);g.add(m);}
 // horseshoe-arched blue door + studs
 const hs=new THREE.Shape();hs.moveTo(-.28,0);hs.lineTo(-.28,.62);hs.absarc(0,.66,.3,Math.PI*1.08,-Math.PI*.08,true);hs.lineTo(.28,0);hs.lineTo(-.28,0);
 const hd=mesh(new THREE.ExtrudeGeometry(hs,{depth:.06,bevelEnabled:false,curveSegments:20}),mat.blue);hd.position.set(.35,.09,.73);g.add(hd);
 for(let r=0;r<3;r++)for(let c=0;c<2;c++){const st=mesh(new THREE.SphereGeometry(.022,6,4),mat.stud);st.position.set(.27+c*.16,.28+r*.17,.8);g.add(st);}
 // mashrabiya window: blue wooden lattice
 const mw=new THREE.Group();mw.position.set(-.45,1.0,.76);g.add(mw);mw.add(at(mesh(new THREE.BoxGeometry(.5,.62,.04),mat.window,{cast:false}),0,0,-.01));for(let k=0;k<6;k++){mw.add(at(mesh(new THREE.BoxGeometry(.02,.62,.03),mat.blueLight),-.22+k*.088,0,.02));mw.add(at(mesh(new THREE.BoxGeometry(.5,.02,.03),mat.blueLight),0,-.27+k*.108,.02));}
 const awn=mesh(new THREE.BoxGeometry(.66,.05,.24),mat.blue);awn.position.set(-.45,1.36,.84);awn.rotation.x=.3;g.add(awn);
 // zellige tile band at the base
 const zc=['#1F5FB0','#F2C94C','#12A150','#FFFFFF','#C8683F'];for(let k=0;k<18;k++){const t=mesh(new THREE.BoxGeometry(.1,.1,.02),M(zc[k%5],{roughness:.3}),{cast:false});t.position.set(-.86+k*.101,.2,.76);t.rotation.z=Math.PI/4;t.scale.setScalar(.75);g.add(t);}
 const pl=plaque('Dar Yasmine','#F7F3EA','#1F5FB0',.62,.19);pl.position.set(-.45,.58,.77);g.add(pl);
 // jasmine climbing over the house: Yasmine's flower, Tunisia's flower
 const FW=new THREE.Vector3(0,0,1),UPV=new THREE.Vector3(0,1,0);
 const vine=(x,y,z,up)=>{const r=rr(.06,.085);const f=foliage(r,1);f.position.set(x,y,z);if(up){f.scale.y=.45;}else{f.rotation.x=Math.PI/2;f.scale.y=.45;}g.add(f);if(rnd()>.35)jasmineAt(g,new THREE.Vector3(x+rr(-.03,.03),y+(up?r*.5:rr(-.03,.03)),z+(up?rr(-.03,.03):r*.5)),up?UPV:FW);};
 for(const x0 of [-.86,.85])for(let k=0;k<10;k++)vine(x0+Math.sin(k*1.3+x0)*.04,.14+k*.145,.78,0);
 for(let k=0;k<12;k++)vine(-.86+k*.156,1.56+Math.sin(k*1.7)*.025,.78,0);
 for(let k=0;k<12;k++)vine(rr(-.85,.85),1.655,rr(.6,.72),1);
 // blue-and-white Nabeul pots with orchids by the door
 for(const [x,z] of [[1.05,.95],[1.35,.55]]){const pp=new THREE.Group();pp.position.set(x,0,z);g.add(pp);const prof=[[0,0],[.17,0],[.22,.12],[.2,.3],[.15,.36],[.17,.4],[0,.4]].map(([a,b])=>new THREE.Vector2(a,b));pp.add(mesh(new THREE.LatheGeometry(prof,24),M('#FFFFFF',{roughness:.3})));pp.add(at(mesh(new THREE.TorusGeometry(.205,.018,6,24),mat.blue),0,.14,0));pp.children.at(-1).rotation.x=Math.PI/2;pp.add(at(mesh(new THREE.TorusGeometry(.19,.014,6,24),mat.blue),0,.27,0));pp.children.at(-1).rotation.x=Math.PI/2;const f=flower('orchid',3);f.scale.setScalar(1.7);f.position.y=.38;pp.add(f);}
}
// ---------- Italian campanile: Casa Oliver ----------
{const g=new THREE.Group();g.position.set(3.35,0,-2.95);g.rotation.y=-.35;world.add(g);const och=M('#E2A35C',{roughness:.95}),ochD=M('#C9874A',{roughness:.95});
 const sh=mesh(new THREE.BoxGeometry(.95,3.1,.95),och);sh.position.y=1.6;g.add(sh);
 for(const y of [1.2,2.2,3.15]){const c=mesh(new THREE.BoxGeometry(1.08,.08,1.08),ochD);c.position.y=y;g.add(c);}
 const bel=mesh(new THREE.BoxGeometry(.95,.75,.95),och);bel.position.y=3.55;g.add(bel);
 const archS=new THREE.Shape();archS.moveTo(-.16,0);archS.lineTo(-.16,.32);archS.absarc(0,.32,.16,Math.PI,0,true);archS.lineTo(.16,0);archS.lineTo(-.16,0);
 for(let k=0;k<4;k++){const a=mesh(new THREE.ShapeGeometry(archS),M('#2A1F22'),{cast:false});const ang=k*Math.PI/2;a.position.set(Math.sin(ang)*.48,3.27,Math.cos(ang)*.48);a.rotation.y=ang;g.add(a);}
 const bell=mesh(new THREE.LatheGeometry([[0,.2],[.08,.19],[.1,.08],[.14,0],[0,0]].map(([x,y])=>new THREE.Vector2(x,y)),20),M('#C99A3A',{metalness:.8,roughness:.3}));bell.position.y=3.38;g.add(bell);
 const cor=mesh(new THREE.BoxGeometry(1.1,.08,1.1),ochD);cor.position.y=3.95;g.add(cor);
 const roof=mesh(new THREE.ConeGeometry(.78,.7,4),mat.terra);roof.position.y=4.33;roof.rotation.y=Math.PI/4;g.add(roof);
 const cross=mesh(new THREE.BoxGeometry(.03,.2,.03),mat.ink);cross.position.y=4.78;g.add(cross);
 for(let k=0;k<2;k++){const w=mesh(new THREE.ShapeGeometry(archS),mat.window,{cast:false});w.scale.setScalar(.7);w.position.set(0,1.45+k*.9,.481);g.add(w);for(const sx of [-1,1]){const shu=mesh(new THREE.BoxGeometry(.12,.36,.03),M('#3E7B4C'));shu.position.set(sx*.19,1.6+k*.9,.5);g.add(shu);}}
 const pl=plaque('Casa Oliver','#FFF6EA','#B5452F',.62,.19);pl.position.set(0,.75,.482);g.add(pl);
 // lilies in terracotta pots at the tower's foot
 for(const [x,z] of [[-.85,.85],[-.45,1.1],[.55,1.0]]){const pp=new THREE.Group();pp.position.set(x,0,z);g.add(pp);const prof=[[0,0],[.15,0],[.19,.3],[.23,.33],[.23,.37],[0,.37]].map(([a,b])=>new THREE.Vector2(a,b));pp.add(mesh(new THREE.LatheGeometry(prof,20),mat.terra));const f=flower('lilium',3);f.scale.setScalar(1.8);f.position.y=.34;pp.add(f);}
}
// a row of jasmine pots along the left path
for(let k=0;k<4;k++){const pp=new THREE.Group();pp.position.set(-.95+k*.05,0,2.0+k*.72);world.add(pp);const prof=[[0,0],[.18,0],[.22,.28],[.26,.31],[.26,.35],[0,.35]].map(([a,b])=>new THREE.Vector2(a,b));pp.add(mesh(new THREE.LatheGeometry(prof,20),mat.terra));const f=flower('jasmine',3);f.scale.setScalar(2.0);f.position.y=.33;pp.add(f);}

// ---------- the music corner: a toad in a red chechia playing guitar ----------
{const g=new THREE.Group();g.position.set(4.05,.09,1.25);g.rotation.y=.95;world.add(g);G.toad=g;
 // kilim rug
 const kc=document.createElement('canvas');kc.width=kc.height=256;const kx=kc.getContext('2d');kx.fillStyle='#B3262E';kx.fillRect(0,0,256,256);const kcol=['#1F3F7A','#F2C94C','#12A150','#F7F3EA'];for(let r=0;r<4;r++)for(let c=0;c<4;c++){kx.fillStyle=kcol[(r+c)%4];kx.beginPath();const cx=32+c*64,cy=32+r*64;kx.moveTo(cx,cy-26);kx.lineTo(cx+26,cy);kx.lineTo(cx,cy+26);kx.lineTo(cx-26,cy);kx.fill();kx.fillStyle='#B3262E';kx.beginPath();kx.moveTo(cx,cy-10);kx.lineTo(cx+10,cy);kx.lineTo(cx,cy+10);kx.lineTo(cx-10,cy);kx.fill();}kx.strokeStyle='#F7F3EA';kx.lineWidth=10;kx.strokeRect(5,5,246,246);
 const kt=new THREE.CanvasTexture(kc);kt.colorSpace=THREE.SRGBColorSpace;const rug=mesh(new THREE.BoxGeometry(1.5,.03,1.15),new THREE.MeshStandardMaterial({map:kt,roughness:1}),{cast:false});rug.position.set(.1,.0,0);g.add(rug);
 // stool
 g.add(at(mesh(new THREE.CylinderGeometry(.22,.22,.07,20),mat.wood),0,.36,0));for(let k=0;k<3;k++){const a=k/3*6.28;const l=mesh(new THREE.CylinderGeometry(.02,.025,.36,6),mat.woodDark);l.position.set(Math.cos(a)*.15,.18,Math.sin(a)*.15);g.add(l);}
 const toadG=M('#78B348',{roughness:.55}),toadL=M('#EDE7B4',{roughness:.6}),black=M('#141018',{roughness:.3}),white=M('#FFFFFF',{roughness:.3});
 const T=new THREE.Group();T.position.y=.4;T.userData.dyn=true;g.add(T);G.toadBody=T;
 const body=mesh(new THREE.SphereGeometry(.3,28,20),toadG);body.scale.set(1.05,.9,.92);body.position.y=.26;T.add(body);
 const belly=mesh(new THREE.SphereGeometry(.24,24,16),toadL);belly.scale.set(.9,.85,.55);belly.position.set(0,.22,.15);T.add(belly);
 // red farmla vest with gold trim
 const vestM=M('#C2272D',{roughness:.6}),gold=M('#D9A93A',{metalness:.6,roughness:.35});
 for(const sx of [-1,1]){const v=mesh(new THREE.SphereGeometry(.2,20,14),vestM);v.scale.set(.75,1.05,.55);v.position.set(sx*.17,.28,.1);v.rotation.z=sx*.25;T.add(v);const tr=mesh(new THREE.TorusGeometry(.17,.012,6,24,Math.PI),gold);tr.position.set(sx*.1,.28,.21);tr.rotation.set(0,0,sx>0?-Math.PI/2:Math.PI/2);T.add(tr);}
 const head=mesh(new THREE.SphereGeometry(.26,28,20),toadG);head.scale.set(1.15,.78,1);head.position.set(0,.6,.04);T.add(head);
 for(const sx of [-1,1]){const eb=mesh(new THREE.SphereGeometry(.085,18,14),toadG);eb.position.set(sx*.13,.76,.08);T.add(eb);const ew=mesh(new THREE.SphereGeometry(.068,18,14),white);ew.position.set(sx*.135,.775,.13);T.add(ew);const ep=mesh(new THREE.SphereGeometry(.036,14,10),black);ep.position.set(sx*.135,.78,.185);T.add(ep);const hl=mesh(new THREE.SphereGeometry(.012,8,6),white);hl.position.set(sx*.125,.795,.215);T.add(hl);const ck=mesh(new THREE.SphereGeometry(.04,12,8),M('#F28C9A'));ck.scale.z=.4;ck.position.set(sx*.2,.56,.22);T.add(ck);}
 const smile=mesh(new THREE.TorusGeometry(.1,.011,6,20,Math.PI),M('#3A2410'));smile.rotation.z=Math.PI;smile.position.set(0,.6,.29);T.add(smile);
 // chechia: the red Tunisian felt hat, with its black tassel
 const hat=mesh(new THREE.CylinderGeometry(.12,.135,.14,28),M('#B71C1C',{roughness:.85}));hat.position.set(.03,.86,.02);hat.rotation.z=-.12;T.add(hat);
 const tas=mesh(new THREE.CylinderGeometry(.008,.008,.16,5),black);tas.position.set(.12,.88,.02);tas.rotation.z=.5;T.add(tas);const tb=mesh(new THREE.SphereGeometry(.03,8,6),black);tb.scale.y=1.6;tb.position.set(.17,.8,.02);T.add(tb);
 // jasmine flower tucked behind the ear: the Tunisian mechmoum
 const mm=new THREE.Mesh(new THREE.ShapeGeometry((()=>{const sh=new THREE.Shape();for(let k=0;k<10;k++){const a=k/10*6.28,r=k%2?.015:.04;k?sh.lineTo(Math.cos(a)*r,Math.sin(a)*r):sh.moveTo(Math.cos(a)*r,Math.sin(a)*r);}return sh;})()),new THREE.MeshStandardMaterial({color:'#FFFFFF',side:THREE.DoubleSide,emissive:'#FFFFFF',emissiveIntensity:.1}));mm.position.set(-.27,.72,.06);mm.rotation.y=-1.2;T.add(mm);
 // legs and feet
 for(const sx of [-1,1]){const lg=mesh(new THREE.SphereGeometry(.12,16,12),toadG);lg.scale.set(.8,.6,1.3);lg.position.set(sx*.2,.06,.12);T.add(lg);const ft=mesh(new THREE.SphereGeometry(.08,14,10),toadG);ft.scale.set(1.3,.35,1.4);ft.position.set(sx*.22,-.33,.22);T.add(ft);const sh2=mesh(new THREE.CylinderGeometry(.045,.04,.32,8),toadG);sh2.position.set(sx*.21,-.17,.2);T.add(sh2);}
 // guitar across the body
 const gb=M('#C9853F',{roughness:.4}),gb2=M('#6B3416',{roughness:.5});const gt=new THREE.Group();gt.position.set(.02,.24,.27);gt.rotation.set(.05,.0,1.05);T.add(gt);
 const lo=mesh(new THREE.CylinderGeometry(.17,.17,.07,28),gb);lo.rotation.x=Math.PI/2;gt.add(lo);const up=mesh(new THREE.CylinderGeometry(.13,.13,.07,28),gb);up.rotation.x=Math.PI/2;up.position.y=.21;gt.add(up);
 const sh3=mesh(new THREE.CircleGeometry(.045,16),black);sh3.position.set(0,.12,.037);gt.add(sh3);const nk=mesh(new THREE.BoxGeometry(.05,.5,.03),gb2);nk.position.y=.55;gt.add(nk);const hd=mesh(new THREE.BoxGeometry(.075,.11,.03),gb2);hd.position.y=.85;gt.add(hd);
 for(let k=0;k<4;k++){const sr=mesh(new THREE.CylinderGeometry(.002,.002,.82,3),M('#EDEDED',{metalness:.8,roughness:.2}),{cast:false});sr.position.set(-.012+k*.008,.45,.04);gt.add(sr);}
 // arms holding it
 for(const [x,y,z,rx,rz] of [[-.24,.3,.22,.6,1.1],[.22,.2,.24,.9,-1.0]]){const ar=mesh(new THREE.CapsuleGeometry(.045,.22,6,10),toadG);ar.position.set(x,y,z);ar.rotation.set(rx,0,rz);T.add(ar);}
 // brass gramophone on a little table: the music player lives here
 const gm=new THREE.Group();gm.position.set(.62,0,-.25);g.add(gm);gm.add(at(mesh(new THREE.CylinderGeometry(.03,.03,.45,8),mat.woodDark),0,.22,0));gm.add(at(mesh(new THREE.CylinderGeometry(.22,.22,.04,20),mat.wood),0,.46,0));
 gm.add(at(mesh(new THREE.BoxGeometry(.26,.12,.26),M('#7A3E1D',{roughness:.4})),0,.54,0));gm.add(at(mesh(new THREE.CylinderGeometry(.11,.11,.01,24),black),0,.605,0));
 const hornP=[];for(let k=0;k<=14;k++){const t=k/14;hornP.push(new THREE.Vector2(.015+Math.pow(t,3)*.2,t*.42));}const horn=mesh(new THREE.LatheGeometry(hornP,28),M('#D4A03A',{metalness:.85,roughness:.25,side:THREE.DoubleSide}));horn.position.set(.05,.68,-.02);horn.rotation.set(-.5,0,-.4);gm.add(horn);
 // music notes floating up
 const noteM=M('#1B1530',{roughness:.4});for(const [x,y,z,s] of [[.15,1.55,.1,1],[.38,1.82,-.05,.85],[.05,2.08,.05,.7]]){const n=new THREE.Group();n.add(at(mesh(new THREE.SphereGeometry(.05,12,8),noteM),0,0,0));n.children[0].scale.set(1.25,.85,.6);n.add(at(mesh(new THREE.BoxGeometry(.012,.2,.012),noteM),.05,.1,0));n.add(at(mesh(new THREE.BoxGeometry(.07,.02,.012),noteM),.08,.19,0));n.children[2].rotation.z=-.5;n.position.set(x,y,z);n.scale.setScalar(s);n.rotation.z=.2;n.userData.dyn=true;g.add(n);(G.notes||(G.notes=[])).push(n);}
}

// ---------- culture corners: Tunisia for Oliver to discover, Venezuela for Yasmine ----------
G.spots=[];const spot=(id,x,y,z,r=.9)=>G.spots.push({id,p:[x,y,z],r});
{const red=M('#C81E1E',{roughness:.5}),stemG=M('#3E7A2C'),gold=M('#C99A3A',{metalness:.7,roughness:.3}),marble=M('#EEE8DC',{roughness:.7}),marbleD=M('#D9D0BF',{roughness:.8}),wire=M('#F6F8FA',{roughness:.35,metalness:.25}),iron=M('#26222E',{roughness:.5,metalness:.5});
 // house-local frame of Dar Yasmine
 const hg=new THREE.Group();hg.position.set(-4.15,0,-2.2);hg.rotation.y=.42;world.add(hg);
 // harissa: strings of sun-dried chilies on the side wall, and a jar of harissa on a tiled table
 for(const zc of [.25,-.2]){const top=1.48;hg.add(at(mesh(new THREE.CylinderGeometry(.004,.004,.78,4),M('#8A6A3A'),{cast:false}),.97,top-.39,zc));
  for(let k=0;k<11;k++){const c=mesh(new THREE.ConeGeometry(.026,.13,7),k%3?red:M('#A51515',{roughness:.55}));c.position.set(.99+rr(-.01,.02),top-.05-k*.066,zc+rr(-.03,.03));c.rotation.set(Math.PI+rr(-.35,.35),0,rr(-.4,.4));hg.add(c);const s=mesh(new THREE.CylinderGeometry(.008,.01,.025,5),stemG,{cast:false});s.position.copy(c.position).add(new THREE.Vector3(0,.065,0));hg.add(s);}}
 {const t=new THREE.Group();t.position.set(1.45,0,-.38);hg.add(t);t.add(at(mesh(new THREE.BoxGeometry(.42,.04,.42),mat.blue),0,.36,0));for(const [x,z] of [[-.17,-.17],[.17,-.17],[-.17,.17],[.17,.17]])t.add(at(mesh(new THREE.BoxGeometry(.035,.36,.035),mat.blue),x,.18,z));
  const zc=['#F2C94C','#FFFFFF','#12A150','#C8683F'];for(let i=0;i<4;i++)for(let j=0;j<4;j++)t.add(at(mesh(new THREE.BoxGeometry(.09,.006,.09),M(zc[(i+j)%4],{roughness:.3}),{cast:false}),-.15+i*.1,.383,-.15+j*.1));
  const jp=[[0,0],[.07,0],[.09,.05],[.085,.13],[.06,.16],[.065,.18],[0,.18]].map(([a,b])=>new THREE.Vector2(a,b));t.add(at(mesh(new THREE.LatheGeometry(jp,18),mat.terra),-.06,.385,0));t.add(at(mesh(new THREE.CylinderGeometry(.058,.058,.012,18),M('#B3141B',{roughness:.35})),-.06,.56,0));
  const pl=mesh(new THREE.CylinderGeometry(.1,.07,.025,20),M('#FFFFFF',{roughness:.3}));pl.position.set(.1,.395,.08);t.add(pl);t.add(at(mesh(new THREE.SphereGeometry(.05,10,6),M('#B3141B',{roughness:.35})),.1,.405,.08));t.children.at(-1).scale.y=.35;}
 spot('harissa',...new THREE.Vector3(1.1,1.0,0).applyAxisAngle(UP,.42).add(hg.position).toArray());
 // khamsa: a brass hand knocker on the blue door
 {const k=new THREE.Group();k.position.set(.5,.52,.8);k.scale.setScalar(.55);hg.add(k);k.add(at(mesh(new THREE.BoxGeometry(.075,.08,.015),gold),0,0,0));for(let f=0;f<5;f++){const fi=mesh(new THREE.CapsuleGeometry(.011,f===0||f===4?.03:.05,3,6),gold);fi.position.set(-.032+f*.016,.06+(f===0||f===4?-.012:0),0);if(f===0){fi.position.set(-.05,.01,0);fi.rotation.z=.6;}if(f===4){fi.position.set(.05,.01,0);fi.rotation.z=-.6;}k.add(fi);}k.add(at(mesh(new THREE.TorusGeometry(.03,.008,6,14),gold),0,-.06,.01));}
 spot('door',...new THREE.Vector3(.35,.7,.85).applyAxisAngle(UP,.42).add(hg.position).toArray());
 spot('jasmine',...new THREE.Vector3(-.86,1.2,.85).applyAxisAngle(UP,.42).add(hg.position).toArray());
 spot('orchid',...new THREE.Vector3(1.2,.6,.75).applyAxisAngle(UP,.42).add(hg.position).toArray());
 // a Sidi Bou Said birdcage, white wire with blue, hung from a curled iron stand
 {const st=new THREE.Group();st.position.set(-2.05,0,-1.2);world.add(st);
  st.add(at(mesh(new THREE.CylinderGeometry(.13,.16,.05,10),iron),0,.03,0));st.add(at(mesh(new THREE.CylinderGeometry(.018,.022,1.75,8),iron),0,.9,0));
  const arm=new THREE.CatmullRomCurve3([new THREE.Vector3(0,1.75,0),new THREE.Vector3(.12,1.9,0),new THREE.Vector3(.32,1.88,0),new THREE.Vector3(.42,1.8,0)]);st.add(mesh(new THREE.TubeGeometry(arm,14,.014,6,false),iron));
  const cg=new THREE.Group();cg.position.set(.42,1.18,0);st.add(cg);const R=.17;
  cg.add(at(mesh(new THREE.CylinderGeometry(R+.01,R+.01,.035,24),mat.blue),0,0,0));
  for(let k=0;k<16;k++){const a=k/16*Math.PI*2;cg.add(at(mesh(new THREE.CylinderGeometry(.004,.004,.16,4),wire,{cast:false}),Math.cos(a)*R,.09,Math.sin(a)*R));}
  for(let k=0;k<8;k++){const arc=mesh(new THREE.TorusGeometry(R,.005,4,20,Math.PI),wire,{cast:false});arc.position.y=.17;arc.rotation.y=k/8*Math.PI;cg.add(arc);}
  for(const y of [.06,.17])cg.add(at(mesh(new THREE.TorusGeometry(R,.007,4,28),mat.blue,{cast:false}),0,y,0)).children.at(-1).rotation.x=Math.PI/2;
  cg.add(at(mesh(new THREE.SphereGeometry(.03,10,8),mat.blue),0,.36,0));cg.add(at(mesh(new THREE.CylinderGeometry(.003,.003,.27,4),iron,{cast:false}),0,.5,0));
  const perch=mesh(new THREE.CylinderGeometry(.005,.005,.3,4),mat.wood,{cast:false});perch.rotation.z=Math.PI/2;perch.position.y=.1;cg.add(perch);}
 spot('cage',-1.63,1.3,-1.2);
 // a date palm: ringed trunk, arching fronds, amber Deglet Nour dates
 {const pg=new THREE.Group();pg.position.set(-5.35,0,-1.55);world.add(pg);const trunkM=M('#8B6B47',{flatShading:true,roughness:.95}),palmM=M('#5E9A3A',{side:THREE.DoubleSide,roughness:.75}),palmM2=M('#7DB24B',{side:THREE.DoubleSide,roughness:.75});
  const tc=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(.15,1.1,.05),new THREE.Vector3(.12,2.2,0),new THREE.Vector3(-.05,3.1,-.05)]);pg.add(mesh(new THREE.TubeGeometry(tc,24,.11,8,false),trunkM));
  for(let k=1;k<15;k++){const p=tc.getPointAt(k/15);const r=mesh(new THREE.TorusGeometry(.115,.022,4,10),trunkM);r.position.copy(p);r.rotation.x=Math.PI/2;pg.add(r);}
  const top=tc.getPointAt(1);
  for(let f=0;f<11;f++){const a=f/11*Math.PI*2+rr(0,.3),d=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),L=rr(1.1,1.45),up=rr(.15,.45);
   const fc=new THREE.QuadraticBezierCurve3(top.clone(),top.clone().addScaledVector(d,L*.5).add(new THREE.Vector3(0,up,0)),top.clone().addScaledVector(d,L).add(new THREE.Vector3(0,up-.75,0)));
   pg.add(mesh(new THREE.TubeGeometry(fc,10,.014,4,false),trunkM,{cast:false}));
   for(let i=2;i<=18;i++){const t=i/19,p=fc.getPointAt(t),T=fc.getTangentAt(t),S=new THREE.Vector3().crossVectors(T,UP).normalize();for(const sd of [-1,1]){const D=S.clone().multiplyScalar(sd).addScaledVector(UP,-.55).addScaledVector(T,.45).normalize();const l=mesh(leafG,(i+f)%2?palmM:palmM2,{cast:t<.6});l.quaternion.setFromUnitVectors(UP,D);l.scale.set(.07,.42*(1-t*.55),1);l.position.copy(p);pg.add(l);}}}
  const dm=M('#C77A1E',{roughness:.4});for(let c=0;c<3;c++){const a=c/3*6.28+.5;for(let i=0;i<16;i++){const b=mesh(new THREE.SphereGeometry(.03,6,5),dm,{cast:false});b.scale.y=1.4;b.position.set(top.x+Math.cos(a)*.17+rr(-.06,.06),top.y-.15-rr(0,.32),top.z+Math.sin(a)*.17+rr(-.06,.06));pg.add(b);}}}
 spot('palm',-5.35,2.6,-1.55);
 // Carthage: two marble columns, one broken, a fallen drum and a capital in the grass
 {const cg=new THREE.Group();cg.position.set(-5.05,0,-.45);cg.rotation.y=.5;world.add(cg);
  const col=(x,z,h,cap)=>{cg.add(at(mesh(new THREE.BoxGeometry(.38,.1,.38),marbleD),x,.06,z));const c=mesh(new THREE.CylinderGeometry(.12,.135,h,14),marble);c.position.set(x,.11+h/2,z);cg.add(c);for(let k=0;k<7;k++){const fl=mesh(new THREE.BoxGeometry(.012,h*.96,.02),marbleD,{cast:false});const a=k/7*Math.PI*2;fl.position.set(x+Math.cos(a)*.128,.11+h/2,z+Math.sin(a)*.128);fl.rotation.y=-a;cg.add(fl);}
   if(cap){cg.add(at(mesh(new THREE.CylinderGeometry(.17,.12,.1,14),marble),x,.16+h,z));cg.add(at(mesh(new THREE.BoxGeometry(.36,.06,.36),marbleD),x,.24+h,z));}};
  col(0,0,1.35,1);col(.55,.5,.62,0);
  const dr=mesh(new THREE.CylinderGeometry(.125,.125,.34,14),marble);dr.rotation.z=Math.PI/2;dr.rotation.y=.6;dr.position.set(.7,.13,-.2);cg.add(dr);
  for(let i=0;i<6;i++){const s=blob(rr(.04,.08),marbleD,0);s.position.set(.3+rr(-.4,.5),.05,.2+rr(-.4,.4));cg.add(s);}}
 spot('carthage',-4.8,1.0,-.35);

 // ---------- Venezuela ----------
 // araguaney: the national tree, all gold in the dry season
 {const ag=new THREE.Group();ag.position.set(5.55,0,.2);world.add(ag);const bark=M('#6E5236',{roughness:.9});
  const tc=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(-.1,.8,.05),new THREE.Vector3(.05,1.5,0),new THREE.Vector3(-.05,2.0,.05)]);ag.add(mesh(new THREE.TubeGeometry(tc,16,.1,7,false),bark));
  for(const [dx,dz] of [[.7,.2],[-.6,.3],[.1,-.65],[-.2,.7]]){const b=new THREE.CatmullRomCurve3([new THREE.Vector3(0,1.6,0),new THREE.Vector3(dx*.5,2.0,dz*.5),new THREE.Vector3(dx,2.35,dz)]);ag.add(mesh(new THREE.TubeGeometry(b,8,.045,5,false),bark));}
  const Y=[M('#F7C600',{side:THREE.DoubleSide,roughness:.6}),M('#FFD93B',{side:THREE.DoubleSide,roughness:.6}),M('#F2A900',{side:THREE.DoubleSide,roughness:.6})];
  for(let i=0;i<38;i++){const a=rnd()*6.28,r=Math.sqrt(rnd())*1.05;const c=foliage(rr(.2,.3),0,Y);c.position.set(Math.cos(a)*r,rr(2.05,2.75)-r*.3,Math.sin(a)*r);ag.add(c);}
  for(let i=0;i<40;i++){const a=rnd()*6.28,r=rr(.3,1.3);const p=mesh(new THREE.CircleGeometry(.03,5),Y[i%3],{cast:false});p.rotation.x=-Math.PI/2;p.position.set(Math.cos(a)*r,.1,Math.sin(a)*r);ag.add(p);}}
 spot('araguaney',5.55,2.6,.2);
 // a woven chinchorro hammock from the araguaney to a post, with a little tricolour bunting
 {const A=new THREE.Vector3(5.72,1.12,1.65),B=new THREE.Vector3(5.5,1.05,.25);
  world.add(at(mesh(new THREE.CylinderGeometry(.05,.06,1.32,8),mat.wood),A.x,.66,A.z));
  const hc=document.createElement('canvas');hc.width=64;hc.height=256;const hx=hc.getContext('2d');const st=['#E63946','#F4C430','#1D6FD1','#2A9D5B','#F28C28','#FFFFFF','#8E3BB0'];for(let i=0;i<32;i++){hx.fillStyle=st[(i*3+(i>>2))%st.length];hx.fillRect(0,i*8,64,8);}
  const ht=new THREE.CanvasTexture(hc);ht.colorSpace=THREE.SRGBColorSpace;
  const NU=22,NV=6,pos=[],uv=[],idx=[];const dir=B.clone().sub(A),len=dir.length();dir.normalize();const side=new THREE.Vector3().crossVectors(dir,UP).normalize();
  for(let i=0;i<=NU;i++)for(let j=0;j<=NV;j++){const u=i/NU,v=j/NV;const w=.55*Math.sin(Math.PI*Math.min(1,Math.max(0,(u-.08)/.84)))+.02;const p=A.clone().addScaledVector(dir,u*len).addScaledVector(side,(v-.5)*w);p.y+=-Math.sin(Math.PI*u)*.5-Math.sin(Math.PI*v)*.06*Math.sin(Math.PI*u);pos.push(p.x,p.y,p.z);uv.push(v,u);}
  for(let i=0;i<NU;i++)for(let j=0;j<NV;j++){const a=i*(NV+1)+j,b=a+NV+1;idx.push(a,b,a+1,b,b+1,a+1);}
  const hgm=new THREE.BufferGeometry();hgm.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));hgm.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));hgm.setIndex(idx);hgm.computeVertexNormals();
  world.add(mesh(hgm,new THREE.MeshStandardMaterial({map:ht,side:THREE.DoubleSide,roughness:.9})));
  const fl=['#F4C430','#1D6FD1','#E63946'];for(let k=0;k<9;k++){const u=(k+.5)/9;const p=A.clone().lerp(B,u);p.y=1.42-Math.sin(Math.PI*u)*.14;const tri=mesh(new THREE.ConeGeometry(.05,.11,3),M(fl[k%3],{roughness:.7}),{cast:false});tri.rotation.x=Math.PI;tri.position.copy(p);world.add(tri);}
  const cord=new THREE.QuadraticBezierCurve3(new THREE.Vector3(A.x,1.42,A.z),A.clone().lerp(B,.5).setY(1.25),new THREE.Vector3(B.x,1.42,B.z));world.add(mesh(new THREE.TubeGeometry(cord,16,.004,3,false),M('#3A2A1A'),{cast:false}));}
 spot('hammock',5.6,.75,.95);
 // turpiales: the national bird, orange and black with a white wing flash
 const turpial=(x,y,z,ry)=>{const b=new THREE.Group();b.position.set(x,y,z);b.rotation.y=ry;world.add(b);const O=M('#F28C12',{roughness:.5}),K=M('#141018',{roughness:.5});
  const bd=mesh(new THREE.SphereGeometry(.06,12,10),O);bd.scale.set(1,.9,1.5);b.add(bd);const hd=mesh(new THREE.SphereGeometry(.042,10,8),K);hd.position.set(0,.06,.07);b.add(hd);
  const bk=mesh(new THREE.ConeGeometry(.012,.05,6),M('#9AA0A8'));bk.rotation.x=Math.PI/2;bk.position.set(0,.055,.125);b.add(bk);for(const s of [-1,1]){const w=mesh(new THREE.SphereGeometry(.045,8,6),K);w.scale.set(.35,.7,1.3);w.position.set(s*.05,.01,-.01);b.add(w);const wp=mesh(new THREE.SphereGeometry(.015,6,4),M('#FFFFFF'));wp.position.set(s*.065,.02,.0);b.add(wp);}
  const tl=mesh(new THREE.BoxGeometry(.03,.012,.1),K);tl.position.set(0,-.01,-.12);tl.rotation.x=.3;b.add(tl);for(const s of [-1,1]){const eye=mesh(new THREE.SphereGeometry(.008,6,4),M('#FFFFFF'));eye.position.set(s*.03,.075,.095);b.add(eye);}};
 turpial(5.72,1.37,1.65,-1.0);turpial(5.05,2.35,.4,2.2);
 spot('turpial',5.72,1.45,1.65);
 // a cuatro leaning on the hammock post
 {const q=new THREE.Group();q.position.set(5.55,.12,1.85);q.rotation.set(-.25,1.9,.08);world.add(q);const qb=M('#C68A4B',{roughness:.5}),qd=M('#5A3820',{roughness:.6});
  const lo=mesh(new THREE.CylinderGeometry(.11,.11,.05,24),qb);lo.rotation.x=Math.PI/2;q.add(lo);const upb=mesh(new THREE.CylinderGeometry(.085,.085,.05,24),qb);upb.rotation.x=Math.PI/2;upb.position.y=.14;q.add(upb);
  const hole=mesh(new THREE.CircleGeometry(.03,14),M('#141018'));hole.position.set(0,.09,.026);q.add(hole);q.add(at(mesh(new THREE.BoxGeometry(.04,.34,.02),qd),0,.38,0));q.add(at(mesh(new THREE.BoxGeometry(.06,.08,.02),qd),0,.58,0));
  for(let k=0;k<4;k++)q.add(at(mesh(new THREE.CylinderGeometry(.0015,.0015,.55,3),M('#EDEDED',{metalness:.8,roughness:.2}),{cast:false}),-.009+k*.006,.3,.028));}
 spot('cuatro',5.55,.5,1.85);
 // arepas on a budare, on a little table
 {const t=new THREE.Group();t.position.set(4.25,0,3.25);world.add(t);t.add(at(mesh(new THREE.CylinderGeometry(.26,.26,.04,18),mat.wood),0,.46,0));for(let k=0;k<3;k++){const a=k/3*6.28;t.add(at(mesh(new THREE.CylinderGeometry(.02,.02,.46,6),mat.woodDark),Math.cos(a)*.18,.23,Math.sin(a)*.18));}
  t.add(at(mesh(new THREE.CylinderGeometry(.21,.21,.018,24),M('#1E1C22',{metalness:.4,roughness:.5})),0,.49,0));const ar=M('#E9C27C',{roughness:.8,flatShading:true}),arD=M('#B7853F',{roughness:.8});
  for(const [x,z] of [[-.08,-.05],[.08,-.03],[0,.09]]){t.add(at(mesh(new THREE.CylinderGeometry(.07,.07,.035,14),ar),x,.517,z));for(let i=0;i<3;i++)t.add(at(mesh(new THREE.CircleGeometry(.012,6),arD,{cast:false}),x+rr(-.04,.04),.536,z+rr(-.04,.04))).children.at(-1).rotation.x=-Math.PI/2;}}
 spot('arepas',4.25,.7,3.25);
 // ---------- more Tunisia: a camel, couscous on a low table, a Roman mosaic from the Bardo ----------
 {const cm=new THREE.Group();cm.position.set(-3.55,0,.25);cm.rotation.y=.6;world.add(cm);
  const fur=M('#C9975A',{roughness:.9}),furD=M('#9C6E3C',{roughness:.9}),hoofM=M('#4A3826'),K=M('#141018',{roughness:.3}),Wt=M('#FFFFFF',{roughness:.3});
  const body=mesh(new THREE.SphereGeometry(.42,20,14),fur);body.scale.set(.78,.72,1.3);body.position.set(0,1.0,0);cm.add(body);
  const hump=mesh(new THREE.SphereGeometry(.3,18,12),fur);hump.scale.set(.85,.95,1.05);hump.position.set(0,1.32,-.08);cm.add(hump);
  const kc=document.createElement('canvas');kc.width=128;kc.height=64;const kx=kc.getContext('2d');const kk=['#B3262E','#F2C94C','#1F3F7A','#12A150','#F7F3EA'];for(let i=0;i<16;i++){kx.fillStyle=kk[i%5];kx.fillRect(i*8,0,8,64);}for(let i=0;i<8;i++){kx.fillStyle='#F7F3EA';kx.beginPath();kx.moveTo(i*16+8,20);kx.lineTo(i*16+14,32);kx.lineTo(i*16+8,44);kx.lineTo(i*16+2,32);kx.fill();}
  const kt=new THREE.CanvasTexture(kc);kt.colorSpace=THREE.SRGBColorSpace;
  const bl=mesh(new THREE.CylinderGeometry(.36,.36,.62,20,1,true,-Math.PI*.5,Math.PI),new THREE.MeshStandardMaterial({map:kt,side:THREE.DoubleSide,roughness:.9}));bl.rotation.x=Math.PI/2;bl.rotation.y=Math.PI/2;bl.rotation.order='YXZ';bl.position.set(0,1.1,-.02);cm.add(bl);
  for(const s of [-1,1])for(let k=0;k<3;k++)cm.add(at(mesh(new THREE.SphereGeometry(.035,8,6),M('#C81E1E')),s*.37,.86,-.22+k*.2));
  for(const [x,z] of [[-.17,.33],[.17,.33],[-.17,-.33],[.17,-.33]]){cm.add(at(mesh(new THREE.CapsuleGeometry(.07,.32,4,8),fur),x,.66,z));cm.add(at(mesh(new THREE.CapsuleGeometry(.052,.34,4,8),fur),x,.27,z));cm.add(at(mesh(new THREE.SphereGeometry(.06,8,6),furD),x,.46,z));cm.add(at(mesh(new THREE.CylinderGeometry(.065,.07,.06,10),hoofM),x,.03,z));}
  const nh=new THREE.Group();nh.position.set(0,1.0,.42);nh.userData.dyn=true;cm.add(nh);G.camelHead=nh;
  const nc=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(0,.2,.25),new THREE.Vector3(0,.55,.36),new THREE.Vector3(0,.72,.4)]);nh.add(mesh(new THREE.TubeGeometry(nc,14,.1,10,false),fur));
  const hd=mesh(new THREE.CapsuleGeometry(.11,.2,6,10),fur);hd.rotation.x=Math.PI/2;hd.position.set(0,.76,.5);nh.add(hd);
  const mz=mesh(new THREE.SphereGeometry(.1,12,10),furD);mz.scale.set(.95,.8,1);mz.position.set(0,.72,.66);nh.add(mz);
  for(const s of [-1,1]){nh.add(at(mesh(new THREE.ConeGeometry(.035,.09,6),fur),s*.08,.88,.42));const e=mesh(new THREE.SphereGeometry(.03,10,8),Wt);e.position.set(s*.085,.81,.56);nh.add(e);const p=mesh(new THREE.SphereGeometry(.017,8,6),K);p.position.set(s*.095,.81,.585);nh.add(p);const ls=mesh(new THREE.BoxGeometry(.045,.006,.01),K);ls.position.set(s*.09,.845,.565);ls.rotation.z=s*.3;nh.add(ls);nh.add(at(mesh(new THREE.SphereGeometry(.012,6,4),K),s*.04,.73,.755));}
  const tl=new THREE.Group();tl.position.set(0,1.02,-.55);tl.userData.dyn=true;cm.add(tl);G.camelTail=tl;tl.add(at(mesh(new THREE.CapsuleGeometry(.025,.3,3,6),fur),0,-.17,-.03));tl.add(at(mesh(new THREE.SphereGeometry(.05,8,6),furD),0,-.36,-.05));}
 spot('camel',-3.5,1.1,.3,1.1);
 {const t=new THREE.Group();t.position.set(-2.95,0,-.9);world.add(t);t.add(at(mesh(new THREE.CylinderGeometry(.34,.34,.05,24),M('#7A4A2A',{roughness:.6})),0,.24,0));for(let k=0;k<4;k++){const a=k/4*6.28+.4;t.add(at(mesh(new THREE.BoxGeometry(.05,.22,.05),mat.woodDark),Math.cos(a)*.24,.11,Math.sin(a)*.24));}
  const bp=[[0,0],[.12,0],[.22,.05],[.28,.13],[.3,.14],[0,.14]].map(([a,b])=>new THREE.Vector2(a,b));t.add(at(mesh(new THREE.LatheGeometry(bp,28),M('#1F7A8C',{roughness:.25})),0,.265,0));t.add(at(mesh(new THREE.TorusGeometry(.29,.012,6,28),M('#F2C94C',{roughness:.3})),0,.4,0)).children.at(-1).rotation.x=Math.PI/2;
  const cc=mesh(new THREE.SphereGeometry(.24,18,10,0,Math.PI*2,0,Math.PI/2),M('#F0CF7A',{roughness:1,flatShading:true}));cc.scale.y=.45;cc.position.y=.39;t.add(cc);
  for(let i=0;i<5;i++){const a=i/5*6.28;const c=mesh(new THREE.ConeGeometry(.03,.16,8),M('#E8731E'));c.rotation.z=Math.PI/2;c.rotation.y=a;c.position.set(Math.cos(a)*.08,.47,Math.sin(a)*.08);t.add(c);}
  for(let i=0;i<9;i++){const a=rnd()*6.28,r=rr(.05,.17);t.add(at(mesh(new THREE.SphereGeometry(.018,6,5),M('#E4C896')),Math.cos(a)*r,.45-r*.2,Math.sin(a)*r));}
  t.add(at(mesh(new THREE.SphereGeometry(.05,10,8),M('#3E8C3A')),0,.5,0));}
 spot('couscous',-2.95,.5,-.9);
 {const mc=document.createElement('canvas');mc.width=mc.height=320;const mx=mc.getContext('2d');mx.fillStyle='#CDBB9D';mx.fillRect(0,0,320,320);const N=32,cs=10;
  for(let i=0;i<N;i++)for(let j=0;j<N;j++){const u=(i+.5)/N*2-1,v=(j+.5)/N*2-1,m=Math.max(Math.abs(u),Math.abs(v)),d=Math.hypot(u,v),dia=Math.abs(u)+Math.abs(v);let c='#EFE4CF';
   if(m>.88)c=(i+j)%2?'#1E1A22':'#C98A2E';else if(m>.8)c='#B2462B';else if(d<.16)c='#1F7A8C';else if(d<.26)c='#F2C94C';else if(dia<.62&&dia>.5)c='#1E1A22';else if(dia<.5&&m<.4)c=(i+j)%2?'#B2462B':'#D9733C';else if(m<.62&&m>.56)c='#1F7A8C';else if((Math.abs(u)>.62&&Math.abs(v)>.62)&&d<1.05)c='#3E8C3A';
   const sh=(hash(i,j)-.5)*.12;mx.fillStyle=c;mx.globalAlpha=1;mx.fillRect(i*cs+1,j*cs+1,cs-2,cs-2);mx.fillStyle=sh>0?'rgba(255,255,255,'+sh+')':'rgba(0,0,0,'+(-sh)+')';mx.fillRect(i*cs+1,j*cs+1,cs-2,cs-2);}
  const mt=new THREE.CanvasTexture(mc);mt.colorSpace=THREE.SRGBColorSpace;mt.anisotropy=4;const mos=mesh(new THREE.PlaneGeometry(1.0,1.0),new THREE.MeshStandardMaterial({map:mt,roughness:.55}),{cast:false});mos.rotation.x=-Math.PI/2;mos.rotation.z=.35;mos.position.set(-2.55,.097,1.35);world.add(mos);}
 spot('mosaic',-2.55,.15,1.35,.8);
 // ---------- Salto Ángel: a tepui rising out of the sea, with the falls dropping off its edge ----------
 {const T=new THREE.Vector3(10.4,0,-4.8),d=T.clone().multiplyScalar(-1).setY(0).normalize();
  const tg=new THREE.CylinderGeometry(2.0,2.55,7.4,16,8);const tp=tg.attributes.position;const cols=[];const c1=new THREE.Color('#9A5A3A'),c2=new THREE.Color('#6E3D2A'),c3=new THREE.Color('#B9764B');
  for(let i=0;i<tp.count;i++){const x=tp.getX(i),y=tp.getY(i),z=tp.getZ(i),a=Math.atan2(z,x);const k=1+(noise(a*4+2,y*.25)-.5)*.22+(noise(a*11,y*.8)-.5)*.08;if(Math.abs(y)<3.69){tp.setX(i,x*k);tp.setZ(i,z*k);}const t=noise(a*6,y*.4);const c=c2.clone().lerp(t>.5?c3:c1,Math.abs(t-.5)*2);cols.push(c.r,c.g,c.b);}
  tg.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));tg.computeVertexNormals();const tep=mesh(tg,new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1}));tep.position.set(T.x,1.1,T.z);scene.add(tep);
  const cap=mesh(new THREE.CylinderGeometry(2.08,2.08,.18,16),mat.grassDark);cap.position.set(T.x,4.85,T.z);scene.add(cap);
  for(let i=0;i<26;i++){const a=rnd()*6.28,r=Math.sqrt(rnd())*1.8;const c=foliage(rr(.25,.4));c.position.set(T.x+Math.cos(a)*r,5.0,T.z+Math.sin(a)*r);scene.add(c);}
  for(let i=0;i<5;i++){const a=rnd()*6.28,r=rr(.3,1.5);const tr=mesh(new THREE.ConeGeometry(.28,.9,7),mat.cypress);tr.position.set(T.x+Math.cos(a)*r,5.4,T.z+Math.sin(a)*r);scene.add(tr);}
  const wc=document.createElement('canvas');wc.width=64;wc.height=256;const wx=wc.getContext('2d');wx.fillStyle='rgba(230,245,255,.6)';wx.fillRect(0,0,64,256);for(let i=0;i<90;i++){wx.fillStyle=`rgba(255,255,255,${rr(.4,1)})`;wx.fillRect(rr(0,62),rr(0,256),rr(1,3.5),rr(18,80));}
  const wt=new THREE.CanvasTexture(wc);wt.wrapS=wt.wrapT=THREE.RepeatWrapping;wt.repeat.set(1,3);G.fallTex=wt;
  const fallM=new THREE.MeshStandardMaterial({map:wt,transparent:true,side:THREE.DoubleSide,roughness:.2,emissive:'#CFEFFF',emissiveIntensity:.25,depthWrite:false});
  const strand=(off,w0,w1)=>{const side=new THREE.Vector3(-d.z,0,d.x);const N=30,pos=[],uv=[],idx=[];for(let i=0;i<=N;i++){const t=i/N;const r=2.12+.35*t+.25*t*t;const y=4.9-7.3*t;const w=w0+(w1-w0)*t;for(const s of [-1,1]){const p=T.clone().addScaledVector(d,r).addScaledVector(side,off+s*w);pos.push(p.x,y,p.z);uv.push(s<0?0:1,t*1.5);}}
   for(let i=0;i<N;i++){const a=i*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();scene.add(new THREE.Mesh(g,fallM));};
  strand(0,.3,.62);strand(.75,.1,.28);
  const base=T.clone().addScaledVector(d,2.75);const mist=new THREE.MeshBasicMaterial({color:'#FFFFFF',transparent:true,opacity:.42,depthWrite:false,fog:true});
  for(let i=0;i<10;i++){const b=new THREE.Mesh(new THREE.IcosahedronGeometry(rr(.35,.7),1),i<6?mat.foam:mist);b.position.set(base.x+rr(-.8,.8),-2.3+(i<6?0:rr(.2,.9)),base.z+rr(-.6,.6));b.scale.y=i<6?.4:.8;scene.add(b);}
  G.tepuiAt=T.clone();
  // a chigüire (capybara) on a rock at the foot of the falls, with a mandarin on its head
  const rk=blob(.75,mat.rockDark,1);rk.scale.y=.5;const rp=T.clone().addScaledVector(d,3.6).add(new THREE.Vector3(-d.z,0,d.x).multiplyScalar(1.5));rk.position.set(rp.x,-2.25,rp.z);scene.add(rk);
  const cy=new THREE.Group();cy.position.set(rp.x,-1.92,rp.z);cy.lookAt(0,-1.92,0);scene.add(cy);const br=M('#8A5A35',{roughness:.95}),brD=M('#6B4428',{roughness:.95});
  const cb=mesh(new THREE.SphereGeometry(.3,16,12),br);cb.scale.set(.85,.75,1.15);cy.add(cb);const ch=mesh(new THREE.BoxGeometry(.24,.22,.3),br);ch.position.set(0,.12,.36);cy.add(ch);cy.add(at(mesh(new THREE.BoxGeometry(.22,.12,.06),brD),0,.07,.52));
  for(const s of [-1,1]){cy.add(at(mesh(new THREE.SphereGeometry(.04,8,6),brD),s*.09,.26,.28));cy.add(at(mesh(new THREE.SphereGeometry(.022,8,6),M('#141018')),s*.1,.17,.45));}
  for(const [x,z] of [[-.15,.18],[.15,.18],[-.15,-.2],[.15,-.2]])cy.add(at(mesh(new THREE.CylinderGeometry(.05,.05,.16,8),brD),x,-.2,z));
  cy.add(at(mesh(new THREE.SphereGeometry(.06,12,10),M('#F28C12',{roughness:.5})),0,.3,.36));cy.add(at(mesh(new THREE.ConeGeometry(.02,.04,5),stemG),0,.37,.36));
  spot('chiguire',rp.x,-1.8,rp.z,1.0);
  spot('angel',T.x+d.x*2.3,2.5,T.z+d.z*2.3,2.6);}
}

// ---------- lights ----------
const lampLights=[];const addLamp=(c,i,d,dc,x,y,z)=>{const l=new THREE.PointLight(c,i,d,dc);l.userData.base=i;l.position.set(x,y,z);scene.add(l);lampLights.push(l);};
const sun=new THREE.DirectionalLight(P.sun,P.sunI);sun.position.set(...P.sunPos).multiplyScalar(1.4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-11;sun.shadow.camera.right=11;sun.shadow.camera.top=11;sun.shadow.camera.bottom=-11;sun.shadow.bias=-.0004;sun.shadow.normalBias=.03;sun.shadow.radius=4;scene.add(sun);
const hemi=new THREE.HemisphereLight(P.hemiSky,P.hemiGnd,P.hemiI);scene.add(hemi);
for(const l of lanterns)addLamp('#FFB45A',3.2,4.5,1.6,l.position.x,l.position.y+.3,l.position.z);
addLamp('#FFD38A',4,6,1.4,2.3,2.1,.4);addLamp('#FFC070',2.5,3.5,1.5,0,1.6,-3.1);addLamp('#FFC88A',3.2,3.2,1.4,4.4,1.6,1.9);addLamp('#FFD8A0',1.3,3.2,1.6,-2.9,1.5,-.7);

// sky dressing: clouds by day/dusk, stars + moon + fireflies at night
const dayG=new THREE.Group();dayG.userData.dyn=true;scene.add(dayG);G.bfs=[];
{const homes=[[-2.7,3.1],[2.55,3.75],[-.9,3.2],[2.2,-.4]];const bodyM=M('#2A2133');for(let i=0;i<8;i++){const c=['#F6B21B','#FFFFFF','#9A7FE0','#F25BA8'][i%4];const bm=new THREE.MeshStandardMaterial({color:c,side:THREE.DoubleSide,roughness:.6});const bf=new THREE.Group();bf.add(mesh(new THREE.CapsuleGeometry(.008,.05,3,6),bodyM,{cast:false}));bf.children[0].rotation.x=Math.PI/2;
 for(const sx of [-1,1]){const w=new THREE.Group();const up=mesh(new THREE.CircleGeometry(.05,10),bm,{cast:false});up.position.set(sx*.045,0,-.012);up.scale.set(1,1.15,1);const lo=mesh(new THREE.CircleGeometry(.032,10),bm,{cast:false});lo.position.set(sx*.03,0,.03);w.add(up,lo);w.rotation.x=-Math.PI/2;const hinge=new THREE.Group();hinge.add(w);hinge.userData.side=sx;bf.add(hinge);}
 const h=homes[i%4];bf.userData={home:new THREE.Vector3(h[0],rr(.9,1.4),h[1]),ph:rnd()*6,r:rr(.3,.7)};bf.position.copy(bf.userData.home);dayG.add(bf);G.bfs.push(bf);}}
dayG.visible=LIGHT==='day';
const cloudG=new THREE.Group();cloudG.userData.dyn=true;scene.add(cloudG);const cloudM=M('#FFFFFF',{flatShading:true,roughness:1,emissive:'#FFFFFF',emissiveIntensity:.12});{const cm=cloudM;for(const [x,y,z,s] of [[-30,4.5,-48,1.6],[14,5.5,-58,1.3],[44,3.5,-30,1.1],[-52,3,-20,1.2],[-8,6.5,-70,1.5]]){const c=new THREE.Group();for(let i=0;i<7;i++){const b=blob(rr(1.2,2.2),cm,1);b.position.set(rr(-2.6,2.6),rr(-.3,.6),rr(-1,1));b.scale.y=.6;b.castShadow=false;c.add(b);}c.position.set(x,y,z);c.scale.setScalar(s);cloudG.add(c);}}
const nightG=new THREE.Group();nightG.userData.dyn=true;scene.add(nightG);{const sg=new THREE.BufferGeometry();const sp=[];for(let i=0;i<500;i++){const a=rnd()*Math.PI*2,e=rr(.12,1.3);sp.push(Math.cos(a)*Math.cos(e)*150,Math.sin(e)*150,Math.sin(a)*Math.cos(e)*150);}sg.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));nightG.add(new THREE.Points(sg,new THREE.PointsMaterial({color:'#FFFFFF',size:.8,sizeAttenuation:true,fog:false})));
 const moon=new THREE.Mesh(new THREE.SphereGeometry(3.2,32,24),new THREE.ShaderMaterial({fog:false,uniforms:{L:{value:new THREE.Vector3(...moonLight(moonPhase()))},c:{value:new THREE.Color('#F4EEDC')}},
  vertexShader:'varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform vec3 L;uniform vec3 c;varying vec3 vN;void main(){float lit=smoothstep(-.08,.12,dot(vN,normalize(L)));gl_FragColor=vec4(mix(c*.07,c,lit),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}));G.moon=moon;moon.position.copy(new THREE.Vector3(...PALS.night.sunPos).normalize().multiplyScalar(120));nightG.add(moon);
 const ff=new THREE.MeshBasicMaterial({color:'#FFE9A0'});const ffG=new THREE.SphereGeometry(.018,6,4);for(let i=0;i<20;i++){const f=mesh(ffG,ff,{cast:false});const a=rnd()*Math.PI*2,r=rr(1.2,5.4);f.position.set(Math.cos(a)*r,rr(.35,1.6),Math.sin(a)*r);nightG.add(f);(G.ff||(G.ff=[])).push(f);}}
nightG.visible=LIGHT==='night';cloudG.visible=LIGHT!=='night';

// clouds drifting around the tepui top, by day and at golden hour
{const T=G.tepuiAt;for(let i=0;i<4;i++){const c=new THREE.Group();for(let k=0;k<5;k++){const bb=blob(rr(.5,.9),cloudM,1);bb.castShadow=false;bb.position.set(rr(-1.2,1.2),rr(-.2,.3),rr(-.6,.6));bb.scale.y=.55;c.add(bb);}const a=i/4*6.28+.3;c.position.set(T.x+Math.cos(a)*2.4,4.6+rr(0,1.4),T.z+Math.sin(a)*2.4);cloudG.add(c);}}
// ---------- night only: Catatumbo lightning flickering silently far out at sea ----------
{const sg=new THREE.Group();sg.position.set(34,0,-50);nightG.add(sg);G.storm=sg;const sm=M('#2C3050',{flatShading:true,roughness:1,emissive:'#B9B4FF',emissiveIntensity:0});G.stormM=sm;
 for(let i=0;i<9;i++){const b=blob(rr(2.2,3.6),sm,1);b.castShadow=false;b.position.set(rr(-6,6),rr(9,11.5),rr(-2.5,2.5));b.scale.y=.55;sg.add(b);}
 const boltM=new THREE.MeshBasicMaterial({color:'#EEEAFF',fog:false});G.bolts=[];
 for(let k=0;k<3;k++){const pts=[];let x=rr(-4,4),z=rr(-1,1);for(let y=9;y>-2.4;y-=1.1){pts.push(new THREE.Vector3(x,y,z));x+=rr(-1.1,1.1);z+=rr(-.4,.4);}const bo=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts,false,'catmullrom',.1),40,.09,4,false),boltM);bo.visible=false;sg.add(bo);G.bolts.push(bo);}}
spot('catatumbo',34,9,-50,9);
// ---------- night only: a shooting star now and then (and the real moon, full or not) ----------
{const sm=new THREE.MeshBasicMaterial({color:'#FFF6D8',transparent:true,opacity:0,fog:false,depthWrite:false});const st=new THREE.Mesh(new THREE.CylinderGeometry(.09,0,10,6,1,true),sm);
 st.visible=false;st.userData.dyn=true;nightG.add(st);G.shoot={mesh:st,mat:sm,t:-1,next:nextShootingStar(),v:new THREE.Vector3()};}

// ---------- switch the time of day in place ----------
function applyLight(L){LIGHT=L;P=PALS[L];
 renderer.toneMappingExposure=P.exposure;scene.fog.color.set(P.fog);scene.environmentIntensity=P.env;
 const u=skyMat.uniforms;u.top.value.set(P.skyTop);u.bot.value.set(P.skyBot);u.sunDir.value.set(...P.sunPos).normalize();u.glow.value.set(L==='night'?'#C9D6FF':'#FFE2B0');u.gs.value=L==='night'?.35:L==='dusk'?.42:.6;
 mat.lamp.emissiveIntensity=P.lamp*3.2;mat.bulb.emissiveIntensity=P.lamp*5;mat.window.color.set(L==='day'?'#2B4F7A':'#FFD38A');mat.window.emissiveIntensity=P.lamp*1.8;jasM.emissiveIntensity=L==='night'?.35:.06;
 const w=G.water;if(w){const wu=w.material.uniforms;wu.sunDirection.value.set(...P.sunPos).normalize();wu.sunColor.value.set(P.sun);wu.waterColor.value.set(P.seaDeep);wu.distortionScale.value=L==='night'?1.2:2.0;}
 G.drawShallows(L);
 sun.color.set(P.sun);sun.intensity=P.sunI;sun.position.set(...P.sunPos).multiplyScalar(1.4);hemi.color.set(P.hemiSky);hemi.groundColor.set(P.hemiGnd);hemi.intensity=P.hemiI;
 for(const l of lampLights){l.visible=P.lamp>0;l.intensity=l.userData.base*P.lamp;}
 dayG.visible=L==='day';cloudG.visible=L!=='night';cloudM.color.set(L==='dusk'?'#FFD2B8':'#FFFFFF');cloudM.emissive.set(L==='dusk'?'#FF9F6E':'#FFFFFF');cloudM.emissiveIntensity=L==='dusk'?.25:.12;nightG.visible=L==='night';
 renderer.shadowMap.needsUpdate=true;}
applyLight(LIGHT);

// ---------- camera views ----------
const cam=new THREE.PerspectiveCamera(30,W/H,.1,400);
const VIEWS={stage8:[[8.4,3.6,6.9],[3.3,1.6,0.0]],sky8:[[-12.5,3.0,17.0],[-1.4,6.8,-1.3]],hero6a:[[-11.6,10.35,17.4],[-.2,1.75,-.6]],hero6b:[[-2.5,11.9,21],[.2,1.6,-.8]],care6:[[-1.5,4.2,8.8],[-.4,.7,.2]],night6:[[-12,7.6,16.5],[.4,2.4,-.6]],ve6:[[7,8,21],[5,1.4,-2.3]],ve6old:[[15.5,6.2,9.0],[2.2,1.2,-1.2]],arepas:[[5.7,1.5,4.9],[4.25,.55,3.25]],tall2:[[-5.5,13.5,25],[-.4,-1.2,-.4]],venezuela:[[10.6,3.2,4.6],[4.9,1.1,1.2]],falls:[[6.2,0,12.5],[3.2,-1.0,5.0]],harissa:[[-1.6,1.7,.2],[-3.3,1.1,-1.7]],tepui:[[3.6,4.2,6.2],[9.6,2.2,-4.0]],camel:[[-1.2,2.0,2.6],[-3.5,1.0,.2]],ruins:[[-1.0,2.0,2.9],[-3.6,.9,.2]],top:[[0,30,.01],[0,0,0]],tall:[[-13,11.5,23],[-.2,.2,0]],left:[[-13.5,7.4,20.5],[-.6,.3,-.4]],music:[[7.0,2.3,5.4],[4.0,.95,1.2]],tunisia:[[-1.0,2.4,2.3],[-4.0,1.1,-2.2]],italy:[[5.6,5.6,2.6],[3.2,2.2,-2.9]],phoneL:[[-11.6,8.8,17.4],[-.4,.5,-.2]],phone:[[15.5,8.6,18.2],[.2,.6,0]],hero:[[18.5,7.6,21.5],[0,.1,0]],wide:[[19,12,21],[0,-.6,0]],close:[[3.2,3.4,9.6],[0,.6,2.2]],pergola:[[7.4,3.8,6.8],[1.8,1.0,-.6]],door:[[-1.5,2.4,5.2],[-.2,1.0,-2.6]]};
const [cp,ct]=VIEWS[VIEW]||VIEWS.hero;cam.position.set(...cp);cam.lookAt(...ct);
if(VIEW==='tall')cam.fov=40;if(VIEW==='tall2')cam.fov=46;if(VIEW==='close'||VIEW==='door'||VIEW==='pergola')cam.fov=34;if(VIEW==='phone'||VIEW==='phoneL')cam.fov=34;if(['music','tunisia','italy','venezuela','falls','harissa','ruins','tepui','camel'].includes(VIEW))cam.fov=36;cam.updateProjectionMatrix();
{const FOVS={stage8:50,sky8:52,hero6a:40,hero6b:38,care6:44,night6:42,ve6:44,ve6old:40,arepas:40};if(FOVS[VIEW]){cam.fov=FOVS[VIEW];cam.updateProjectionMatrix();}}

// ---------- light without a bloom pass: soft glow sprites and light pools (sharper and much cheaper) ----------
const glowTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');const g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.22,'rgba(255,244,214,.7)');g.addColorStop(.55,'rgba(255,206,130,.2)');g.addColorStop(1,'rgba(255,180,90,0)');x.fillStyle=g;x.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
scene.updateMatrixWorld(true);
const gp={big:[],small:[],pool:[]};
scene.traverse(o=>{if(!o.isMesh)return;const p=new THREE.Vector3();o.getWorldPosition(p);if(o.material===mat.lamp){gp.big.push(p);gp.pool.push(p);}else if(o.material===mat.bulb)gp.small.push(p);else if(o.material===mat.window)gp.big.push(p);});
const mkPts=(arr,size,color)=>{const g=new THREE.BufferGeometry().setFromPoints(arr);const m=new THREE.PointsMaterial({map:glowTex,size,color,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,sizeAttenuation:true,fog:false});const p=new THREE.Points(g,m);p.frustumCulled=false;scene.add(p);return p;};
const glowBig=mkPts(gp.big,1.4,'#FFC56E'),glowSmall=mkPts(gp.small,.45,'#FFE3A0');
const pools=new THREE.Mesh(mergeGeometries(gp.pool.map(p=>{const g=new THREE.PlaneGeometry(2.4,2.4);g.rotateX(-Math.PI/2);g.translate(p.x,.1,p.z);return g;})),new THREE.MeshBasicMaterial({map:glowTex,color:'#FFB65C',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2}));scene.add(pools);
const ffMat=new THREE.SpriteMaterial({map:glowTex,color:'#F4FF9C',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
for(const f of G.ff||[]){const s=new THREE.Sprite(ffMat);s.scale.setScalar(.34);f.add(s);}
for(const l of lampLights.splice(0,6))scene.remove(l); // the six lantern lights become glows
function updGlow(){const k=P.lamp;glowBig.visible=glowSmall.visible=pools.visible=k>0;glowBig.material.opacity=Math.min(1,k*.9);glowSmall.material.opacity=Math.min(1,k);pools.material.opacity=k*.6;}
updGlow();

// ---------- bake everything that never moves into one mesh per material ----------
const KEEP=new Set([mat.lamp,mat.bulb,mat.window,jasM,cloudM]);
const matKey=m=>[m.type,m.color.getHexString(),m.emissive.getHexString(),m.emissiveIntensity,m.roughness,m.metalness,m.flatShading,m.side,m.vertexColors,m.envMapIntensity].join('|');
function bake(root){root.updateMatrixWorld(true);const skip=new Set();root.traverse(o=>{if(o.userData.dyn)o.traverse(c=>skip.add(c));});
 const buckets=new Map(),done=[];
 root.traverse(o=>{if(!o.isMesh||skip.has(o)||!o.visible||o.children.length)return;const m=o.material;if(!m||Array.isArray(m)||!m.isMeshStandardMaterial||m.map||m.transparent)return;
  const key=(KEEP.has(m)?m.uuid:matKey(m))+(o.castShadow?'c':'')+(o.receiveShadow?'r':'');let b=buckets.get(key);if(!b)buckets.set(key,b={m,c:o.castShadow,r:o.receiveShadow,g:[]});
  const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
  for(const k of Object.keys(g.attributes))if(k!=='position'&&k!=='normal'&&!(k==='color'&&m.vertexColors))g.deleteAttribute(k);
  g.morphAttributes={};g.clearGroups();if(!g.attributes.normal)g.computeVertexNormals();
  g.applyMatrix4(o.matrixWorld);
  if(o.matrixWorld.determinant()<0){const p=g.attributes.position.array,n=g.attributes.normal.array;for(let i=0;i<p.length;i+=9)for(let j=0;j<3;j++){let t=p[i+3+j];p[i+3+j]=p[i+6+j];p[i+6+j]=t;t=n[i+3+j];n[i+3+j]=n[i+6+j];n[i+6+j]=t;}}
  b.g.push(g);done.push(o);});
 for(const o of done)o.removeFromParent();
 let n=0;for(const b of buckets.values()){const mg=mergeGeometries(b.g,false);if(!mg)continue;mg.computeBoundingSphere();const mm=new THREE.Mesh(mg,b.m);mm.castShadow=b.c;mm.receiveShadow=b.r;mm.matrixAutoUpdate=false;root.add(mm);n++;}
 root.traverse(o=>{if(!skip.has(o)&&o!==root&&!o.isCamera){o.updateMatrix();o.matrixAutoUpdate=false;}});
 return {merged:done.length,meshes:n};}
G.bake=bake(scene);
{const an=renderer.capabilities.getMaxAnisotropy();scene.traverse(o=>{const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms)for(const k of ['map','normalMap','roughnessMap'])if(m?.[k]&&m[k].anisotropy<an){m[k].anisotropy=an;m[k].needsUpdate=true;}});}

// ---------- easter eggs (after the bake, so they can move): a sleeping cat, a seashell, and little bursts ----------
// Bsissa, the cat, asleep on the red cushion of the bench under the pergola
const catG=new THREE.Group();catG.userData.dyn=true;{const fur=M('#E39A4E',{roughness:.9}),furL=M('#F6D2A2',{roughness:.9}),dark=M('#2A1A10');
 const body=mesh(new THREE.SphereGeometry(.17,18,12),fur);body.scale.set(1.15,.62,.9);catG.add(body);
 const head=new THREE.Group();head.position.set(.17,.06,.05);catG.add(head);G.catHead=head;
 head.add(mesh(new THREE.SphereGeometry(.09,16,12),fur));for(const z of [-.05,.05]){const e=mesh(new THREE.ConeGeometry(.035,.07,8),fur);e.position.set(0,.09,z);head.add(e);}
 const muzzle=mesh(new THREE.SphereGeometry(.045,12,8),furL);muzzle.position.set(.065,-.02,0);muzzle.scale.set(.8,.7,1);head.add(muzzle);
 for(const z of [-.035,.035]){const eye=mesh(new THREE.SphereGeometry(.012,8,6),dark);eye.position.set(.075,.025,z);eye.scale.y=.25;head.add(eye);G['catEye'+(z<0?'L':'R')]=eye;}
 const tail=mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-.16,-.02,0),new THREE.Vector3(-.24,-.03,.12),new THREE.Vector3(-.12,-.04,.22),new THREE.Vector3(.04,-.05,.2)]),16,.03,8,false),fur);catG.add(tail);G.catTail=tail;
 const local=new THREE.Vector3(.38,.66,-.35).applyAxisAngle(UP,-.35).add(new THREE.Vector3(2.3,0,-.4));catG.position.copy(local);catG.rotation.y=-.35+Math.PI;catG.scale.setScalar(1.15);scene.add(catG);}
// a seashell on the top step down to the sea
const shellG=new THREE.Group();shellG.userData.dyn=true;{const sm=M('#FFD9C7',{roughness:.45}),sl=M('#E8A890');
 const sh=mesh(new THREE.SphereGeometry(.16,20,10,0,Math.PI*2,0,Math.PI/2),sm);sh.scale.set(1,.45,.9);shellG.add(sh);
 for(let i=-3;i<=3;i++){const r=mesh(new THREE.BoxGeometry(.012,.02,.3),sl);r.rotation.y=i*.25;r.position.y=.035;shellG.add(r);}
 const a=Math.PI/2.6;shellG.position.set(Math.cos(a)*6.05*IK,.02,Math.sin(a)*6.05*IK);shellG.rotation.y=.6;scene.add(shellG);}
// the eggs you can tap: precise meshes (cat, shell) or places (fountain, lanterns, the boat)
G.eggs=[{id:'fountain',p:[-.1,1.0,-.4],r:1.15},{id:'boat',p:[Math.cos(Math.PI/2.6+.25)*8.7*IK,-2.0,Math.sin(Math.PI/2.6+.25)*8.7*IK],r:1.5},
  ...lanterns.map(l=>({id:'lantern',p:[l.position.x,l.position.y+.35,l.position.z],r:.45}))];
// little bursts: coins, fireflies, hearts, bubbles, petals
const bursts=[];const burstG=new THREE.SphereGeometry(1,8,6),petalG=new THREE.CircleGeometry(1,6);
function burst(at,{color='#FFD58A',n=24,speed=1.6,up=2.2,life=1.8,size=.035,grav=4,glow=false,petal=false,spread=.25}={}){
 const m=new THREE.MeshBasicMaterial({color,transparent:true,side:THREE.DoubleSide,depthWrite:false,fog:false});
 for(let i=0;i<n;i++){const o=new THREE.Mesh(petal?petalG:burstG,m);o.scale.setScalar(size*(glow?1:rr(.7,1.3)));o.position.set(at[0]+rr(-spread,spread),at[1]+rr(-spread*.4,spread*.4),at[2]+rr(-spread,spread));
  const a=rnd()*Math.PI*2,v=rr(.3,1)*speed;o.userData={v:new THREE.Vector3(Math.cos(a)*v,rr(.5,1)*up,Math.sin(a)*v),life:life*rr(.7,1.2),age:0,grav,petal,spin:rr(-6,6)};scene.add(o);bursts.push(o);}
 lastActive=performance.now();}
function stepBursts(dt){for(let i=bursts.length-1;i>=0;i--){const o=bursts[i],u=o.userData;u.age+=dt;u.v.y-=u.grav*dt;
  if(u.petal){u.v.x+=Math.sin(u.age*3+i)*dt*.6;o.rotation.x+=u.spin*dt;o.rotation.y+=u.spin*.7*dt;}
  o.position.addScaledVector(u.v,dt);o.material.opacity=Math.max(0,1-u.age/u.life);if(u.age>=u.life){scene.remove(o);bursts.splice(i,1);}}
 if(bursts.length)lastActive=performance.now();}
let catWake=0,skyTaps=[];
function egg(id,hp){
 if(id==='cat'){catWake=performance.now();burst([catG.position.x,catG.position.y+.35,catG.position.z],{color:'#FF6B8A',n:10,speed:.25,up:.9,grav:-.2,life:2.4,size:.05});}
 else if(id==='fountain'){burst([-.1,1.15,-.4],{color:'#F2C14E',n:8,speed:.6,up:3,size:.04,life:1.1});setTimeout(()=>burst([-.1,.5,-.4],{color:'#BFE3FF',n:30,speed:1.4,up:1.6,size:.03,life:1.2}),550);}
 else if(id==='lantern'){if(LIGHT==='day'){eventCb?.({kind:'egg',id:'lanternDay'});return;}burst(hp,{color:'#FFE9A0',n:26,speed:.9,up:.5,grav:-.15,life:3,size:.025,glow:true,spread:.5});}
 else if(id==='shell'){burst([shellG.position.x,.3,shellG.position.z],{color:'#DFF4FF',n:16,speed:.3,up:1,grav:-.4,life:2.2,size:.04});}
 else if(id==='boat'){burst(hp,{color:'#FFFFFF',n:20,speed:1.2,up:1.4,size:.035,life:1.1});}
 else if(id==='petals'){for(let k=0;k<4;k++)setTimeout(()=>burst([rr(-3,3),7,rr(-2,3)],{color:['#FF9EC2','#FFFFFF','#FFD58A','#C9A8FF'][k],n:22,speed:.5,up:0,grav:.9,life:7,size:.07,petal:true,spread:3}),k*300);}
 eventCb?.({kind:'egg',id});}



// ---------- on the home screen: fingers, time of day, real flowers, taps ----------
const [V0,V1]=VIEWS.night6;cam.position.set(...V0);
const controls=new OrbitControls(cam,renderer.domElement);
// free to turn all the way round, look from above, come close, and slide over the island with two fingers
controls.target.set(...V1);controls.enableDamping=true;controls.dampingFactor=.08;controls.enablePan=true;controls.screenSpacePanning=false;controls.panSpeed=.8;
controls.minDistance=5;controls.maxDistance=44;controls.minPolarAngle=.08;controls.maxPolarAngle=1.48;
controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
controls.update();
const AZ0=controls.getAzimuthalAngle();
// the look-at point never leaves the island
controls.addEventListener('change',()=>{const t=controls.target,d=Math.hypot(t.x,t.z),max=IR*.9;if(d>max){t.x*=max/d;t.z*=max/d;}t.y=THREE.MathUtils.clamp(t.y,0,3);});
const SWAY=.42,SWAYV=.3;controls.autoRotate=!reduce;controls.autoRotateSpeed=SWAYV;
let busy=false,lastActive=performance.now();
controls.addEventListener('start',()=>{busy=true;controls.autoRotate=false;});controls.addEventListener('end',()=>{busy=false;lastActive=performance.now();});

// sharp on every screen, stepping down only if the phone struggles
const DPR=devicePixelRatio||1,LV=[Math.min(DPR,2.5),Math.min(DPR,2),Math.min(DPR,1.5)];let lvl=0,shownW=0,shownH=0,shownPR=0;
// a resize clears the picture: only when the size really changed, and drawn again at once (no blank frame, no flicker)
function resize(){const w=GEL.clientWidth,h=GEL.clientHeight;if(!w||!h)return;if(w===shownW&&h===shownH&&LV[lvl]===shownPR)return;shownW=w;shownH=h;shownPR=LV[lvl];
 renderer.setPixelRatio(LV[lvl]);renderer.setSize(w,h);cam.aspect=w/h;cam.fov=w/h<.82?46:42;cam.updateProjectionMatrix();lastActive=performance.now();try{renderer.render(scene,cam);}catch{}}
const sizeWatch=new ResizeObserver(resize);sizeWatch.observe(GEL);resize();

// rest when the garden is scrolled away or the app is in the background
let onScreen=true;const seenWatch=new IntersectionObserver(es=>{onScreen=es[es.length-1].isIntersecting;},{threshold:.01});seenWatch.observe(GEL);

// The shared garden's real flowers. The database stores no position, so each flower gets a
// stable spot on open grass from its id: both phones show the same garden.
const OB=[[-4.15,-2.2,1.45],[-.17,-.5,1.2],[2.35,-.5,1.85],[3.35,-2.95,1.0],[4.5,-2.6,.6],[5.0,-1.2,.6],[-4.8,1.8,.5],[4.05,1.25,1.0],[5.55,.2,.6],[5.6,1.0,.6],[5.72,1.65,.35],[4.25,3.25,.45],[-5.05,-.45,.6],[-4.33,-.27,.4],[-4.53,-.96,.35],[-2.05,-1.2,.35],[-1.63,-1.2,.3],[-5.35,-1.55,.4],[-3.55,.25,.9],[-2.95,-.9,.5],[-2.55,1.35,.72],[-1.75,-2.75,.55],[1.35,-3.0,.45],[-1.45,-3.0,.45],[-1.9,4.7,.4],[.9,4.6,.35],[1.25,5.15,.3],[.6,2.6,.3],[.9,1.3,.3],[-1.2,-1.9,.3],[1.0,-2.4,.3],[-4.9,2.6,.3]];
for(let k=0;k<4;k++)OB.push([-.95+k*.05,2.0+k*.72,.35]);
for(const [bx,bz,rot,len] of [[-2.7,3.1,.35,3.3],[2.55,3.75,-.35,2.6]])for(let t=-.5;t<=.501;t+=.1)OB.push([bx+Math.cos(rot)*len*t,bz-Math.sin(rot)*len*t,.62]);
const SLOTS=[];for(let x=-6.0;x<=6.0;x+=.62)for(let z=-3.0;z<=6.0;z+=.62){const jx=x+(hash(x,z)-.5)*.2,jz=z+(hash(z,x)-.5)*.2;if(Math.hypot(jx,jz)<5.4*IK&&jz>-3.2&&!OB.some(([ox,oz,r])=>Math.hypot(jx-ox,jz-oz)<r+.12))SLOTS.push([jx,jz]);}
const idHash=id=>{let h=2166136261;for(const c of String(id))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const nearestSlot=(x,z,ok=()=>true)=>{let b=-1,bd=Infinity;SLOTS.forEach(([sx,sz],i)=>{if(!ok(i,sx,sz))return;const d=Math.hypot(sx-x,sz-z);if(d<bd){bd=d;b=i;}});return b;};
const flowerRoot=new THREE.Group();flowerRoot.userData.dyn=true;scene.add(flowerRoot);
const shown=new Map();
function setFlowers(list){
 const want=new Map(list.map(f=>[f.id,f]));
 for(const [id,o] of shown)if(!want.has(id)){flowerRoot.remove(o.g);shown.delete(id);}
 // oldest first, so a new flower never moves an older one
 const used=new Set([...shown.values()].map(o=>o.slot));
 for(const f of [...list].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))||String(a.id).localeCompare(String(b.id)))){
  const cur=shown.get(f.id);if(cur&&cur.type===f.type&&cur.stage===f.stage&&cur.droop===!!f.droop&&cur.px===f.px)continue;
  let slot=cur?.slot;if(slot===undefined&&f.px!=null&&f.pz!=null){slot=nearestSlot(f.px,f.pz);used.add(slot);}if(slot===undefined){slot=idHash(f.id)%SLOTS.length;for(let i=0;i<SLOTS.length&&used.has(slot);i++)slot=(slot+1)%SLOTS.length;used.add(slot);}
  if(cur)flowerRoot.remove(cur.g);
  const g=flower(f.type,f.stage);const [x,z]=f.px!=null&&f.pz!=null?[f.px,f.pz]:SLOTS[slot];g.position.set(x,.09,z);g.rotation.y=(idHash(f.id)%628)/100;g.scale.setScalar(1.9);
  if(f.droop)g.rotation.z=.18;g.userData.flowerId=f.id;g.traverse(o=>{o.userData.flowerId=f.id;});
  flowerRoot.add(g);shown.set(f.id,{g,slot,type:f.type,stage:f.stage,droop:!!f.droop,px:f.px});}
 renderer.shadowMap.needsUpdate=true;lastActive=performance.now();
}

// ---------- the watering can: rests on the edge of the island; drag it onto a flower to water it ----------
const CAN_REST=new THREE.Vector3(4.6,.1,4.9);
const can=new THREE.Group();can.userData.dyn=true;{const enamel=M('#5F86D8',{roughness:.35,metalness:.35}),rim=M('#D9A35C',{roughness:.3,metalness:.8});
 const body=mesh(new THREE.CylinderGeometry(.42,.5,.8,32),enamel);body.position.y=.4;can.add(body);
 const top=mesh(new THREE.SphereGeometry(.42,32,12,0,Math.PI*2,0,Math.PI/2),enamel);top.scale.y=.35;top.position.y=.8;can.add(top);
 const band=mesh(new THREE.TorusGeometry(.5,.03,8,40),rim);band.rotation.x=Math.PI/2;band.position.y=.05;can.add(band);const band2=band.clone();band2.scale.setScalar(.86);band2.position.y=.8;can.add(band2);
 can.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(.38,.25,0),new THREE.Vector3(.75,.6,0),new THREE.Vector3(1.05,1.0,0)]),24,.06,10,false),enamel));
 const rose=mesh(new THREE.CylinderGeometry(.16,.07,.14,20),rim);rose.position.set(1.1,1.06,0);rose.rotation.z=-.9;can.add(rose);
 can.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-.3,.9,0),new THREE.Vector3(-.15,1.35,0),new THREE.Vector3(.25,1.3,0),new THREE.Vector3(.3,.92,0)]),24,.05,10,false),rim));
 can.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-.42,.7,0),new THREE.Vector3(-.75,.55,0),new THREE.Vector3(-.45,.18,0)]),20,.05,10,false),rim));}
can.scale.setScalar(.62);can.position.copy(CAN_REST);can.rotation.y=-2.2;scene.add(can);G.can=can;
const glowRing=new THREE.Mesh(new THREE.RingGeometry(.55,.7,32),new THREE.MeshBasicMaterial({color:'#FFD58A',transparent:true,opacity:.55,depthWrite:false}));glowRing.rotation.x=-Math.PI/2;glowRing.position.set(CAN_REST.x,.13,CAN_REST.z);glowRing.userData.dyn=true;scene.add(glowRing);
const drops=[];const dropM=new THREE.MeshBasicMaterial({color:'#A9D6FF'});const dropG=new THREE.SphereGeometry(.035,6,4);
let canDrag=null,waterCb=null,canHover=null;const dragPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-1.2),_hit=new THREE.Vector3();
function flowerNear(x,z,r=1.0){let best=null,bd=r;for(const [id,o] of shown){const d=Math.hypot(o.g.position.x-x,o.g.position.z-z);if(d<bd){bd=d;best=id;}}return best;}
function canPointer(e){const r=renderer.domElement.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,cam);}
// taps: the toad, a flower, the moon, or something from Tunisia or Venezuela
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),_v=new THREE.Vector3(),_p=new THREE.Vector3();
let tapCb=null,down=null;
const moonMesh=(()=>{let m=null;nightG.traverse(o=>{if(o.isMesh&&o.geometry.type==='SphereGeometry'&&o.geometry.parameters.radius>3)m=o;});return m;})();
const onDown=e=>{down=[e.clientX,e.clientY];canPointer(e);if(ray.intersectObject(can,true).length){canDrag={id:e.pointerId};controls.enabled=false;renderer.domElement.setPointerCapture?.(e.pointerId);down=null;lastActive=performance.now();}};
const onMove=e=>{if(!canDrag)return;canPointer(e);if(ray.ray.intersectPlane(dragPlane,_hit)){const d=Math.hypot(_hit.x,_hit.z),max=IR*.95;if(d>max){_hit.x*=max/d;_hit.z*=max/d;}can.position.set(_hit.x-.45,1.2,_hit.z);
  canHover=flowerNear(_hit.x,_hit.z);can.rotation.z=canHover?.75:.2;lastActive=performance.now();}};
const onCanUp=()=>{if(!canDrag)return;const id=canHover;canDrag=null;canHover=null;controls.enabled=true;can.rotation.z=0;can.position.copy(CAN_REST);if(id)waterCb?.(id);};
// double tap: fly to that spot; resetView(): back to the usual view
let fly=null;const flyTo=(target,pos)=>{fly={t0:performance.now(),ft:controls.target.clone(),fp:cam.position.clone(),tt:target.clone(),tp:pos.clone()};lastActive=performance.now();};
const onDbl=e=>{const r=renderer.domElement.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,cam);
 const hs=ray.intersectObjects(world.children,true).filter(h=>h.object.isMesh);if(!hs.length)return;const hp=hs[0].point.clone();hp.y=Math.max(0,Math.min(hp.y,2));
 const dir=cam.position.clone().sub(controls.target).normalize();flyTo(hp,hp.clone().addScaledVector(dir,7));};
let lastTap=null;
const onUp=e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>7)return;down=null;
 const r=renderer.domElement.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,cam);
 // the toad counts every tap (quick taps make him dance), so a tap on him is never a double tap to fly
 if(G.toadBody&&ray.intersectObject(G.toadBody,true).length){lastTap=null;tapCb?.({kind:'toad'});return;}
 const tnow=performance.now();if(lastTap&&tnow-lastTap.t<320&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<30){lastTap=null;onDbl(e);return;}lastTap={t:tnow,x:e.clientX,y:e.clientY};if(!tapCb)return;
 if(ray.intersectObject(catG,true).length){egg('cat');return;}if(ray.intersectObject(shellG,true).length){egg('shell');return;}
 const fh=ray.intersectObject(flowerRoot,true);if(fh.length&&fh[0].object.userData.flowerId){tapCb({kind:'flower',id:fh[0].object.userData.flowerId});return;}
 if(LIGHT==='night'&&moonMesh&&ray.intersectObject(moonMesh,false).length){tapCb({kind:'moon'});return;}
 const hs=ray.intersectObjects(scene.children,true).filter(h=>h.object.isMesh&&h.distance<120);
 if(hs.length){const hp=hs[0].point;let best=null,bd=Infinity;
  for(const s of G.spots||[]){if(s.id==='catatumbo'&&LIGHT!=='night')continue;const dd=hp.distanceTo(_v.set(...s.p));if(dd<s.r&&dd<bd){bd=dd;best=s.id;}}
  if(best){tapCb({kind:'spot',id:best});return;}
  for(const e of G.eggs||[]){if(hp.distanceTo(_v.set(...e.p))<e.r){egg(e.id,hp.toArray());return;}}
  if(hp.y<.4&&Math.hypot(hp.x,hp.z)<5.4){tapCb({kind:'soil'});return;}}
 // five taps on the sky within three seconds: petals rain on the island
 {const now=performance.now();skyTaps=skyTaps.filter(x=>now-x<3000);skyTaps.push(now);if(skyTaps.length>=5){skyTaps=[];egg('petals');}}
 tapCb({kind:'none'});};
renderer.domElement.addEventListener('pointerdown',onDown);renderer.domElement.addEventListener('pointermove',onMove);renderer.domElement.addEventListener('pointerup',onCanUp);renderer.domElement.addEventListener('pointercancel',onCanUp);renderer.domElement.addEventListener('pointerup',onUp);

await renderer.compileAsync(scene,cam).catch(()=>{});
const _sd=new THREE.Vector3(),_ss=new THREE.Vector3(),_up=new THREE.Vector3(0,1,0);let eventCb=null,fullMoonSaid=false;
const sayFullMoon=()=>{if(LIGHT==='night'&&!fullMoonSaid&&isFullMoon()){fullMoonSaid=true;setTimeout(()=>eventCb?.({kind:'fullMoon'}),1500);}};
const clock=new THREE.Clock();let frame=0,fpsN=0,fpsT=0,warm=0,nextBolt=2.5,boltOn=0,toadPlaying=false,frameCb=null;
renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.1),t=clock.elapsedTime;frame++;
 if(!onScreen||document.hidden)return;
 const idle=!busy&&performance.now()-lastActive>2500;
 if(idle&&frame%2)return;
 const step=idle?dt*2:dt;
 if(controls.autoRotate&&!busy){const az=controls.getAzimuthalAngle();if(az>AZ0+SWAY)controls.autoRotateSpeed=SWAYV;else if(az<AZ0-SWAY)controls.autoRotateSpeed=-SWAYV;}
 if(fly){const k=Math.min(1,(performance.now()-fly.t0)/650),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;controls.target.lerpVectors(fly.ft,fly.tt,e);cam.position.lerpVectors(fly.fp,fly.tp,e);lastActive=performance.now();if(k>=1)fly=null;}
 controls.update(step);
 glowRing.visible=!canDrag;glowRing.material.opacity=.35+.25*Math.sin(t*3);
 if(canDrag&&canHover&&drops.length<40){const d=mesh(dropG,dropM,{cast:false});const sp=new THREE.Vector3(1.1,1.06,0).applyMatrix4(can.matrixWorld);d.position.copy(sp);d.userData.v=-.5;scene.add(d);drops.push(d);}
 stepBursts(step);
 {const k=Math.max(0,1-(performance.now()-catWake)/3500),awake=k>0;catG.children[0].scale.y=.62+Math.sin(t*2.2)*.025;G.catHead.rotation.z=awake?.45*Math.min(1,k*3):Math.sin(t*.7)*.04;
  G.catEyeL.scale.y=G.catEyeR.scale.y=awake?1:.25;G.catTail.rotation.y=Math.sin(t*(awake?6:1.2))*(awake?.25:.08);}
 for(let i=drops.length-1;i>=0;i--){const d=drops[i];d.userData.v-=9.8*step;d.position.y+=d.userData.v*step;if(d.position.y<.12){scene.remove(d);drops.splice(i,1);}}
 const playing=toadPlaying;
 if(!reduce){const w=G.water;if(w)w.material.uniforms.time.value+=step*.45;if(G.fallTex)G.fallTex.offset.y+=step*1.1;
  if(nightG.visible){(G.ff||[]).forEach((f,i)=>{f.userData.o??=f.position.clone();f.position.set(f.userData.o.x+Math.sin(t*.5+i)*.3,f.userData.o.y+Math.sin(t*.9+i*2)*.15,f.userData.o.z+Math.cos(t*.4+i)*.3);f.scale.setScalar(.3+1.1*Math.max(0,Math.sin(t*1.6+i*1.9)));});
   nextBolt-=step;if(nextBolt<=0&&G.bolts){boltOn=.16;const b=G.bolts[Math.floor(Math.random()*3)];G.bolts.forEach(x=>x.visible=x===b);nextBolt=2+Math.random()*4.5;}
   if(boltOn>0){boltOn-=step;G.stormM.emissiveIntensity=boltOn>0?1.05*(boltOn/.16)+(Math.sin(t*60)>0?.2:0):0;if(boltOn<=0)G.bolts.forEach(x=>x.visible=false);}
   const S=G.shoot;if(S){if(S.t<0){S.next-=dt;if(S.next<=0){cam.getWorldDirection(_sd);_ss.crossVectors(_sd,_up).normalize();
      S.mesh.position.copy(cam.position).addScaledVector(_sd,90).addScaledVector(_up,28+Math.random()*16).addScaledVector(_ss,(Math.random()-.5)*50);
      S.v.copy(_ss).multiplyScalar(Math.random()<.5?-1:1).addScaledVector(_up,-.45).normalize();S.mesh.quaternion.setFromUnitVectors(_up,S.v.clone().negate());
      S.t=0;S.mesh.visible=true;eventCb?.({kind:'star'});}}
    else{S.t+=dt;S.mesh.position.addScaledVector(S.v,dt*70);S.mat.opacity=Math.sin(Math.PI*Math.min(1,S.t/.9));S.mesh.updateMatrix();
      if(S.t>=.9){S.t=-1;S.mesh.visible=false;S.next=nextShootingStar();}}}}
  if(dayG.visible)for(const b of G.bfs||[]){const u=b.userData,a=t*.55+u.ph;b.position.set(u.home.x+Math.cos(a)*u.r,u.home.y+Math.sin(t*1.7+u.ph)*.12,u.home.z+Math.sin(a*1.3)*u.r);b.rotation.y=-a;b.children.forEach(h=>{if(h.userData.side)h.rotation.z=h.userData.side*(.25+Math.sin(t*16+u.ph)*.75);});}
  (G.notes||[]).forEach((n,i)=>{n.visible=playing;if(!playing)return;n.userData.y0??=n.position.y;n.position.y=n.userData.y0+((t*.3+i*.33)%1)*.5;n.rotation.z=Math.sin(t*2+i)*.3;n.updateMatrix();});
  if(G.toadBody){const bachata=document.documentElement.classList.contains('toad-bachata');
   G.toadBody.rotation.z=bachata?Math.sin(t*8.4)*.16:playing?Math.sin(t*3.2)*.05:0;G.toadBody.rotation.y=bachata?Math.sin(t*4.2)*.5:0;G.toadBody.position.y=.4+(bachata?Math.abs(Math.sin(t*8.4))*.08:0);G.toadBody.updateMatrix();}
  if(G.camelHead){G.camelHead.rotation.x=Math.sin(t*.7)*.07;G.camelHead.rotation.y=Math.sin(t*.31)*.18;G.camelHead.updateMatrix();}
  if(G.camelTail){G.camelTail.rotation.z=Math.sin(t*2.3)*.35;G.camelTail.updateMatrix();}}
 renderer.render(scene,cam);
 if(frameCb)frameCb();
 // step down only after 4 s of real slowness while you move the garden (a short busy moment never blurs it)
 if(++warm>180&&busy){fpsN++;fpsT+=dt;if(fpsT>4){const fps=fpsN/fpsT;fpsN=0;fpsT=0;if(fps<32&&lvl<LV.length-1&&LV[lvl+1]<LV[lvl]){lvl++;resize();}}}});
// get the other times of day ready in the background, so switching is instant
const warmTimer=setTimeout(()=>{if(busy)return;const cur=LIGHT;for(const L of ['day','dusk','night'])if(L!==cur){applyLight(L);renderer.compile(scene,cam);}applyLight(cur);updGlow();},2500);

return {
 canvas:renderer.domElement,
 get light(){return LIGHT;},
 setLight(L){if(!PALS[L]||L===LIGHT)return;applyLight(L);updGlow();lastActive=performance.now();sayFullMoon();},
 setPlaying(on){toadPlaying=!!on;lastActive=performance.now();},
 setFlowers,
 onTap(fn){tapCb=fn;},
 onWater(fn){waterCb=fn;},
 // where on the lawn a screen point lands, and the free spot nearest to it on one side (-1 left, 1 right)
 groundAt(cx,cy){canPointer({clientX:cx,clientY:cy});const pl=new THREE.Plane(new THREE.Vector3(0,1,0),-.1);if(!ray.ray.intersectPlane(pl,_hit))return null;return Math.hypot(_hit.x,_hit.z)<IR*.95?{x:_hit.x,z:_hit.z}:null;},
 freeSpot(x,z,side=0){const taken=new Set([...shown.values()].map(o=>o.slot));const i=nearestSlot(x,z,(k,sx)=>!taken.has(k)&&(!side||Math.sign(sx)===side));return i<0?null:{x:+SLOTS[i][0].toFixed(3),z:+SLOTS[i][1].toFixed(3)};},
 // the seed tray's pictures: drawn once with the garden's own renderer into a small offscreen picture (a second 3D
 // canvas can make an iPhone drop the garden's own, and the garden would go blank)
 flowerIcons(){const out={},S=128,rt=new THREE.WebGLRenderTarget(S,S,{colorSpace:THREE.SRGBColorSpace}),px=new Uint8Array(S*S*4),cv=document.createElement('canvas');cv.width=cv.height=S;const g=cv.getContext('2d'),img=g.createImageData(S,S);
  const prevT=renderer.getRenderTarget(),prevC=renderer.getClearColor(new THREE.Color()),prevA=renderer.getClearAlpha();renderer.setClearColor(0x000000,0);
  try{for(const t of ['rose','jasmine','orchid','marigold','lavender','lilium','golden']){const sc=new THREE.Scene();sc.add(new THREE.HemisphereLight('#FFE6CC','#5A3A4A',1.6));const dl=new THREE.DirectionalLight('#FFD2A0',2.4);dl.position.set(3,5,4);sc.add(dl);
   const f=flower(t,3);sc.add(f);const box=new THREE.Box3().setFromObject(f),c=box.getCenter(new THREE.Vector3()),sz=box.getSize(new THREE.Vector3());const dist=Math.max(sz.x,sz.y,sz.z)*1.25/Math.tan(15*Math.PI/180)/2;
   const cm=new THREE.PerspectiveCamera(30,1,.01,100);cm.position.set(c.x,c.y+dist*.32,c.z+dist);cm.lookAt(c);
   renderer.setRenderTarget(rt);renderer.clear();renderer.render(sc,cm);renderer.readRenderTargetPixels(rt,0,0,S,S,px);
   // the picture comes out upside down: flip the rows
   for(let y=0;y<S;y++)img.data.set(px.subarray((S-1-y)*S*4,(S-y)*S*4),y*S*4);g.putImageData(img,0,0);out[t]=cv.toDataURL('image/png');}}
  finally{renderer.setRenderTarget(prevT);renderer.setClearColor(prevC,prevA);rt.dispose();}
  return out;},
 resetView(){flyTo(new THREE.Vector3(...V1),new THREE.Vector3(...V0));},
 // fly to one of the Tunisian or Venezuelan spots (from the Learn shelf)
 showSpot(id){const s=(G.spots||[]).find(x=>x.id===id);if(!s)return false;const tp=new THREE.Vector3(...s.p);tp.y=Math.max(0,Math.min(tp.y,2));
  const dir=cam.position.clone().sub(controls.target).setY(0).normalize();const pos=tp.clone().addScaledVector(dir,7);pos.y=tp.y+4;controls.autoRotate=false;flyTo(tp,pos);return true;},
 // a small picture of the garden as it is now (shown at once next time the app opens, while the 3D wakes up)
 snapshot(maxW=720){renderer.render(scene,cam);const c=renderer.domElement;if(!c.width)return null;const k=Math.min(1,maxW/c.width),o=document.createElement('canvas');o.width=Math.round(c.width*k);o.height=Math.round(c.height*k);o.getContext('2d').drawImage(c,0,0,o.width,o.height);return o.toDataURL('image/jpeg',.72);},
 onEvent(fn){eventCb=fn;sayFullMoon();},
 onFrame(fn){frameCb=fn;},
 // screen position of a point in the garden, in CSS pixels inside the garden element
 project(x,y,z){_p.set(x,y,z).project(cam);return {x:(_p.x+1)/2*GEL.clientWidth,y:(1-_p.y)/2*GEL.clientHeight,front:_p.z<1};},
 destroy(){clearTimeout(warmTimer);renderer.setAnimationLoop(null);sizeWatch.disconnect();seenWatch.disconnect();controls.dispose();
  renderer.domElement.removeEventListener('pointerdown',onDown);renderer.domElement.removeEventListener('pointerup',onUp);
  scene.traverse(o=>{if(o.geometry)o.geometry.dispose();const m=o.material;if(m)(Array.isArray(m)?m:[m]).forEach(x=>{x.map?.dispose?.();x.dispose();});});
  pmrem.dispose();renderer.dispose();renderer.domElement.remove();},
};
}
