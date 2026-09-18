'use strict';
const ring=[2,3,10,17,23,28,33,32,25,18,12,7];
const check=[24,31,26,21,16,11];
const cross=[0,7,14,21,28,35,5,10,15,20,25,30];
const resultCycleMs=2400;
const entryMs={done:720,error:960,waiting:760};
function frame(state,ms){
  const pixels=Array.from({length:36},()=>[0,0,0]);
  const set=(i,c,g=1)=>pixels[i]=c.map(v=>Math.round(v*g));
  if(state==='busy'){
    const head=Math.floor(ms/140)%ring.length;
    ring.forEach(i=>set(i,[25,155,255],.06));
    for(let j=0;j<5;j++)set(ring[(head-j+12)%12],[25,155,255],[1,.65,.35,.17,.08][j]);
  }else if(['waiting','done','error'].includes(state)){
    // Grow once on entry; only the brightness repeats after the shape is complete.
    const shape=state==='done'?check:state==='error'?cross:[1,2,3,6,10,16,21,20,32];
    const color=state==='done'?[35,235,110]:state==='error'?[255,40,55]:[255,180,35];
    const duration=entryMs[state],breathingMs=Math.max(0,ms-duration);
    const gain=.25+.75*(1+Math.cos((breathingMs%resultCycleMs)/resultCycleMs*Math.PI*2))/2;
    const count=Math.min(shape.length,1+Math.floor(Math.max(0,ms)/duration*(shape.length-1)));
    shape.slice(0,count).forEach(i=>set(i,color,gain));
  }else throw new Error('Unknown animation');
  return pixels;
}
module.exports={frame,resultCycleMs,entryMs};
