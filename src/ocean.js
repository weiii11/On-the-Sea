import * as THREE from 'three';
import {Water} from 'three/addons/objects/Water.js';

// A broad, deterministic directional spectrum. Each component has its own
// phase, wavelength and deep-water dispersion speed, not a scrolling texture.
let seed=82741;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const spectrum=[];
for(let i=0;i<28;i++){
 const k=.29*Math.pow(1.13,i),angle=(random()-.5)*Math.PI*1.7+.4;
 const amplitude=.073*Math.pow(k/.29,-1.38)*(.55+random()*.8);
 spectrum.push({x:Math.cos(angle),z:Math.sin(angle),k,a:amplitude,w:Math.sqrt(9.81*k)*.27,phase:random()*Math.PI*2});
}
const f=n=>n.toFixed(7);
// A slow, unequal swell group. Calculated once per frame, shared by water,
// surface rings and the sound layer; the camera remains steady.
export function seaBreath(t){const phase=(t+7)*Math.PI*2/47+.38*Math.sin(t*.071);return Math.pow((1-Math.cos(phase))*.5,3)*(.85+.15*Math.sin(t*.113+1.1));}
export const seaSwellUniform={value:seaBreath(0)};
let breathTime=NaN,breathValue=0;
export function updateSeaBreath(t){if(t!==breathTime){breathTime=t;breathValue=seaBreath(t);}seaSwellUniform.value=breathValue;return breathValue;}
const weight=k=>.48/(1+(k/1.1)**2);
const terms=spectrum.map(w=>`component(p,t,vec2(${f(w.x)},${f(w.z)}),${f(w.k)},${f(w.a)}*(1.+swellEnvelope*${f(weight(w.k))}),${f(w.w)},${f(w.phase)},h,g);`).join('\n');
const glsl=`
uniform float swellEnvelope;
void component(vec2 p,float t,vec2 d,float k,float a,float w,float ph,inout float h,inout vec2 g){
 float phase=dot(p,d)*k-w*t+ph;
 // A weak second harmonic sharpens crests without copying a single waveform.
 h+=a*(sin(phase)+.13*sin(phase*2.+ph));
 g+=d*k*a*(cos(phase)+.26*cos(phase*2.+ph));
}
vec3 sea(vec2 p,float t){float h=0.;vec2 g=vec2(0.);${terms}
float longPhase=dot(p,vec2(.42,.9075))*.18-t*.50+1.7;
h+=.075*swellEnvelope*sin(longPhase);g+=vec2(.42,.9075)*.0135*swellEnvelope*cos(longPhase);
return vec3(h,g);}
`;
export const seaShader=glsl;
export function seaHeight(x,z,t){const breath=updateSeaBreath(t);let h=0;for(const c of spectrum){const p=(x*c.x+z*c.z)*c.k-c.w*t+c.phase;h+=c.a*(1+breath*weight(c.k))*(Math.sin(p)+.13*Math.sin(p*2+c.phase));}return h+.075*breath*Math.sin((x*.42+z*.9075)*.18-t*.50+1.7);}
export function createOcean(sun){
 const geometry=new THREE.PlaneGeometry(2,2,320,320),a=geometry.attributes.position;
 // Concentrate vertices near the viewer, keeping a continuous surface all
 // the way to the horizon. No seam between a near patch and a distant sheet.
 for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i);a.setXYZ(i,Math.sign(x)*Math.pow(Math.abs(x),2.7)*650,Math.sign(y)*Math.pow(Math.abs(y),2.7)*650,0);}
 a.needsUpdate=true;
 const ocean=new Water(geometry,{textureWidth:512,textureHeight:512,sunDirection:sun,sunColor:0xffe7cb,waterColor:0x00394c,distortionScale:2.0,fog:true});
 ocean.material.uniforms.swellEnvelope=seaSwellUniform;
 ocean.rotation.x=-Math.PI/2;
 let v=ocean.material.vertexShader;
 v=v.replace('void main() {',glsl+'\nvoid main(){vec3 pos=position;vec4 wp=modelMatrix*vec4(pos,1.);pos.z=sea(wp.xz,time).x;');
 v=v.replaceAll('vec4( position, 1.0 )','vec4( pos, 1.0 )');ocean.material.vertexShader=v;
 let s=ocean.material.fragmentShader;
 s=s.replace('vec4 getNoise( vec2 uv ) {',glsl+`
 float rippleHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
 vec2 rippleGradient(vec2 p){
 vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f),du=6.*f*(1.-f);
 float a=rippleHash(i),b=rippleHash(i+vec2(1.,0.)),c=rippleHash(i+vec2(0.,1.)),d=rippleHash(i+1.);
 float footprintFade=1.-smoothstep(.35,1.4,max(fwidth(p.x),fwidth(p.y)));
 return vec2(mix(b-a,d-c,u.y)*du.x,mix(c-a,d-b,u.x)*du.y)*footprintFade;
 }
 vec4 getNoise( vec2 uv ) {`);
 s=s.replace('uniform sampler2D mirrorSampler;', 'uniform sampler2D mirrorSampler; uniform vec3 deepA; uniform vec3 deepB; uniform float sheen; uniform float sparkle; uniform float dawnHaze;');
 s=s.replace('vec4 noise = getNoise( worldPosition.xz * size );',`vec3 swell=sea(worldPosition.xz,time);vec4 noise=vec4(-swell.y,-swell.z,1.,1.);
 float microFade=exp(-length(eye-worldPosition.xyz)*.045);vec2 p=worldPosition.xz;
 noise.x+=.010*microFade*(cos(dot(p,vec2(7.3,5.1))-time*1.2)+.5*cos(dot(p,vec2(12.7,-4.3))-time*1.8));
 noise.y+=.010*microFade*(cos(dot(p,vec2(-5.7,8.3))-time*1.1)+.5*cos(dot(p,vec2(3.7,13.2))-time*1.7));
 // Capillary ripples change the reflected sun direction. Filter them when
 // their wavelength falls below a pixel, rather than flickering at distance.
 mat2 turn=mat2(.8,.6,-.6,.8);
 vec2 drift=p+vec2(.12*sin(p.y*.37+time*.13),.13*cos(p.x*.29-time*.11));
 vec2 ripple=.032*rippleGradient(drift*4.3+vec2(time*.31,-time*.19));
 ripple+=.022*turn*rippleGradient(drift*turn*7.1+vec2(-time*.23,time*.37)+13.8);
 ripple+=.012*rippleGradient(drift*11.7+vec2(time*.41,time*.29)+37.1);
 noise.xy+=sparkle*ripple;`);
 s=s.replace('vec3( 1.5, 1.0, 1.5 )','vec3(1.,1.,1.)');
 s=s.replace('100.0, 2.0, 0.5','240.0, 2.0, 0.5');
 s=s.replace('vec3 outgoingLight = albedo;',`
 float fresnel=mix(.07+.89*pow(1.-theta,4.),.025+.96*pow(1.-theta,5.),sparkle);
 vec3 deep=mix(deepA,deepB,clamp(swell.x+.35,0.,1.));
 vec3 halfSun=normalize(sunDirection+eyeDirection);
 float facing=max(dot(surfaceNormal,halfSun),0.);
 float glint=pow(facing,1500.)*1.25+pow(facing,4800.)*2.8;
 vec3 outgoingLight=mix(deep*(1.+sparkle*.08),reflectionSample*.94,fresnel)+specularLight*sheen*(1.-sparkle*.72)+sunColor*glint*sparkle;
 float veil=exp(-pow((distance-155.)/90.,2.))*(.035+.025*sin(worldPosition.x*.022+time*.04+sin(worldPosition.z*.017)));
 outgoingLight=mix(outgoingLight,vec3(.65,.50,.32),veil*dawnHaze);
 `);
 ocean.material.fragmentShader=s;ocean.material.uniforms.deepA={value:new THREE.Vector3(.016,.103,.132)};ocean.material.uniforms.deepB={value:new THREE.Vector3(.039,.176,.196)};ocean.material.uniforms.sheen={value:.18};ocean.material.uniforms.sparkle={value:1};ocean.material.uniforms.dawnHaze={value:0};return ocean;
}

