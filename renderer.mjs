import * as T from 'three';
import {Reflector} from './Reflector.js';
import {architecture as A} from './model.mjs';
const $=s=>document.querySelector(s), view=$('#viewport');
const scene=new T.Scene(); scene.background=new T.Color(0xaeb9b2); scene.fog=new T.Fog(0xaeb9b2,29,66);
const camera=new T.PerspectiveCamera(50,1,.06,80);
let R; try{R=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch(e){$('#status').textContent='无法开启 WebGL。请在支持硬件加速的浏览器中打开。';throw e}
R.setPixelRatio(Math.min(devicePixelRatio,1.5));R.shadowMap.enabled=true;R.shadowMap.type=T.PCFSoftShadowMap;R.toneMapping=T.ACESFilmicToneMapping;R.toneMappingExposure=1.16;view.append(R.domElement);
scene.add(new T.HemisphereLight(0xe9f1ff,0xa18b67,2.0));
const sun=new T.DirectionalLight(0xffe2ad,3.0);sun.position.set(-9,14,4);sun.castShadow=true;
Object.assign(sun.shadow.camera,{left:-13,right:13,top:13,bottom:-13,near:.5,far:35});sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0002;sun.shadow.normalBias=.022;scene.add(sun);
let seed=210974;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
function tex(kind,bg,fg){
 const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,256,256);g.fillStyle=fg;
 for(let i=0;i<4500;i++){g.globalAlpha=rnd()*.17;let x=rnd()*256,y=rnd()*256;g.fillRect(x,y,kind==='wood'?1+rnd()*2:1+rnd()*5,kind==='wood'?8+rnd()*80:1+rnd()*4);}
 if(kind==='wood'){for(let i=0;i<20;i++){g.globalAlpha=.13;g.fillRect(rnd()*256,0,1,256);}}
 if(kind==='stone'){for(let j=0;j<4;j++){g.globalAlpha=.26;g.fillRect(0,j*64,256,2);for(let i=0;i<4;i++)g.fillRect((i*64+(j%2)*32)%256,j*64,2,65);}}
 const m=new T.CanvasTexture(c);m.colorSpace=T.SRGBColorSpace;m.wrapS=m.wrapT=T.RepeatWrapping;m.anisotropy=8;return m;
}
const m=(c,more={})=>new T.MeshStandardMaterial({color:c,roughness:.91,...more});
const wood=m(0xc3a58b,{map:tex('wood','#836049','#2a1c17')}), dark=m(0x624638,{map:tex('wood','#835d42','#271815')}), gilt=m(0xa48650), black=m(0x353736);
const stone=m(0xcecbc0,{map:tex('stone','#b0b0a5','#454641')}), rock=m(0x6a6a60), wall=m(0xfff9e7,{map:tex('lime','#ede2c6','#635c50')}), tile=m(0x97a1a1,{map:tex('lime','#666765','#222422'),side:T.DoubleSide});
const tileEdge=m(0x464749), glass=m(0x493f30), sill=m(0xa7a497), dullBrick=m(0x5e503d), lacquer=m(0xa43e2e), contact=m(0x3d443c);
const group=(parent=scene)=>{const g=new T.Group();parent.add(g);return g};
function mesh(geo,mat,x,y,z,parent=scene,sh=true){const o=new T.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=sh;o.receiveShadow=true;parent.add(o);return o;}
const block=(mat,x,y,z,w,h,d,p=scene)=>mesh(new T.BoxGeometry(w,h,d),mat,x,y,z,p);
const pole=(mat,x,y,z,r,h,p=scene)=>mesh(new T.CylinderGeometry(r*.94,r,h,12),mat,x,y,z,p);
function rod(mat,from,to,r,parent=scene,seg=7){const a=new T.Vector3(...from),b=new T.Vector3(...to);const n=mesh(new T.CylinderGeometry(r,r,a.distanceTo(b),seg),mat,...a.clone().add(b).multiplyScalar(.5).toArray(),parent);n.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.sub(a).normalize());return n;}
function sweep(mat,points,r,p=scene,seg=32){const c=new T.CatmullRomCurve3(points.map(a=>new T.Vector3(...a)));return mesh(new T.TubeGeometry(c,seg,r,7,false),mat,0,0,0,p);}
function sheet(pos,ind,mat,p){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(ind);g.computeVertexNormals();return mesh(g,mat,0,0,0,p);}
// Pool section: the terrace never covers the water plane.
block(stone,0,-.38,7.7,21,.72,4.8);block(stone,0,-.35,-7.2,21,.72,4.25);
block(stone,-7.35,-.37,0,5.2,.72,11);block(stone,7.35,-.37,0,5.2,.72,11);
block(rock,0,-.83,0,10,.20,11);
for(const s of [-1,1]){block(sill,s*4.69,-.16,0,.30,.65,10.5);block(sill,0,-.17,s*5.18,9.6,.60,.23);}
const reflector=new Reflector(new T.PlaneGeometry(9.18,10.0),{color:0x607c73,textureWidth:640,textureHeight:640,clipBias:.005});
reflector.rotation.x=-Math.PI/2;reflector.position.y=A.pool.y;scene.add(reflector);
const surface=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{clock:{value:0}},
vertexShader:'varying vec2 uvw; void main(){uvw=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
fragmentShader:'varying vec2 uvw; uniform float clock; void main(){vec2 p=uvw; float w=sin(150.*p.y+9.*sin(9.*p.x+clock*.35)+clock*.9);float n=sin(173.*p.y+63.*p.x-clock*1.4);float r=pow(max(0.,w*.58+n*.42),12.); gl_FragColor=vec4(mix(vec3(.075,.16,.139),vec3(.49,.60,.49),r),.19+r*.13);}'}); 
const water=mesh(new T.PlaneGeometry(9.16,9.99),surface,0,A.pool.y+.009,0,scene,false);water.rotation.x=-Math.PI/2;
function roof(p,halfx,halfz,cy,rise,ridge,ornate=true){
 // Upper gable planes meet the lower hipped shape; the side caps create separate visible hips.
 const H=(x,z)=>{const u=Math.abs(x)/halfx,v=Math.abs(z)/halfz;const slope=1-.98*v+.09*Math.pow(v,5)+.17*Math.pow(u*v,6);const end=u<=ridge?1.04:Math.max(.10,.60*(1-(u-ridge)/(1-ridge))+.13);return cy+rise*Math.min(slope,end);};
 const pos=[], ids=[],nx=44,nz=36;
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){let x=(i/nx*2-1)*halfx,z=(j/nz*2-1)*halfz;pos.push(x,H(x,z),z);}
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){let a=j*(nx+1)+i,b=a+nx+1;ids.push(a,b,a+1,a+1,b,b+1);}
 sheet(pos,ids,tile,p);
 const n=Math.ceil(halfx*2/.18), rows=Math.ceil(halfz/.23), upper=new T.InstancedMesh(new T.CylinderGeometry(.042,.044,.242,6),tileEdge,n*rows*2), d=new T.Object3D(), yAxis=new T.Vector3(0,1,0);
 let k=0;for(let col=0;col<n;col++)for(let iz=0;iz<rows;iz++)for(let side of [-1,1]){
   const x=-halfx+(col+.5)*halfx*2/n,z=side*(iz+.5)*halfz/rows,z0=z-.102,z1=z+.102;
   d.position.set(x,H(x,z)+.043,z);d.quaternion.setFromUnitVectors(yAxis,new T.Vector3(0,H(x,z1)-H(x,z0),z1-z0).normalize());d.scale.set(1,1+rnd()*.03,1);d.updateMatrix();
   upper.setMatrixAt(k,d.matrix);upper.setColorAt(k++,new T.Color().setScalar(.75+rnd()*.43));
 }upper.receiveShadow=true;upper.castShadow=false;p.add(upper);
 const edge=(a,b)=>Array.from({length:13},(_,i)=>{let u=i/12,x=T.MathUtils.lerp(a[0],b[0],u),z=T.MathUtils.lerp(a[1],b[1],u);return [x,H(x,z)+.07,z];});
 for(const z of [-halfz,halfz])sweep(tileEdge,edge([-halfx,z],[halfx,z]),.081,p);
 for(const x of [-halfx,halfx])sweep(tileEdge,edge([x,-halfz],[x,halfz]),.071,p);
 sweep(tileEdge,edge([-halfx*ridge,0],[halfx*ridge,0]),.086,p);
 for(const sx of [-1,1])for(const sz of [-1,1]){
  const knee=[sx*halfx*ridge,sz*halfz*.44], end=[sx*halfx,sz*halfz];
  sweep(tileEdge,edge([sx*halfx*ridge,0],knee),.051,p);
  sweep(tileEdge,edge(knee,end),.057,p);
  if(ornate){
   let x=end[0],z=end[1],h=H(x,z); const O=(a,b,c)=>[x+sx*a,h+b,z+sz*c];
   sweep(black,[O(-.25,.03,-.23),O(-.03,.08,-.02),O(.15,.23,.12),O(.21,.38,.17),O(.16,.43,.12)],.048,p);
   sweep(gilt,[O(-.09,.11,-.08),O(.10,.24,.09),O(.21,.27,.18),O(.16,.13,.12),O(-.09,.11,-.08)],.027,p,20);
  }
 }
 if(ornate){for(const sx of [-1,1]){
  const x=sx*halfx*ridge;
  sweep(tileEdge,[[x-sx*.2,cy+rise,0],[x,cy+rise+.05,0],[x+sx*.24,cy+rise+.19,0],[x+sx*.36,cy+rise+.31,0]],.066,p);
 }}
}
const stage=group();stage.position.z=A.stage.z;
block(stone,0,-.29,0,5.35,.27,5.35,stage);
for(const [x,z] of A.stage.columns){
 pole(stone,x,-.36,z,.33,.66,stage);pole(stone,x,.15,z,.28,.21,stage);pole(wood,x,1.94,z,.145,3.56,stage);pole(dark,x,3.62,z,.24,.17,stage);
}
block(dark,0,.24,0,5.48,.19,5.48,stage);
for(let i=0;i<26;i++)block(i%5===0?dark:wood,-2.68+i*.212,.354,0,.205,.055,5.46,stage);
for(const x of [-2.35,2.35])block(dark,x,3.64,0,.25,.31,5.45,stage);
for(const z of [-2.25,2.25])block(dark,0,3.64,z,5.43,.27,.22,stage);
for(const z of [-2.26,2.26])for(const sign of [-1,1]){
  sweep(dark,[[2.34*sign,2.94,z],[2.04*sign,3.04,z],[1.71*sign,3.33,z],[1.35*sign,3.50,z]],.096,stage,22);
  sweep(gilt,[[2.28*sign,3.05,z+.104],[2.04*sign,3.14,z+.104],[1.74*sign,3.39,z+.104],[1.39*sign,3.57,z+.104]],.024,stage);
  for(let i=0;i<6;i++){let x=sign*(1.48+.151*i);pole(dark,x,3.55-.031*i,z,.041,.28+.074*i,stage);}
  pole(gilt,sign*2.15,3.05,z,.055,.20,stage);
}
for(let i=0;i<34;i++){
 const x=-3.12+i*.189;
 for(const s of [-1,1])rod(wood,[x,3.88,s*2.19],[x,3.78,s*3.13],.051,stage,6);
}
for(let i=0;i<25;i++)for(const s of [-1,1])rod(dark,[s*2.32,3.88,-2.99+i*.248],[s*3.21,3.79,-2.99+i*.248],.040,stage,6);
roof(stage,3.29,3.19,3.74,1.68,.60);
for(let i=0;i<4;i++){
  const edge=1.92-i*.36;
  for(const s of [-1,1]){block(i%2?gilt:dark,s*edge,3.54+i*.055,0,.084,.082,edge*2,stage);block(i%2?gilt:dark,0,3.54+i*.055,s*edge,edge*2,.082,.084,stage);}
}
function lattice(p,x,y,z,w,h){
 block(dark,x,y,z,w+.12,h+.14,.12,p);
 block(glass,x,y,z+.065,w,h,.018,p);
 for(let i=0;i<=6;i++)block(wood,x-w/2+i*w/6,y,z+.088,.032,h,.035,p);
 for(let j=0;j<=5;j++)block(wood,x,y-h/2+j*h/5,z+.088,w,.029,.041,p);
 for(const sign of [-1,1])rod(gilt,[x-w*.3,y+h*.15,-.015+z+.10],[x+w*.3,y+h*.15+h*.20*sign,z+.10],.011,p,5);
}
block(wall,0,1.61,-2.91,5.34,2.45,.27,stage);
for(let i=0;i<4;i++){const x=-1.75+i*1.16;lattice(stage,x,2.18,-2.74,.94,1.12);block(wood,x,1.21,-2.73,.94,.72,.15,stage);}
for(const x of [-1.65,1.65]){
 rod(dark,[x,3.64,2.78],[x,3.38,2.78],.014,stage);
 const lantern=mesh(new T.SphereGeometry(.13,10,7),lacquer,x,3.22,2.78,stage);lantern.scale.y=1.25;
 rod(gilt,[x,3.08,2.78],[x,2.96,2.78],.015,stage);
}

