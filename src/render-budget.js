// Bound fragment work on high-DPI / 4K displays; adapt only after a sustained
// slowdown, then allow a much slower recovery so the image does not pump.
export function createRenderBudget(renderer){
 let factor=1,ratio=1,elapsed=0,count=0,slow=0,fast=0,cooldown=3,average=16.7;
 function resize(){const cap=Math.min(devicePixelRatio,1.25,Math.sqrt(1600000/(innerWidth*innerHeight)));ratio=cap*factor;renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);}
 resize();
 return{resize,sample(ms){if(ms>500||ms<1)return;elapsed+=ms;count++;if(elapsed<1800)return;average=elapsed/count;elapsed=0;count=0;if(cooldown>0){cooldown--;return;}if(average>26){slow++;fast=0;}else if(average<18.5){fast++;slow=0;}else{slow=fast=0;}if(slow>=2&&factor>.65){factor=Math.max(.65,factor*.85);resize();slow=0;cooldown=2;}else if(fast>=8&&factor<.999){factor=Math.min(1,factor/.85);resize();fast=0;cooldown=3;}},reset(){elapsed=count=slow=fast=0;cooldown=2;},state:()=>({pixelRatio:ratio,scale:factor,meanFrameMs:average,width:renderer.domElement.width,height:renderer.domElement.height})};
}
