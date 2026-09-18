'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const vm=require('vm'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'player.cjs'),'utf8').split('const server=http.createServer')[0];
function fixture(enabled=true){
 const timers=new Map(),calls=[];let seq=0;
 const control={fail:false,now:10000};
 class Clock extends Date{static now(){return control.now;}}
 class Keyboard{
  constructor(){this.size=32;calls.push(['open']);}
  frame(p){calls.push(['dot',p]);}
  backlight(p){calls.push(['backlight',p]);if(control.fail)throw Error('simulated backlight failure');}
  endBacklight(){calls.push(['endBacklight']);}
  stop(){calls.push(['stop']);}
 }
 const context=vm.createContext({__dirname:root,Buffer,console,Date:Clock,
  setTimeout:fn=>{timers.set(++seq,fn);return seq;},clearTimeout:id=>timers.delete(id),
  require:name=>name==='./yogo-hid.cjs'?{Yogo:Keyboard,devices:()=>[]}:
   name==='./settings.cjs'?{local:path.join(root,'.local'),read:()=>({stateAnimations:{busy:'busy',done:'done',error:'error',waiting:'waiting'},backlightSync:enabled,resultDisplayMs:15000})}:
   name.startsWith('.')?require(path.join(root,name)):require(name)
 });
 vm.runInContext(source,context);
 return {calls,control,timers,run:code=>vm.runInContext(code,context)};
}
test('both outputs share state time, waiting holds, results release and new work reconnects',()=>{
 const f=fixture();f.run("follow={state:'waiting'};applyFollow()");
 assert.equal(f.run('releaseTimer'),null);
 f.control.now+=1900;f.run('tick()');
 const expected=f.calls.filter(c=>c[0]==='dot').at(-1)[1].find(p=>p.some(v=>v));
 const keys=f.calls.filter(c=>c[0]==='backlight').at(-1)[1];
 assert.deepEqual(keys[0],[expected[0],Math.round(expected[1]/2),Math.round(expected[2]*2/7)]);
 f.run("follow={state:'done'};applyFollow()");f.timers.get(f.run('releaseTimer'))();
 assert.equal(f.run('keyboard'),null);assert.equal(f.calls.at(-1)[0],'stop');
 f.run('applyFollow()');assert.equal(f.run('keyboard'),null);
 f.run("follow={state:'busy'};applyFollow()");assert.equal(f.calls.filter(c=>c[0]==='open').length,2);
 assert.equal(f.run('backlightError'),'');assert.equal(f.run('releaseTimer'),null);
});
test('backlight failure does not stop dot frames; retry waits for a new connection',()=>{
 const f=fixture();f.control.fail=true;f.run("start('busy')");
 assert.equal(f.run('state'),'busy');assert.equal(f.run('lastError'),'');
 assert.match(f.run('backlightError'),/simulated/);assert.ok(f.calls.some(c=>c[0]==='endBacklight'));
 f.run('tick()');assert.equal(f.calls.filter(c=>c[0]==='dot').length,2);
 assert.equal(f.calls.filter(c=>c[0]==='backlight').length,1);
 f.run('stop()');f.control.fail=false;f.run("start('busy')");
 assert.equal(f.run('backlightError'),'');assert.equal(f.calls.filter(c=>c[0]==='backlight').length,2);
});
test('disabled backlight leaves dot-only playback and manual stop working',()=>{
 const f=fixture(false);f.run("start('done');tick();stop()");
 assert.equal(f.calls.filter(c=>c[0]==='dot').length,2);
 assert.equal(f.calls.filter(c=>c[0]==='backlight').length,0);
 assert.equal(f.run('state'),'stopped');assert.equal(f.run('timer'),null);
 assert.equal(f.run('releaseTimer'),null);
});
const recording="voice.observe({protocol:1,devices:1,sessions:[{active:true,processName:'wetype_update.exe',executablePath:'C:/Program Files/Tencent/WeType/2.1.1.16/wetype_update.exe',level:.8,levelKind:'session'}]});applyFollow()";
test('voice interrupts only automatic display and resumes the newest Codex status',()=>{
 const f=fixture();f.run("follow={state:'busy'};applyFollow()");f.run(recording);
 assert.equal(f.run('state'),'voice');assert.equal(f.run('releaseTimer'),null);
 f.run("follow={state:'waiting'};applyFollow()");assert.equal(f.run('state'),'voice');
 f.run("voice.fail('capture ended');applyFollow()");assert.equal(f.run('state'),'waiting');
 assert.equal(f.run('releaseTimer'),null);
 f.run("mode='manual';start('done')");f.run(recording);assert.equal(f.run('state'),'done');
 f.run("mode='auto';applyFollow()");assert.equal(f.run('state'),'voice');
 f.run("mode='manual';stop();applyFollow()");assert.equal(f.run('state'),'stopped');
});
test('voice can display without a Codex task and does not replay an already released result',()=>{
 const f=fixture();f.run("follow={state:'stopped'}");f.run(recording);assert.equal(f.run('state'),'voice');
 f.run("voice.fail('capture ended');applyFollow()");assert.equal(f.run('keyboard'),null);
 f.run("follow={state:'done'};applyFollow()");f.timers.get(f.run('releaseTimer'))();
 f.run(recording);assert.equal(f.run('state'),'voice');
 f.run("voice.fail('capture ended');applyFollow()");assert.equal(f.run('keyboard'),null);
});
test('a new Codex batch finishing beneath voice is not confused with an older released result',()=>{
 const f=fixture();f.run("follow={state:'done'};applyFollow()");f.timers.get(f.run('releaseTimer'))();
 f.run(recording);f.run("follow={state:'busy'};applyFollow();follow={state:'done'};applyFollow()");
 assert.equal(f.run('state'),'voice');
 f.run("voice.fail('capture ended');applyFollow()");assert.equal(f.run('state'),'done');assert.ok(f.run('releaseTimer'));
});

