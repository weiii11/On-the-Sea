import * as THREE from 'three';
import {createOcean,seaHeight,updateSeaBreath,seaSwellUniform} from './ocean.js';
import {createFish,setFishSun} from './fish.js';
import {createSplashes} from './splashes.js';
import {createAtmosphere} from './atmosphere.js';
import {createVolumeMist} from './volume-mist.js';
import {createRenderBudget} from './render-budget.js';
import {createGulls} from './gulls.js';
import {makeSeaAudio} from './sea-audio.js';
import {Sky} from 'three/addons/objects/Sky.js';
const $=id=>document.getElementById(id),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch(e){$('loading').textContent='请用支持硬件加速的浏览器打开';throw e;}
const renderBudget=createRenderBudget(renderer);let renderDirty=true;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.82;$('ocean').appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0xb1cbd0,.0017);
const camera=new THREE.PerspectiveCamera(47,innerWidth/innerHeight,.1,2200);camera.position.set(0,3.2,6);
const sun=new THREE.Vector3(-.38,.38,-.90).normalize();
const sky=new Sky();sky.scale.setScalar(1500);sky.material.uniforms.sunPosition.value.copy(sun);sky.material.uniforms.turbidity.value=4;sky.material.uniforms.rayleigh.value=2.6;sky.material.uniforms.mieCoefficient.value=.003;sky.material.uniforms.mieDirectionalG.value=.78;scene.add(sky);
const hemi=new THREE.HemisphereLight(0xe0f3f5,0x47737c,2.3);scene.add(hemi);const key=new THREE.DirectionalLight(0xffedce,3.1);key.position.copy(sun).multiplyScalar(100);scene.add(key);
const water=createOcean(sun);scene.add(water);let shimmer=1,wantShimmer=1;for(const el of document.querySelectorAll('[data-water]'))el.onclick=()=>{wantShimmer=el.dataset.water==='sparkle'?1:0;for(const b of document.querySelectorAll('[data-water]'))b.setAttribute('aria-pressed',String(b===el));};
const atmosphere=createAtmosphere({sky,water,scene,renderer,key,hemi,sun});
const volumeMist=createVolumeMist(sun);volumeMist.attachSky(sky);volumeMist.attachWater(water);
const splashes=createSplashes(scene,renderer);
const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(sky,.05);scene.environment=env.texture;pmrem.dispose();
const gulls=createGulls(scene);
const fishes=Array.from({length:5},()=>{const f=createFish();volumeMist.attachFish(f.group);scene.add(f.group);return f;});
let sim=0,last=performance.now(),paused=reduced,flights=[],nextSchool=6,schoolCount=0,activeFish=0;const history=[];let depthBag=[];
const ptr=new THREE.Vector2(),look=new THREE.Vector3(0,-2.3,-26);let yaw=0,pitch=.17,wantYaw=0,wantPitch=.17,drag=false,dragX=0,dragY=0;const surface=renderer.domElement;surface.addEventListener('pointerdown',e=>{drag=true;dragX=e.clientX;dragY=e.clientY;surface.setPointerCapture(e.pointerId);surface.style.cursor='grabbing';});surface.addEventListener('pointermove',e=>{if(!drag)return;wantYaw-=(e.clientX-dragX)*.0025;wantPitch=THREE.MathUtils.clamp(wantPitch+(e.clientY-dragY)*.0015,-.08,.60);dragX=e.clientX;dragY=e.clientY;});for(const name of ['pointerup','pointercancel'])surface.addEventListener(name,()=>{drag=false;surface.style.cursor='grab';});surface.addEventListener('dblclick',()=>{wantYaw=0;wantPitch=.17;});surface.style.cursor='grab';
// Schools have loose spacing and different trajectories, never a synchronized parade.
function school(){
 schoolCount++;
 if(!depthBag.length){depthBag=['near','middle','far'];for(let i=depthBag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[depthBag[i],depthBag[j]]=[depthBag[j],depthBag[i]];}}
 const band=schoolCount===1?'middle':depthBag.pop();
 const depth=band==='near'?-7-Math.random()*5:band==='middle'?-15-Math.random()*10:-30-Math.random()*16;
 const roll=Math.random(),count=schoolCount===1?1:schoolCount===2?3:roll<.43?1:roll<.70?2:roll<.9?3:4;
 const dir=Math.random()<.62?1:-1,heading=wantYaw;flights=[];
 for(let i=0;i<count;i++){const z=depth-i*(1.3+Math.random()*2.5);flights.push({fish:fishes[i],start:sim+i*(.5+Math.random()*.8),duration:8+Math.random()*4,dir,depth:z,seed:Math.random()*6,size:band==='near'?.26+Math.random()*.06:.31+Math.random()*.08,span:Math.max(2.7,Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect*(Math.abs(z)+6)*.68),heading,slope:(Math.random()-.5)*3,tookOff:false,landed:false,previousClearance:-.1,trailAt:0});}
 nextSchool=sim+20+Math.random()*12;
 history.push({at:sim,count,band,depth});if(history.length>24)history.shift();
}
function update(dt){activeFish=0;if(!paused&&sim>=nextSchool&&!flights.length)school();for(const f of flights){const u=(sim-f.start)/f.duration,g=f.fish.group;if(u<0||u>1){g.visible=false;continue;}activeFish++;g.visible=true;const arc=Math.sin(u*Math.PI),spread=THREE.MathUtils.smoothstep(u,.015,.17)*(1-THREE.MathUtils.smoothstep(u,.84,.99));const localX=f.dir*(-f.span+f.span*2*u),localZ=f.depth+Math.sin(u*2.8+f.seed)*1.3+f.slope*(u-.5),x=Math.cos(f.heading)*localX-Math.sin(f.heading)*localZ,z=Math.sin(f.heading)*localX+Math.cos(f.heading)*localZ;const air=THREE.MathUtils.smoothstep(u,0,.16)*(1-THREE.MathUtils.smoothstep(u,.82,1));const y=THREE.MathUtils.lerp(seaHeight(x,z,sim)-.09,.26+arc*.33,air);g.position.set(x,y,z);g.scale.setScalar(f.size);g.rotation.set(-.35+.15*Math.sin(u*5+f.seed),(f.dir>0?-.12:Math.PI+.12)-f.heading,f.dir*(.12*(1-u)-.16*u));f.fish.animate(sim+f.seed,spread,1-air*.85);
 const clearance=y-seaHeight(x,z,sim),vx=Math.cos(f.heading)*f.dir,vz=Math.sin(f.heading)*f.dir;
 if(!paused){
  if(!f.tookOff&&u>.025&&clearance>0){splashes.emit(x,z,sim,vx,vz,'takeoff');f.tookOff=true;}
  if(f.tookOff&&!f.landed&&u>.78&&clearance<.035){splashes.emit(x,z,sim,vx,vz,'landing');f.landed=true;}
  if((u<.13||u>.94)&&sim-f.trailAt>.13){splashes.emit(x-vx*f.size*.9,z-vz*f.size*.9,sim,vx,vz,'trail');f.trailAt=sim;}
 }
 f.previousClearance=clearance;
}
if(flights.length&&flights.every(f=>sim>f.start+f.duration)){flights=[];for(const f of fishes)f.group.visible=false;}
splashes.update(sim,dt,paused);}
function frame(now){requestAnimationFrame(frame);const elapsed=now-last,dt=Math.min(elapsed/1000,.05);last=now;if(document.hidden)return;if(!paused)renderBudget.sample(elapsed);if(!paused)sim+=dt;water.material.uniforms.time.value=sim;updateSeaBreath(sim);ambience?.setSwell(seaSwellUniform.value);shimmer=THREE.MathUtils.damp(shimmer,wantShimmer,1,dt);water.material.uniforms.sparkle.value=shimmer;atmosphere.update(dt,sim);volumeMist.update(dt,sim,atmosphere.state().selected==='mist');setFishSun(sun);update(dt);gulls.update(sim);if(!paused){camera.position.x=THREE.MathUtils.damp(camera.position.x,ptr.x*.42+Math.sin(sim*.12)*.06,1,dt);camera.position.y=THREE.MathUtils.damp(camera.position.y,3.2+Math.sin(sim*.24)*.026,1,dt);yaw=THREE.MathUtils.damp(yaw,wantYaw,3,dt);pitch=THREE.MathUtils.damp(pitch,wantPitch,3,dt);look.set(camera.position.x+Math.sin(yaw)*Math.cos(pitch)*32,camera.position.y-Math.sin(pitch)*32,camera.position.z-Math.cos(yaw)*Math.cos(pitch)*32);}camera.lookAt(look);const settling=atmosphere.state().transitioning||Math.abs(shimmer-wantShimmer)>.001||Math.abs(volumeMist.state()-(atmosphere.state().selected==='mist'?1:0))>.001;if(!paused||settling||renderDirty){renderer.render(scene,camera);renderDirty=false;}}
requestAnimationFrame(frame);$('loading').classList.add('done');setTimeout(()=>$('loading').hidden=true,1900);
function notice(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('toast').classList.remove('show'),2500);}
function pauseLabel(){$('pause').textContent=paused?'继续':'暂停';$('pause').setAttribute('aria-pressed',String(paused));}pauseLabel();$('pause').onclick=()=>{paused=!paused;pauseLabel();};
$('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{notice('可按 F11 进入全屏');}};document.addEventListener('fullscreenchange',()=>$('full').textContent=document.fullscreenElement?'退出全屏':'全屏');
let soundOn=false,ctx,ambience;
$('sound').onclick=async()=>{try{if(!ctx){ctx=new AudioContext();ambience=makeSeaAudio(ctx);ambience.setVolume(Number($('volume').value));}soundOn=await ambience.toggle();$('sound').textContent=soundOn?'海声 · 开':'海声 · 关';$('sound').setAttribute('aria-pressed',String(soundOn));$('volume-control').hidden=!soundOn;}catch{notice('海声暂时无法开启');}};
$('volume').addEventListener('input',()=>ambience?.setVolume(Number($('volume').value)));
document.addEventListener('visibilitychange',()=>{last=performance.now();renderBudget.reset();renderDirty=true;if(ctx){if(document.hidden)ctx.suspend();else if(soundOn)ctx.resume().catch(()=>{});}});
let idle;function wake(){document.body.classList.remove('idle');clearTimeout(idle);idle=setTimeout(()=>{if(!document.querySelector('button:focus-visible'))document.body.classList.add('idle');},6500);}addEventListener('pointermove',e=>{ptr.set(e.clientX/innerWidth-.5,.5-e.clientY/innerHeight);wake();});for(const e of ['pointerdown','keydown'])addEventListener(e,wake);wake();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderBudget.resize();renderDirty=true;});
window.seaState=()=>({ready:true,time:sim,paused,soundOn,schoolCount,activeFish,nextSchool,yaw,pitch,shimmer,waterMode:wantShimmer?'sparkle':'soft',atmosphere:atmosphere.state(),mistStrength:volumeMist.state(),swellStrength:seaSwellUniform.value,splashes:splashes.state(),gulls:gulls.state(),fishHistory:history.map(x=>({...x})),volume:ambience?.volume()??.55,triangles:renderer.info.render.triangles,performance:renderBudget.state()});