const hall=group();hall.position.z=A.hall.z;
block(stone,0,.06,.93,8.8,.21,3.1,hall);
for(const zz of [-.12,2.33])for(const xx of [-4.05,-2.78,2.78,4.05]){
  pole(stone,xx,.22,zz,.22,.24,hall);pole(wood,xx,1.79,zz,.135,3.03,hall);
}
block(wall,0,1.68,2.61,8.7,3.13,.37,hall);
for(let i=0;i<5;i++)lattice(hall,-3.25+i*1.63,1.77,2.38,1.25,1.55);
for(const zz of [-.27,2.48])block(dark,0,3.28,zz,8.7,.2,.19,hall);
roof(hall,4.64,2.02,3.38,1.18,.66,false);
for(const xx of [-3.2,3.1]){block(dark,xx,.48,.88,1.72,.10,.46,hall);for(const j of [-1,1])block(wood,xx+j*.64,.28,.89,.10,.39,.33,hall);}
let lime=m(0xe6d9b4);
function enclosure(p,length,baseTop){
 let n=65, pos=[], ids=[],corners=[],TILES=[];
 const cap=x=>baseTop+.59*Math.pow(Math.abs(x)/(length/2),9)-.16*Math.exp(-Math.pow(x/(length*.29),2));
 for(let i=0;i<=n;i++){
  let x=(i/n-.5)*length,y=cap(x);pos.push(x,-.02,.19,x,y,.19,x,-.02,-.19,x,y,-.19);
  corners.push([x,y+.045,0]);
  if(i<n){let a=i*4;ids.push(a,a+4,a+1,a+1,a+4,a+5,a+2,a+3,a+6,a+3,a+7,a+6,a+1,a+5,a+3,a+3,a+5,a+7);}
 }
 sheet(pos,ids,wall,p);
 sweep(tileEdge,corners,.109,p,80);
 for(let i=0;i<84;i++){
  let x=(i/83-.5)*length;
  rod(tileEdge,[x,cap(x)+.029,-.36],[x,cap(x)+.029,.38],.038,p,6);
 }
 for(const side of [-1,1])sweep(tileEdge,corners.slice(side<0?0:-11).filter((_,i)=>side>0||i<11).map(q=>[q[0],q[1]-.15,.197]),.036,p,16);
 block(stone,0,.12,.01,length,.28,.45,p);
}
const back=group();back.position.set(0,0,-7.45);enclosure(back,15.7,4.08);
for(const s of [-1,1]){const p=group();p.rotation.y=Math.PI/2;p.position.set(s*7.65,0,.24);enclosure(p,15.25,3.58);}
function railing(x,z,size,rot){
 const p=group();p.position.set(x,0,z);p.rotation.y=rot;const w=size;
 block(stone,0,.18,0,w,.24,.19,p);block(sill,0,.66,0,w,.13,.27,p);
 const count=Math.max(1,Math.round(w/1.4));
 for(let i=0;i<=count;i++){
  const x=-w/2+i*w/count;block(sill,x,.49,0,.19,.90,.24,p);block(stone,x,.98,0,.26,.11,.30,p);
 }
 for(let i=0;i<count;i++){
  const x=-w/2+(i+.5)*w/count;block(stone,x,.435,0,w/count-.18,.36,.14,p);
  for(let q=0;q<2;q++){
   const xx=x+(q-.5)*.27;let pts=[];
   for(let j=0;j<=24;j++){let a=j/24*Math.PI*2,r=.067+.022*Math.sin(a*4);pts.push([xx+r*Math.cos(a),.44+r*Math.sin(a),.077]);}
   sweep(sill,pts,.009,p,20);
  }
 }
}
// Boundary pieces leave the main sightline open at the center of the northern ledge.
railing(-3.36,5.04,2.35,0);railing(3.34,5.04,2.32,0);railing(-4.79,-2.75,3.32,Math.PI/2);
railing(4.78,3.60,1.61,Math.PI/2);
function crag(x,y,z,sx,sy,sz){
 const o=mesh(new T.DodecahedronGeometry(1,0),rnd()>.6?sill:rock,x,y,z);
 o.scale.set(sx,sy,sz);o.rotation.set(rnd()*.6,rnd()*6.28,rnd()*.55);return o;
}
for(const sx of [-1,1])for(let j=0;j<22;j++){
 let x=sx*(4.95+rnd()*1.88),z=-6.35+rnd()*4.8;
 crag(x,.13+rnd()*1.17,z,.33+rnd()*.93,.28+rnd()*.89,.35+rnd()*.78);
}
const green=[m(0x526248),m(0x657653),m(0x5b704c)];
function shrub(x,y,z,h,spread,tree=false){
 if(tree){
  rod(dark,[x,y,z],[x+.28,y+h,z-.20],.13,scene,7);
  for(let i=0;i<5;i++){let a=i*2.399;rod(dark,[x+.15,y+h*.49,z],[x+Math.cos(a)*spread*.60,y+h*(.74+rnd()*.18),z+Math.sin(a)*spread*.59],.045);}
 }
 for(let i=0;i<(tree?36:16);i++){
 const a=rnd()*6.28,r=Math.sqrt(rnd())*spread;const foliage=mesh(new T.IcosahedronGeometry(1,1),green[i%3],x+Math.cos(a)*r,y+h*(.80+rnd()*.44),z+Math.sin(a)*r);
 const t=(tree?.42:.16)+rnd()*spread*.43;foliage.scale.set(t,t*.66,t*1.13);
 }
}
shrub(-6.37,.15,-4.20,2.94,1.8,true);shrub(6.66,.25,-5.90,3.38,1.53,true);
shrub(-8,.1,2.5,4.45,2.52,true);shrub(7.48,.45,-6.8,4.65,2.43,true);
shrub(5.62,.52,-4.05,.54,.69);shrub(-5.15,.36,-1.64,.34,.65);
railing(-6.13,4.58,2.23,0);
const goal=new T.Vector3(),look=new T.Vector3(),cameraPos=new T.Vector3(),spherical=new T.Spherical();
let choice='front', drag=null, transition=false, dirty=true,w=0,h=0,lastInteraction=0;
function choose(name,snap=false){
  const v=A.views[name];if(!v)return;
  choice=name;cameraPos.set(...v.slice(0,3));goal.set(...v.slice(3));transition=!snap;
  if(snap){camera.position.copy(cameraPos);look.copy(goal);camera.lookAt(look);}
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
  view.dataset.camera=name;$('#view-note').textContent=$('[data-view="'+name+'"]').dataset.note;dirty=true;
}
function change(az=0,el=0,zoom=1){
 cameraPos.sub(goal);spherical.setFromVector3(cameraPos);spherical.theta+=az;spherical.phi=T.MathUtils.clamp(spherical.phi+el,.55,1.57);spherical.radius=T.MathUtils.clamp(spherical.radius*zoom,4,20);cameraPos.setFromSpherical(spherical).add(goal);cameraPos.y=Math.max(.98,cameraPos.y);transition=true;dirty=true;lastInteraction=performance.now();
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.view)));
$('#reset').addEventListener('click',()=>choose('front'));
$('#zoom-in').addEventListener('click',()=>change(0,0,.88));$('#zoom-out').addEventListener('click',()=>change(0,0,1.13));
view.addEventListener('pointerdown',e=>{view.setPointerCapture(e.pointerId);drag=[e.clientX,e.clientY];view.classList.add('drag')});
view.addEventListener('pointermove',e=>{if(!drag)return;change((drag[0]-e.clientX)*.004,(drag[1]-e.clientY)*.004);drag=[e.clientX,e.clientY]});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])view.addEventListener(ev,()=>{drag=null;view.classList.remove('drag');});
view.addEventListener('wheel',e=>{e.preventDefault();change(0,0,e.deltaY>0?1.07:.93);},{passive:false});
view.addEventListener('keydown',e=>{const options={ArrowLeft:[-.10],ArrowRight:[.10],ArrowUp:[0,.07],ArrowDown:[0,-.07],'+':[0,0,.88],'-':[0,0,1.13]};if(options[e.key]){e.preventDefault();change(...options[e.key]);}});
$('#photo-open').addEventListener('click',()=>$('#photo').showModal());$('#photo-close').addEventListener('click',()=>$('#photo').close());
new ResizeObserver(()=>{const ww=view.clientWidth,hh=view.clientHeight;if(ww&&hh&&(ww!==w||hh!==h)){w=ww;h=hh;camera.aspect=w/h;camera.updateProjectionMatrix();R.setSize(w,h);dirty=true;}}).observe(view);
choose('front',true);
let previous=0,count=0;
R.setAnimationLoop(t=>{
 if(document.hidden)return;
 const animate=!matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(animate&&t-previous<32&&!dirty)return;if(!animate&&!dirty&&!transition)return;previous=t;
 if(transition){const a=animate?.18:1;camera.position.lerp(cameraPos,a);look.lerp(goal,a);camera.lookAt(look);if(camera.position.distanceTo(cameraPos)<.008&&look.distanceTo(goal)<.008){transition=false;}}
 surface.uniforms.clock.value=animate?t*.001:0;
 R.render(scene,camera);
 if(!count++){view.dataset.webgl='ready';$('#status').textContent='三维场景已就绪';}
 {view.dataset.eye=camera.position.toArray().map(k=>k.toFixed(2)).join(',');view.dataset.drawCalls=String(R.info.render.calls);}
 dirty=false;
});

$('#save-view').addEventListener('click',()=>{
 R.render(scene,camera);
 R.domElement.toBlob(blob=>{
  if(!blob){$('#status').textContent='无法保存当前画面';return;}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Shuixie-v2-'+choice+'.jpg';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);
 },'image/jpeg',.94);
});