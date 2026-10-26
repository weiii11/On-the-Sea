// A steady soft bed with restrained, slow surf swells. Stereo noise is
// crossfaded across a 64-second loop; onset/offset and volume changes ramp.
export function makeSeaAudio(ctx,destination=ctx.destination){
 const master=ctx.createGain();master.gain.value=0;master.connect(destination);
 let seed=53981;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const rate=22050,length=rate*64,overlap=rate*2,buffer=ctx.createBuffer(2,length,rate);
 for(let c=0;c<2;c++){const raw=new Float32Array(length+overlap);let b0=0,b1=0,b2=0;for(let i=0;i<raw.length;i++){const w=rnd()*2-1;b0=.99765*b0+w*.099046;b1=.963*b1+w*.2965164;b2=.57*b2+w*1.0526913;raw[i]=(b0+b1+b2+w*.1848)*.12;}const out=buffer.getChannelData(c);out.set(raw.subarray(0,length));for(let i=0;i<overlap;i++){const u=i/overlap,blend=u*u*(3-2*u);out[i]=raw[length+i]*(1-blend)+raw[i]*blend;}}
 const sources=[];
 function bed(offset,lowHz,highHz,level){const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=highHz;hp.Q.value=.5;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=lowHz;lp.Q.value=.5;const amp=ctx.createGain();amp.gain.value=level;source.connect(hp);hp.connect(lp);lp.connect(amp);const breath=ctx.createGain();breath.gain.value=1;amp.connect(breath);breath.connect(master);source.start(0,offset);sources.push(source);return{lp,amp,breath};}
 bed(0,1000,85,.34);const wash=bed(23,1000,150,.06);
 let next=ctx.currentTime,volume=.55,enabled=false,lastSwell=-1;
 function schedule(){while(next<ctx.currentTime+120){const duration=13+rnd()*6,peak=.23+rnd()*.06,rise=.36+rnd()*.07,curve=new Float32Array(180),cutoff=new Float32Array(180);for(let i=0;i<curve.length;i++){const u=i/(curve.length-1);const part=u<rise?u/rise:(1-u)/(1-rise);const envelope=.5-.5*Math.cos(Math.PI*Math.max(0,part));curve[i]=.06+peak*envelope;cutoff[i]=850+450*envelope;}wash.amp.gain.setValueCurveAtTime(curve,next,duration);wash.lp.frequency.setValueCurveAtTime(cutoff,next,duration);next+=duration+.01;}}
 schedule();const timer=setInterval(schedule,3000);
 return{setSwell(v){v=Math.max(0,Math.min(1,v));if(Math.abs(v-lastSwell)<.008)return;lastSwell=v;wash.breath.gain.setTargetAtTime(1+.45*v,ctx.currentTime,1.2);},async toggle(){await ctx.resume();enabled=!enabled;this.setVolume(volume);return enabled;},setVolume(v){volume=Math.max(0,Math.min(1,v));master.gain.setTargetAtTime(enabled?volume*.7:0,ctx.currentTime,1.5);},isOn:()=>enabled,volume:()=>volume,dispose(){clearInterval(timer);for(const s of sources)s.stop();master.disconnect();}};
}
