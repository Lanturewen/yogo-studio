const {test}=require('node:test'),assert=require('node:assert/strict');
const a=require('../animations.cjs');
test('symbols grow exactly once with the sweep, then breathe without disappearing or redrawing',()=>{
 const {entryMs}=require('../builtin-animations.cjs');
 const lit=p=>p.filter(rgb=>rgb.some(Boolean)).length;
 for(const [id,count] of [['done',6],['error',12],['waiting',9]]){
  const end=entryMs[id];
  assert.equal(lit(a.frame(id,0)),1);
  assert.ok(lit(a.frame(id,end/2))>1&&lit(a.frame(id,end/2))<count);
  assert.equal(lit(a.frame(id,end-1)),count-1);
  for(let t=end;t<end+7200;t+=25)assert.equal(lit(a.frame(id,t)),count);
  const peak=Math.max(...a.frame(id,end).flat()),low=Math.max(...a.frame(id,end+1200).flat());
  assert.ok(low>0&&low<peak*.4);
  for(const t of [0,330,1200,2300])assert.deepEqual(a.frame(id,end+t),a.frame(id,end+t+2400));
  assert.deepEqual(a.frame(id,end+2399),a.frame(id,end+2400));
 }
});
test('every shipped animation yields valid hardware pixels',()=>{
 assert.deepEqual(a.errors,[]);
 for(const {id} of a.list())for(const t of [0,140,1000,15000]){
  const frame=a.frame(id,t);assert.equal(frame.length,36);
  assert.ok(frame.every(p=>p.length===3&&p.every(v=>Number.isInteger(v)&&v>=0&&v<=255)));
 }
});
test('invalid extension and duplicate IDs are rejected',()=>{
 assert.throws(()=>a.validate({id:'../bad'}));
 assert.throws(()=>a.validate({id:'custom-test',name:'test',frameMs:1,frames:[]}));
 const d={id:'custom-test',name:'test',frameMs:100,frames:[Array.from({length:36},()=>[0,0,0])]};
 a.register(d);assert.throws(()=>a.register(d));
 d.frames[0][0][0]=256;assert.throws(()=>a.validate(d));
});
