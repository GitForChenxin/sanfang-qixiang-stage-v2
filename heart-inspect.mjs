import * as T from 'three';
import {createHeartBanyan} from './heart-tree.mjs';
const renderer=new T.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;
renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.15;document.querySelector('#canvas').append(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color(0xdce1df);
const camera=new T.PerspectiveCamera(40,1,.1,150);
const tree=createHeartBanyan();scene.add(tree.object);
scene.add(new T.HemisphereLight(0xe4efff,0x8d9278,2));
const sun=new T.DirectionalLight(0xfff1d4,2.8);sun.position.set(-8,14,10);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-9,right:9,top:11,bottom:-3,near:.1,far:40});
sun.shadow.bias=-.0003;sun.shadow.normalBias=.015;scene.add(sun);
const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:0xb8b9b2,roughness:.95}));
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
let azimuth=0,elevation=.12,distance=17.5;const target=new T.Vector3(0,4.4,0);
const presets={front:[0,.08,17.5],aerial:[.62,.69,18.5],side:[1.48,.17,18]};
function updateCamera(){camera.position.set(Math.sin(azimuth)*Math.cos(elevation)*distance,target.y+Math.sin(elevation)*distance,Math.cos(azimuth)*Math.cos(elevation)*distance);camera.lookAt(target);}
for(const button of document.querySelectorAll('[data-pose]'))button.onclick=()=>{[azimuth,elevation,distance]=presets[button.dataset.pose];updateCamera();};
let drag=null;const canvas=renderer.domElement;
canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};
canvas.onpointerup=()=>drag=null;
canvas.onpointermove=e=>{if(!drag)return;azimuth-=(e.clientX-drag[0])*.006;elevation=T.MathUtils.clamp(elevation+(e.clientY-drag[1])*.005,-.12,1.45);drag=[e.clientX,e.clientY];updateCamera();};
canvas.onwheel=e=>{e.preventDefault();distance=T.MathUtils.clamp(distance*Math.exp(e.deltaY*.001),8,35);updateCamera();};
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();updateCamera();
renderer.setAnimationLoop(t=>{tree.update(t*.001);renderer.render(scene,camera);document.body.dataset.ready='true';});
