'use strict';
// ATK HUB 3.2.21 POn music renderer: physical rows, 255 = unused.
const rows=[
 [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
 [16,17,18,19,20,21,22,23,24,25,26,27,28,29,255,255],
 [30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,255],
 [45,46,47,48,49,50,51,52,53,54,55,56,57,58,255,255],
 [59,60,61,62,63,64,65,66,67,68,69,70,71,72,255,255],
 [73,74,75,255,76,255,255,255,255,77,78,79,80,81,82,83]
];
function frame(state,ms,dot,voiceOptions={demo:true}){
 const pixels=Array.from({length:84},()=>[0,0,0]);
 // Use an actual lit display pixel, including its current fade/breathing gain.
 // Avoid independent RGB scaling/rounding before the shared RGB565 encoding.
 const screenColor=dot.reduce((best,p)=>p[0]+p[1]+p[2]>best[0]+best[1]+best[2]?p:best,[0,0,0]);
 rows.forEach((row,y)=>row.forEach((id,x)=>{
  if(id===255)return;
  let color,gain;
  if(state==='voice'){
   // A narrow sound curve on a black keyboard background, aligned with the display.
   color=require('./voice-animation.cjs').keyColor(x,y,ms,voiceOptions);gain=1;
  }else if(state==='busy'){
   color=[25,155,255];
   const head=(ms%1680)/1680*19-2;
   gain=.035+.7*Math.exp(-Math.pow((x-head)/2.1,2));
  }else if(['waiting','done','error'].includes(state)){
   color=screenColor;gain=1;
   // Physical YOGO backlight amber differs from the matrix at identical RGB.
   // Apply the visually checked correction only to the built-in waiting output.
   // Preview and remapped/custom animations retain their requested colors.
   if(state==='waiting'&&voiceOptions.hardwareWaitingAmber)color=[color[0],Math.round(color[1]/2),Math.round(color[2]*2/7)];
   // One entry sweep per state change; subsequent breathing cycles stay filled.
   {
    const duration=require('./builtin-animations.cjs').entryMs[state];
    const position=state==='error'?Math.abs(x-7.5)/7.5:x/15;
    gain=position<=Math.min(1,ms/duration)?1:0;
   }
  }else{
   color=dot[y*6+Math.round(x/15*5)];gain=.65;
  }
  pixels[id]=color.map(v=>Math.round(v*gain));
 }));
 return pixels;
}
module.exports={frame,rows};
