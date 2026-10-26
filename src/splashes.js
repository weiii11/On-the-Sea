import * as THREE from 'three';
import {seaHeight,seaShader,seaSwellUniform} from './ocean.js';
export function createSplashes(scene,renderer){
 const count=420,positions=new Float32Array(count*3),alphas=new Float32Array(count),sizes=new Float32Array(count);
 const particles=Array.from({length:count},()=>({age:10,life:0,x:0,y:-20,z:0,vx:0,vy:0,vz:0}));let cursor=0,takeoffs=0,landings=0;
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('opacity',new THREE.BufferAttribute(alphas,1));geo.setAttribute('size',new THREE.BufferAttribute(sizes,1));
 const tint=new THREE.Color(.86,.94,.98);
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{pixelRatio:{value:renderer.getPixelRatio()},tint:{value:tint}},vertexShader:`attribute float opacity;attribute float size;uniform float pixelRatio;varying float a;void main(){a=opacity;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(size*600.*pixelRatio/max(1.,-p.z),1.4*pixelRatio,6.5*pixelRatio);}`,fragmentShader:`uniform vec3 tint;varying float a;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.||a<.001)discard;float glint=exp(-length(gl_PointCoord-vec2(.34,.32))*9.);gl_FragColor=vec4(tint+glint*.12,a*(1.-smoothstep(.3,1.,d)));}`});
 const points=new THREE.Points(geo,material);points.frustumCulled=false;scene.add(points);
 const rings=[];for(let i=0;i<14;i++){
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{swellEnvelope:seaSwellUniform,time:{value:0},age:{value:10},tint:{value:tint}},vertexShader:`uniform float time;varying vec2 tex;${seaShader}\nvoid main(){tex=uv;vec4 wp=modelMatrix*vec4(position,1.);wp.y=sea(wp.xz,time).x+.025;gl_Position=projectionMatrix*viewMatrix*wp;}`,fragmentShader:`uniform float age;uniform vec3 tint;varying vec2 tex;void main(){vec2 p=tex-.5;float r=length(p)*2.;float a=atan(p.y,p.x);float radius=.08+age*.29;float uneven=.012*sin(a*7.+age)+.008*cos(a*11.-age);float ring=exp(-pow((r-radius+uneven)/(.016+age*.004),2.));float inner=exp(-pow((r-radius*.65-uneven)/.025,2.))*.35;float foam=exp(-r*r/((.04+age*.05)*(.04+age*.05)))*exp(-age*5.);float fade=pow(max(0.,1.-age/3.1),1.7);gl_FragColor=vec4(tint,(ring*.28+inner*.15+foam*.40)*fade);}`});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2,14,14),mat);mesh.rotation.x=-Math.PI/2;mesh.visible=false;scene.add(mesh);rings.push({mesh,born:-99});
 }
 const events=[];
 function emit(x,z,t,vx,vz,kind='trail'){
  const impact=kind==='landing',burst=kind!=='trail';if(kind==='takeoff')takeoffs++;if(impact)landings++;
  if(burst){events.push({kind,time:t,x,z});if(events.length>20)events.shift();const ring=rings.reduce((a,b)=>a.born<b.born?a:b);ring.born=t;ring.mesh.position.set(x,0,z);ring.mesh.scale.setScalar(impact?1.25:1.05);ring.mesh.visible=true;}
  const total=burst?(impact?44:32):4;
  for(let i=0;i<total;i++){const at=cursor++%count,p=particles[at],a=Math.random()*Math.PI*2,speed=(.18+Math.random()*.65)*(impact?1.15:1);Object.assign(p,{age:0,life:.55+Math.random()*.65,x:x+(Math.random()-.5)*.10,y:seaHeight(x,z,t)+.055,z:z+(Math.random()-.5)*.10,vx:Math.cos(a)*speed+vx*.18,vz:Math.sin(a)*speed+vz*.18,vy:burst?.85+Math.random()*1.25:.4+Math.random()*.45});sizes[at]=burst?.05+Math.random()*.055:.035;}
 }
 let active=0;
 return{emit,update(t,dt,paused){active=0;for(let i=0;i<count;i++){const p=particles[i];if(p.age<p.life){if(!paused){p.age+=dt;p.vy-=dt*4.2;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.y<seaHeight(p.x,p.z,t)-.015)p.age=p.life;}if(p.age<p.life)active++;}positions[i*3]=p.x;positions[i*3+1]=p.age<p.life?p.y:-20;positions[i*3+2]=p.z;alphas[i]=p.age<p.life?.84*Math.pow(1-p.age/p.life,.55):0;}geo.attributes.position.needsUpdate=true;geo.attributes.opacity.needsUpdate=true;geo.attributes.size.needsUpdate=true;for(const r of rings){const age=t-r.born;r.mesh.visible=age>=0&&age<3.1;r.mesh.material.uniforms.age.value=age;r.mesh.material.uniforms.time.value=t;}},setTint(c){tint.copy(c);},state:()=>({active,takeoffs,landings,events:events.map(e=>({...e}))})};
}
