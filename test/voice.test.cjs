'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {VoiceState,providers}=require('../voice-state.cjs');
const animation=require('../voice-animation.cjs'),backlight=require('../backlight.cjs');
const capture=(extra={})=>({active:true,processName:'wetype_update.exe',executablePath:'C:\\Program Files\\Tencent\\WeType\\2.1.1.16\\wetype_update.exe',level:.2,levelKind:'endpoint',...extra});
const packet=sessions=>({protocol:1,devices:2,sessions,errors:[]});
test('only active WeType captures at its installation path activate voice, including its recording helper',()=>{
 const v=new VoiceState();
 for(const row of [capture({active:false}),capture({processName:'Weixin.exe'}),capture({processName:'chrome.exe'}),capture({executablePath:'C:\\Other\\wetype_update.exe'})]){
  v.observe(packet([row]),100);assert.equal(v.snapshot(100).active,false);
 }
 v.observe(packet([capture()]),200);assert.equal(v.snapshot(200).providerId,'wetype');assert.equal(v.snapshot(200).level,.2);
});
test('capture ending, process loss and stale external events cannot leave a stuck waveform',()=>{
 const v=new VoiceState();v.observe(packet([capture()]),100);
 v.observe(packet([]),200);assert.equal(v.snapshot(200).active,true);
 v.observe(packet([]),500);assert.equal(v.snapshot(500).active,false);
 v.observe(packet([capture()]),600);assert.equal(v.snapshot(2600).active,false);
 v.observe(packet([capture()]),3000);v.fail('observer lost');assert.equal(v.snapshot(3001).active,false);
 assert.equal(v.snapshot(3001).error,'observer lost');
});
test('provider interface supports explicit future event adapters with validation and expiry',()=>{
 const v=new VoiceState([{id:'future-dictation',name:'Future dictation',type:'event',enabled:true}]);
 assert.throws(()=>v.accept({providerId:'wetype',active:true}),/provider/);
 for(const level of [-1,2,NaN,'0.2'])assert.throws(()=>v.accept({providerId:'future-dictation',active:true,level}),/Invalid/);
 v.accept({providerId:'future-dictation',active:true,level:.7},100);
 assert.equal(v.snapshot(101).levelKind,'provider');assert.equal(v.snapshot(2100).active,false);
 v.accept({providerId:'future-dictation',active:false},2200);assert.equal(v.snapshot(2200).active,false);
 assert.throws(()=>providers([{id:'x',name:'x',type:'audio-session',enabled:true,processNames:['*.exe']}]),/exact/);
});
test('invalid levels never become audio energy; the strongest active provider wins',()=>{
 const v=new VoiceState();v.observe(packet([capture({level:null})]),10);
 assert.equal(v.snapshot(10).active,true);assert.equal(v.snapshot(10).level,null);
 v.observe(packet([capture({level:Infinity}),capture({level:.1,levelKind:'session'})]),20);
 assert.equal(v.snapshot(20).level,.1);assert.equal(v.snapshot(20).levelKind,'session');
});
test('display stays tall and animated while backlight alone responds to measured amplitude',()=>{
 for(const ms of [0,200,1000,2300]){
  const silent=animation.frame(ms,{level:0}),loud=animation.frame(ms,{level:1});
  assert.deepEqual(loud,silent);
  assert.notDeepEqual(backlight.frame('voice',ms,loud,{level:0}),backlight.frame('voice',ms,loud,{level:1}));
  const litRows=Array.from({length:6},(_,y)=>y).filter(y=>loud.slice(y*6,y*6+6).some(p=>p[1]>20));
  assert.ok(litRows.at(-1)-litRows[0]>=3);
  for(let x=0;x<6;x++)assert.ok(Array.from({length:6},(_,y)=>loud[y*6+x]).filter(p=>p[1]>20).length<=3);
  const keys=backlight.frame('voice',ms,loud,{level:1});
  assert.equal(keys.length,84);assert.ok(keys.flat().every(n=>Number.isInteger(n)&&n>=0&&n<=255));
  const lit=keys.filter(p=>p.some(v=>v));assert.ok(lit.length>0&&lit.length<=32);
  assert.ok(lit.every(([r,g,b])=>g>r&&g>b));
  for(let x=0;x<16;x++)assert.ok(Array.from({length:6},(_,y)=>animation.keyColor(x,y,ms,{level:1})).filter(p=>p.some(v=>v)).length<=2);
  assert.deepEqual(keys[83],animation.keyColor(15,5,ms,{level:1}));
  assert.deepEqual(animation.frame(ms,{level:null}),silent);
 }
 assert.deepEqual(animation.frame(1000,{demo:true}),animation.frame(1000,{level:0}));
 assert.notDeepEqual(animation.frame(0),animation.frame(200));
});
test('voice level smoothing rises quickly and decays softly without fabricating missing meter values',()=>{
 const v=new VoiceState();v.observe(packet([capture({level:.1})]),0);
 v.observe(packet([capture({level:.9})]),150);const peak=v.snapshot(150).level;
 assert.ok(peak>.1&&peak<.9);
 v.observe(packet([capture({level:0})]),300);assert.ok(v.snapshot(300).level>0&&v.snapshot(300).level<peak);
 v.observe(packet([capture({level:null})]),450);assert.equal(v.snapshot(450).level,null);
});

test('macOS matches only WeType input activity inside its app and expires on capture end',()=>{
 const {platformDefaults}=require('../voice-state.cjs');
 const v=new VoiceState(platformDefaults('darwin'));
 const session={active:true,processName:'WeType',executablePath:'/Library/Input Methods/WeType.app/Contents/MacOS/WeType',level:null};
 for(const row of [{...session,active:false},{...session,processName:'Other'},{...session,executablePath:'/tmp/WeType'}]){
  v.observe(packet([row]),100);assert.equal(v.snapshot(100).active,false);
 }
 v.observe(packet([session]),200);assert.equal(v.snapshot(200).providerId,'wetype');assert.equal(v.snapshot(200).level,null);
 v.observe(packet([]),600);assert.equal(v.snapshot(600).active,false);
 assert.deepEqual(platformDefaults('win32')[0].pathIncludes,'\\tencent\\wetype\\');
});

test('macOS RMS samples move the real animation; permission failures preserve capture state and clear old levels',()=>{
 const {platformDefaults}=require('../voice-state.cjs');
 const v=new VoiceState(platformDefaults('darwin'));
 const session={active:true,processName:'WeType',executablePath:'/Library/Input Methods/WeType.app/Contents/MacOS/WeType',level:0.002,levelKind:'microphone-rms'};
 v.observe(packet([session]),100);
 const quiet=backlight.frame('voice',350,animation.frame(350),v.snapshot(100));
 v.observe(packet([{...session,level:.15}]),150);
 const loud=backlight.frame('voice',350,animation.frame(350),v.snapshot(150));
 assert.notDeepEqual(quiet,loud);assert.equal(v.snapshot(150).levelKind,'microphone-rms');
 v.observe({...packet([{...session,level:null,levelKind:'unavailable'}]),meterError:'Microphone permission denied'},200);
 assert.equal(v.snapshot(200).active,true);assert.equal(v.snapshot(200).level,null);assert.match(v.snapshot(200).error,/permission/);
 v.observe(packet([]),650);assert.equal(v.snapshot(650).active,false);assert.equal(v.snapshot(650).error,'');
});
