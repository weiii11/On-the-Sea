import * as THREE from 'three';
// The density field from natural-light study A, evaluated along each view ray.
// No camera-facing mist cards or colour overlay on the whole frame.
const glsl=`
precision highp sampler3D;
uniform float seaMistTime;uniform float seaMistAmount;uniform vec3 seaMistSun;uniform sampler3D seaMistNoise;
float smNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return texture(seaMistNoise,(i+f+32.5)/128.).r;}
float smFbm(vec3 p){return .56*smNoise(p)+.28*smNoise(p*2.03+17.3)+.16*smNoise(p*4.17+32.1);}
float smDensity(vec3 p){
 if(p.y>12.||p.y< -7.)return 0.;
 vec2 xz=p.xz;float nearFade=smoothstep(12.,28.,length(xz));
 vec2 a=(xz-vec2(-24.,-52.))/vec2(55.,28.),b=(xz-vec2(60.,-102.))/vec2(75.,35.);
 float banks=exp(-dot(a,a))+.65*exp(-dot(b,b))+.22*exp(-pow((length(xz)-150.)/55.,2.));
 if(banks<.002)return 0.;
 vec3 q=p*vec3(.061,.21,.071)+vec3(-seaMistTime*.014,0,seaMistTime*.007);
 float warp=smNoise(q*.55+9.1);float n=smFbm(q+vec3(warp*1.6,0,warp));
 float top=2.1+smNoise(vec3(p.x*.025,0,p.z*.025))*5.;
 float height=exp(-pow((p.y-1.)/max(1.,top*.62),2.));
 return banks*height*smoothstep(.33,.66,n)*nearFade*.085*seaMistAmount;
}
vec3 seaMist(vec3 origin,vec3 rd,float end,vec3 background){
 if(seaMistAmount<.0001)return background;
 float limit=min(end,205.),trans=1.,previous=0.;vec3 scatter=vec3(0.);
 for(int i=0;i<16;i++){float f=float(i+1)/16.,next=limit*f*f,stepSize=next-previous;vec3 p=origin+rd*((next+previous)*.5);previous=next;
  float opacity=1.-exp(-smDensity(p)*stepSize);
  float light=smoothstep(-45.,65.,p.x)*.65+.35*pow(max(dot(rd,seaMistSun),0.),4.);
  vec3 color=mix(vec3(.64,.73,.78),vec3(1.02,.87,.65),light);
  scatter+=trans*opacity*color;trans*=1.-opacity;
 }return background*trans+scatter;
}
`;
export function createVolumeMist(sun){
 // Cache the same noise lattice once. Hardware trilinear sampling replaces
 // eight hashes per lookup, retaining the cubic interpolation in the shader.
 const f=Math.fround,fract=v=>v-Math.floor(v),data=new Uint8Array(128*128*128);
 let at=0;for(let z=0;z<128;z++)for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  let a=f(fract(f((x-32)*f(.1031)))),b=f(fract(f((y-32)*f(.1031)))),c=f(fract(f((z-32)*f(.1031))));
  const d=f(f(f(a*f(b+f(33.33)))+f(b*f(c+f(33.33))))+f(c*f(a+f(33.33))));
  a=f(a+d);b=f(b+d);c=f(c+d);data[at++]=Math.round(fract(f(f(a+b)*c))*255);
 }
 const noise=new THREE.Data3DTexture(data,128,128,128);noise.format=THREE.RedFormat;noise.type=THREE.UnsignedByteType;noise.minFilter=THREE.LinearFilter;noise.magFilter=THREE.LinearFilter;noise.wrapS=noise.wrapT=noise.wrapR=THREE.RepeatWrapping;noise.unpackAlignment=1;noise.generateMipmaps=false;noise.needsUpdate=true;
 const uniforms={seaMistTime:{value:0},seaMistAmount:{value:0},seaMistSun:{value:sun},seaMistNoise:{value:noise}},treated=new WeakSet();
 function inject(material,worldName,origin='cameraPosition',end=null){Object.assign(material.uniforms,uniforms);material.fragmentShader=glsl+material.fragmentShader;material.fragmentShader=material.fragmentShader.replace('#include <tonemapping_fragment>',`gl_FragColor.rgb=seaMist(${origin},normalize(${worldName}-${origin}),${end??`length(${worldName}-${origin})`},gl_FragColor.rgb);\n#include <tonemapping_fragment>`);material.needsUpdate=true;}
 return{uniforms,attachSky(sky){inject(sky.material,'vWorldPosition','cameraPosition','1000.');},attachWater(water){inject(water.material,'worldPosition.xyz','eye');},attachFish(group){group.traverse(object=>{const material=object.material;if(!material||treated.has(material))return;treated.add(material);if(material.isShaderMaterial){inject(material,'world');}else{material.onBeforeCompile=shader=>{Object.assign(shader.uniforms,uniforms);shader.vertexShader='varying vec3 smWorld;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nsmWorld=(modelMatrix*vec4(transformed,1.)).xyz;');shader.fragmentShader='varying vec3 smWorld;\n'+glsl+shader.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.rgb=seaMist(cameraPosition,normalize(smWorld-cameraPosition),length(smWorld-cameraPosition),gl_FragColor.rgb);\n#include <tonemapping_fragment>');};material.customProgramCacheKey=()=> 'sea-mist-return-v1';material.needsUpdate=true;}});},update(dt,time,active){uniforms.seaMistTime.value=time;uniforms.seaMistAmount.value=THREE.MathUtils.damp(uniforms.seaMistAmount.value,active?1:0,.55,dt);if(!active&&uniforms.seaMistAmount.value<.0001)uniforms.seaMistAmount.value=0;},state:()=>uniforms.seaMistAmount.value};
}
