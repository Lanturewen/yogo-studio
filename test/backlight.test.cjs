'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),vm=require('vm'),path=require('path');
const backlight=require('../backlight.cjs'),dot=require('../builtin-animations.cjs');
test('physical map covers all 84 LEDs once; state cycles and persistent breathing match display',()=>{
 assert.deepEqual(backlight.rows.flat().filter(i=>i!==255).sort((a,b)=>a-b),Array.from({length:84},(_,i)=>i));
 for(const state of ['busy','waiting','done','error'])for(const ms of [0,330,1000,1800,2300]){
  const pixels=backlight.frame(state,ms,dot.frame(state,ms));
  assert.equal(pixels.length,84);assert.ok(pixels.flat().every(n=>Number.isInteger(n)&&n>=0&&n<=255));
  if(!['done','error','waiting'].includes(state)||ms>=1000)assert.deepEqual(pixels,backlight.frame(state,ms+(state==='busy'?1680:2400),dot.frame(state,ms)));
 }
 for(const state of ['done','error','waiting'])assert.ok(backlight.frame(state,1200,dot.frame(state,1200)).every(p=>p.some(n=>n>0)));
});
function fixture(wireless){
 const packets=[];let closed=false,reject=false;
 class HID{write(p){packets.push(Buffer.from(p.slice(1)));}readTimeout(){const p=Buffer.from(packets.at(-1));if(reject)p[2]=255;return p;}close(){closed=true;}}
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../yogo-hid.cjs'),'utf8'),{module,Buffer,console,require:()=>({HID,devices:()=>[{vendorId:0x373b,productId:wireless?0x11ff:0x119b,usagePage:0xff60,usage:0x61,path:'fake'}]})});
 return {y:new module.exports.Yogo({wireless}),packets,reject:()=>reject=true,closed:()=>closed};
}
test('done and waiting use the actual display RGB throughout breathing',()=>{
 for(const state of ['done','error','waiting'])for(let ms=0;ms<2400;ms+=55){
  const screen=dot.frame(state,ms),expected=screen.find(p=>p.some(n=>n))||[0,0,0];
  const keys=backlight.frame(state,ms,screen);
  for(const color of keys)if(color.some(n=>n))assert.deepEqual(color,expected);
  if(state==='waiting'&&ms>=760)assert.ok(keys.every(color=>color.every((v,i)=>v===expected[i])));
 }
 // A remapped state must follow the supplied screen color, not a hard-coded palette.
 const custom=Array.from({length:36},()=>[70,20,190]);
 for(const state of ['done','error','waiting'])assert.deepEqual(backlight.frame(state,1000,custom)[0],custom[0]);
});
test('custom animation uses physical row/column colors without altering its input',()=>{
 const screen=Array.from({length:36},(_,i)=>[i*7,255-i*7,i]);
 const before=JSON.stringify(screen),keys=backlight.frame('custom-test',0,screen);
 assert.equal(JSON.stringify(screen),before);
 assert.deepEqual(keys[0],screen[0].map(v=>Math.round(v*.65)));
 assert.deepEqual(keys[83],screen[35].map(v=>Math.round(v*.65)));
});
test('physical waiting amber compensation preserves preview, other states and breathing',()=>{
 for(const ms of [800,1200,2000,3200]){
  const screen=dot.frame('waiting',ms),before=JSON.stringify(screen);
  const logical=backlight.frame('waiting',ms,screen),physical=backlight.frame('waiting',ms,screen,{hardwareWaitingAmber:true});
  for(let i=0;i<84;i++)assert.deepEqual(physical[i],[logical[i][0],Math.round(logical[i][1]/2),Math.round(logical[i][2]*2/7)]);
  assert.equal(JSON.stringify(screen),before);
 }
 for(const state of ['done','error','busy'])assert.deepEqual(backlight.frame(state,1200,dot.frame(state,1200),{hardwareWaitingAmber:true}),backlight.frame(state,1200,dot.frame(state,1200)));
});
for(const wireless of [true,false])test(`backlight wire format, restore and allowlist (${wireless?'wireless':'wired'})`,()=>{
 const f=fixture(wireless),pixels=Array.from({length:84},()=>[255,0,0]);f.y.backlight(pixels);
 const writes=f.packets.filter(p=>p[1]===0x2e),payload=wireless?24:56;
 assert.equal(writes.length,Math.ceil(170/payload));
 const data=Buffer.concat(writes.map((p,i)=>{assert.equal(p.length,wireless?32:64);assert.equal(p.readUInt16LE(2),i*payload);assert.ok(p[4]<=payload);return p.subarray(8,8+p[4]);}));
 assert.equal(data.length,170);for(let i=0;i<84;i++)assert.equal(data.readUInt16LE(i*2),0xf800);assert.equal(data.readUInt16LE(168),0);
 assert.throws(()=>f.y.command(0x15),/allowlist/);
 f.y.stop();assert.deepEqual(f.packets.slice(-3).map(p=>p[1]),[0x2f,0x3d,0x11]);assert.ok(f.closed());
});
for(const wireless of [true,false])test(`key matrix read and write use the device transport packet size (${wireless?'wireless':'wired'})`,()=>{
 const f=fixture(wireless),length=(wireless?24*16:56*7),matrix=f.y.readKeyMatrix();assert.equal(matrix.length,length);
 f.y.writeKeyMatrix(Buffer.alloc(length,7));const writes=f.packets.filter(p=>p[1]===0x1b),payload=wireless?24:56;
 assert.equal(writes.length,length/payload);writes.forEach((packet,index)=>{assert.equal(packet.readUInt16LE(2),index*payload);assert.equal(packet[4],payload);assert.ok(packet.subarray(8,8+payload).every(value=>value===7));});
 f.y.stop();
});
test('failed backlight restoration still attempts display release and closes handle',()=>{
 const f=fixture(true);f.y.backlight(Array.from({length:84},()=>[0,0,0]));f.reject();assert.throws(()=>f.y.stop());
 assert.deepEqual(f.packets.slice(-3).map(p=>p[1]),[0x2f,0x3d,0x11]);assert.ok(f.closed());
});

 test('result entry sweeps fill once, then stay filled through later breathing cycles',()=>{
  for(const [state,duration] of [['done',720],['error',960],['waiting',760]]){
   const keys=t=>backlight.frame(state,t,dot.frame(state,t));
   assert.ok(keys(0).some(p=>p.every(v=>v===0)));
   assert.ok(keys(duration/2).some(p=>p.every(v=>v===0)));
   assert.ok(keys(duration/2).some(p=>p.some(Boolean)));
   for(const t of [duration,2400,2410,4800,7200])assert.ok(keys(t).every(p=>p.some(Boolean)));
   if(state!=='error'){assert.ok(keys(duration/2)[0].some(Boolean));assert.ok(keys(duration/2)[15].every(v=>v===0));}
   else {assert.ok(keys(duration/2)[7].some(Boolean));assert.ok(keys(duration/2)[0].every(v=>v===0));}
  }
 });