test('backlight advances between dot updates, unchanged dots are skipped, transitions force a fresh dot',()=>{
 const f=fixture();f.run("start('busy')");
 f.control.now+=50;f.run('tick()');
 assert.equal(f.calls.filter(c=>c[0]==='dot').length,1);
 assert.equal(f.calls.filter(c=>c[0]==='backlight').length,2);
 const keys=f.calls.filter(c=>c[0]==='backlight');assert.notDeepEqual(keys[0][1],keys[1][1]);
 f.control.now+=65;f.run('tick()'); // Blue ring has not advanced its 140ms step.
 assert.equal(f.calls.filter(c=>c[0]==='dot').length,1);
 f.control.now+=115;f.run('tick()');
 assert.equal(f.calls.filter(c=>c[0]==='dot').length,2);
 f.run("start('done')");assert.equal(f.calls.filter(c=>c[0]==='dot').length,3);
 f.run('stop()');assert.equal(f.run('timer'),null);
});
test('voice backlight uses fresh amplitude between limited dot updates',()=>{
 const f=fixture();f.run("mode='auto';voiceOptions=()=>({level:.01});start('voice')");
 const quiet=f.calls.filter(c=>c[0]==='backlight').at(-1)[1];
 f.control.now+=50;f.run("voiceOptions=()=>({level:.4});tick()");
 assert.equal(f.calls.filter(c=>c[0]==='dot').length,1);
 assert.notDeepEqual(f.calls.filter(c=>c[0]==='backlight').at(-1)[1],quiet);
});

test('breathing symbols remain lit and keys follow displayed brightness across cycles',()=>{
 for(const state of ['done','error','waiting']){
  const f=fixture();f.run(`start('${state}')`);
  for(const elapsed of [1810,1860,2230,2260,2380,2410]){
   f.control.now=10000+elapsed;f.run('tick()');
   const dot=f.calls.filter(c=>c[0]==='dot').at(-1)[1];
   const keys=f.calls.filter(c=>c[0]==='backlight').at(-1)[1];
   const brightest=dot.reduce((a,b)=>a.reduce((x,y)=>x+y,0)>b.reduce((x,y)=>x+y,0)?a:b,[0,0,0]);
   const target=state==='waiting'?[brightest[0],Math.round(brightest[1]/2),Math.round(brightest[2]*2/7)]:brightest;
   for(const color of keys)if(color.some(Boolean))assert.deepEqual(color,target);
   assert.ok(dot.flat().some(Boolean));assert.ok(keys.every(p=>p.some(Boolean)));
   if(elapsed===2410)assert.ok(dot.flat().some(Boolean));
  }
 }
});

test('remapping waiting to another animation does not apply built-in amber compensation',()=>{
 const f=fixture();f.run("initial.stateAnimations.waiting='done';start('waiting')");
 f.control.now+=1200;f.run('tick()');
 const dot=f.calls.filter(c=>c[0]==='dot').at(-1)[1].find(p=>p.some(Boolean));
 assert.deepEqual(f.calls.filter(c=>c[0]==='backlight').at(-1)[1][0],dot);
});

test('entry completion sends the complete symbol before the filled backlight, despite dot rate limiting',()=>{
 for(const [state,end,count] of [['done',720,6],['error',960,12],['waiting',760,9]]){
  const f=fixture();f.run(`start('${state}')`);
  f.control.now=10000+end-30;f.run('tick()');
  assert.equal(f.calls.filter(c=>c[0]==='dot').at(-1)[1].filter(p=>p.some(Boolean)).length,count-1);
  f.control.now=10000+end;f.run('tick()');
  assert.equal(f.calls.at(-2)[0],'dot');assert.equal(f.calls.at(-1)[0],'backlight');
  assert.equal(f.calls.at(-2)[1].filter(p=>p.some(Boolean)).length,count);
  assert.ok(f.calls.at(-1)[1].every(p=>p.some(Boolean)));
 }
});
