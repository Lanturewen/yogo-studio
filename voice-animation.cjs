'use strict';
const color=[7,193,96];
function energy(ms,{level=null,demo=false}={}){
 return demo?.15+.75*Math.pow((1+Math.sin(ms/460))/2,2):
  typeof level==='number'?Math.min(1,Math.sqrt(Math.max(0,level))*2):0;
}
function frame(ms){
 // Display indicates active dictation with a tall moving curve, independent of mic level.
 const amplitude=.82;
 const pixels=Array.from({length:36},()=>[0,0,0]);
 for(let x=0;x<6;x++){
  const center=2.5+amplitude*2.1*Math.sin(ms/270-x*1.15);
  const previous=2.5+amplitude*2.1*Math.sin((ms-70)/270-x*1.15);
  for(let y=0;y<6;y++){
   const stroke=Math.max(0,1-Math.abs(y-center));
   const trail=.16*Math.max(0,1-Math.abs(y-previous));
   const gain=Math.max(stroke,trail)*(.35+.65*amplitude);
   pixels[y*6+x]=color.map(v=>Math.round(v*gain));
  }
 }
 return pixels;
}
function keyColor(x,y,ms,options={}){
 const amplitude=energy(ms,options);
 // Sample the display's continuous curve across the 16 keyboard columns.
 // Only the one or two rows touching the line light up; every other key is black.
 const center=2.5+amplitude*2.1*Math.sin(ms/270-(x/15*5)*1.15);
 const gain=Math.max(0,1-Math.abs(y-center)/.85)*(.55+.45*amplitude);
 return gain<.03?[0,0,0]:color.map(v=>Math.round(v*gain));
}
module.exports={frame,keyColor};
