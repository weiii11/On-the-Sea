import * as THREE from 'three';
const presets={
 day:{horizon:[.46,.64,.70],zenith:[.10,.30,.49],glow:[.34,.28,.18],cloud:[.80,.84,.80],sun:[-.38,.38,-.9],fog:0xb4cdd2,density:.0017,deepA:[.016,.103,.132],deepB:[.039,.176,.196],sunColor:0xffedcf,exposure:.84,key:3.1,hemi:2.3,sheen:.18},
 mist:{horizon:[.56,.59,.60],zenith:[.18,.32,.45],glow:[.58,.34,.14],cloud:[.85,.83,.75],sun:[.28,.12,-.96],fog:0xb8c6cb,density:.0018,deepA:[.018,.083,.108],deepB:[.040,.150,.170],sunColor:0xffdfb2,exposure:.82,key:2.8,hemi:2.1,sheen:.17},
 glow:{horizon:[.63,.32,.29],zenith:[.14,.20,.35],glow:[.82,.38,.16],cloud:[.70,.44,.36],sun:[-.38,.095,-.9],fog:0xbda4a8,density:.0025,deepA:[.025,.065,.105],deepB:[.085,.12,.17],sunColor:0xffc28e,exposure:.78,key:2.6,hemi:1.65,sheen:.21},
 evening:{horizon:[.25,.19,.25],zenith:[.028,.043,.105],glow:[.28,.10,.045],cloud:[.24,.23,.32],sun:[-.38,-.065,-.9],fog:0x8c8caa,density:.0018,deepA:[.010,.027,.065],deepB:[.034,.062,.110],sunColor:0x596b99,exposure:.76,key:.65,hemi:1.15,sheen:.055}
};
const skyAdd=`uniform vec3 calmHorizon;uniform vec3 calmZenith;uniform vec3 calmGlow;uniform vec3 calmCloud;uniform float calmTime;uniform float calmMist;uniform float calmEvening;uniform vec3 calmFogDisplay;
float calmHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float calmNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(calmHash(i),calmHash(i+vec2(1.,0.)),f.x),mix(calmHash(i+vec2(0.,1.)),calmHash(i+1.),f.x),f.y);}
`;
export function createAtmosphere({sky,water,scene,renderer,key,hemi,sun}){
 const u=sky.material.uniforms;for(const [name,val] of [['calmHorizon',presets.day.horizon],['calmZenith',presets.day.zenith],['calmGlow',presets.day.glow],['calmCloud',presets.day.cloud]])u[name]={value:new THREE.Vector3(...val)};u.calmTime={value:0};u.calmMist={value:0};u.calmEvening={value:0};u.calmFogDisplay={value:new THREE.Vector3(.706,.804,.824)};
 sky.material.fragmentShader=calmAddShader(sky.material.fragmentShader).replace('#include <colorspace_fragment>','#include <colorspace_fragment>\ngl_FragColor.rgb=mix(gl_FragColor.rgb,calmFogDisplay,calmMist*(1.-smoothstep(0.,.10,h)));');sky.material.needsUpdate=true;
 let selected='day',transitioning=false;const targetSun=new THREE.Vector3(),targetColor=new THREE.Color();
 function set(mode){if(!presets[mode])return;selected=mode;transitioning=true;for(const el of document.querySelectorAll('[data-light]'))el.setAttribute('aria-pressed',String(el.dataset.light===mode));}
 for(const el of document.querySelectorAll('[data-light]'))el.onclick=()=>set(el.dataset.light);
 function update(dt,time){const p=presets[selected],k=1-Math.exp(-dt*.55);let change=0;for(const [name,field] of [['calmHorizon','horizon'],['calmZenith','zenith'],['calmGlow','glow'],['calmCloud','cloud']]){const v=u[name].value;targetSun.fromArray(p[field]);change+=v.distanceTo(targetSun);v.lerp(targetSun,k);}u.calmTime.value=time;u.calmMist.value=0;u.calmEvening.value=THREE.MathUtils.lerp(u.calmEvening.value,selected==='evening'?1:0,k);u.calmFogDisplay.value.lerp(new THREE.Vector3(((p.fog>>16)&255)/255,((p.fog>>8)&255)/255,(p.fog&255)/255),k);
  targetSun.fromArray(p.sun).normalize();sun.lerp(targetSun,k).normalize();u.sunPosition.value.copy(sun);key.position.copy(sun).multiplyScalar(100);water.material.uniforms.sunDirection.value.copy(sun);
  targetColor.set(p.sunColor);key.color.lerp(targetColor,k);water.material.uniforms.sunColor.value.lerp(targetColor,k);scene.fog.color.lerp(targetColor.set(p.fog),k);scene.fog.density=THREE.MathUtils.lerp(scene.fog.density,p.density,k);renderer.toneMappingExposure=THREE.MathUtils.lerp(renderer.toneMappingExposure,p.exposure,k);key.intensity=THREE.MathUtils.lerp(key.intensity,p.key,k);hemi.intensity=THREE.MathUtils.lerp(hemi.intensity,p.hemi,k);
  water.material.uniforms.deepA.value.lerp(new THREE.Vector3(...p.deepA),k);water.material.uniforms.deepB.value.lerp(new THREE.Vector3(...p.deepB),k);water.material.uniforms.sheen.value=THREE.MathUtils.lerp(water.material.uniforms.sheen.value,p.sheen,k);water.material.uniforms.dawnHaze.value=0;transitioning=change>.008;
 }
 return{update,state:()=>({selected,transitioning})};
}
function calmAddShader(s){s=skyAdd+s;return s.replace('gl_FragColor = vec4( retColor, 1.0 );',`float h=max(direction.y,0.);vec3 calmSky=mix(calmHorizon,calmZenith,pow(h,.42));float alignment=max(dot(direction,vSunDirection),0.);calmSky+=calmGlow*pow(alignment,18.);calmSky+=calmGlow*1.6*smoothstep(.99992,.99998,alignment);
float az=atan(direction.x,direction.z)+calmTime*.0002;float veil=exp(-pow((h-.14-.022*sin(az*3.))/.025,2.))*pow(.5+.5*sin(az*2.+.8),4.);veil+=.45*exp(-pow((h-.27-.035*sin(az*2.))/.04,2.))*pow(.5+.5*cos(az*3.-.4),3.);calmSky=mix(calmSky,calmCloud,veil*.14);calmSky+=calmEvening*vec3(.22,.071,.023)*exp(-h*30.)*pow(alignment,3.);gl_FragColor=vec4(calmSky,1.);`);}
