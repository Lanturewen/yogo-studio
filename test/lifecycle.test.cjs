'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const {Lifecycle,Watcher}=require('../codex-watch.cjs');
const {GlobalWatcher}=require('../codex-watch.cjs');
test('global: simultaneous tasks, failure priority, new batches and resumed archives',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yogo-global-test-'));
  const write=(id,rows)=>fs.appendFileSync(path.join(dir,id+'.jsonl'),rows.map(JSON.stringify).join('\n')+'\n');
  const init=id=>({type:'session_meta',payload:{id}});
  try{
    write('one',[init('one'),event('task_started',{turn_id:'a'})]);
    write('two',[init('two'),event('task_started',{turn_id:'b'})]);
    const w=new GlobalWatcher({sessionsRoot:dir},()=>{});w.poll();assert.equal(w.snapshot().active,2);
    write('one',[event('error')]);w.poll();assert.equal(w.snapshot().state,'busy');assert.equal(w.snapshot().failed,1);
    write('two',[event('task_complete',{turn_id:'b'})]);w.poll();assert.equal(w.snapshot().state,'error');
    write('two',[event('task_started',{turn_id:'c'})]);w.poll();assert.equal(w.snapshot().failed,0);
    write('two',[event('task_complete',{turn_id:'c'})]);w.poll();assert.equal(w.snapshot().state,'done');
    write('old',[init('old'),event('task_started',{turn_id:'stale'})]);fs.utimesSync(path.join(dir,'old.jsonl'),1,1);
    w.scanAt=0;w.poll();assert.equal(w.snapshot().state,'done');
    write('old',[event('task_started',{turn_id:'resumed'})]);w.poll();assert.equal(w.snapshot().active,1);
    write('old',[event('turn_aborted',{turn_id:'resumed'})]);w.poll();assert.equal(w.snapshot().state,'stopped');
    write('new',[init('new'),event('task_started',{turn_id:'new'})]);w.scanAt=0;w.poll();assert.equal(w.snapshot().active,1);
  }finally{for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir);}
});
const meta={type:'session_meta',payload:{id:'selected'}};
const event=(type,extra={})=>({type:'event_msg',payload:{type,...extra}});
function model(){const m=new Lifecycle('selected');m.accept(meta);m.accept(event('task_started',{turn_id:'a'}));return m;}
test('normal completion; duplicate start cannot restart a finished turn',()=>{
  const m=model();assert.equal(m.state,'busy');m.accept(event('task_complete',{turn_id:'a'}));assert.equal(m.state,'done');
  m.accept(event('task_started',{turn_id:'a'}));assert.equal(m.state,'done');
});
test('tool failures, prose, retry and non-turn errors do not turn red',()=>{
  const m=model();for(const e of [event('exec_command_end',{exit_code:1}),event('stream_error'),event('agent_message',{message:'error'}),event('error',{will_retry:true}),event('error',{codex_error_info:'thread_rollback_failed'}),event('error',{codex_error_info:{active_turn_not_steerable:{}}})])m.accept(e);
  assert.equal(m.state,'busy');
});
test('terminal error stays red across completion; next turn recovers',()=>{
  const m=model();m.accept(event('error',{codex_error_info:'usage_limit_exceeded'}));assert.equal(m.state,'error');
  m.accept(event('task_complete',{turn_id:'a'}));assert.equal(m.state,'error');
  m.accept(event('task_started',{turn_id:'b'}));assert.equal(m.state,'busy');
  m.accept(event('task_complete',{turn_id:'b',error:{message:'terminal'}}));assert.equal(m.state,'error');
});
test('cancel is neutral; wrong turn and session are ignored',()=>{
  const m=model();m.accept(event('task_complete',{turn_id:'other'}));assert.equal(m.state,'busy');
  m.accept(event('turn_aborted',{turn_id:'a',reason:'interrupted'}));assert.equal(m.state,'stopped');
  const other=new Lifecycle('selected');other.accept({type:'session_meta',payload:{id:'other'}});other.accept(event('task_started',{turn_id:'a'}));assert.equal(other.state,'stopped');
});
test('tail handles split UTF8, partial records, truncation and missing file',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yogo-watch-test-')),file=path.join(dir,'events.jsonl');
  try{
    fs.writeFileSync(file,JSON.stringify(meta)+'\n'+JSON.stringify(event('task_started',{turn_id:'a'}))+'\n');
    const updates=[],w=new Watcher({sessionId:'selected',transcript:file},s=>updates.push(s));w.poll();assert.equal(updates.at(-1).state,'busy');
    const bytes=Buffer.from(JSON.stringify(event('task_complete',{turn_id:'a',last_agent_message:'完成'}))+'\n');
    const cut=bytes.indexOf(Buffer.from('完'))+1;fs.appendFileSync(file,bytes.subarray(0,cut));w.poll();assert.equal(updates.length,1);
    fs.appendFileSync(file,bytes.subarray(cut));w.poll();assert.equal(updates.at(-1).state,'done');w.poll();assert.equal(updates.length,2);
    fs.writeFileSync(file,JSON.stringify(meta)+'\n');w.poll();assert.equal(updates.at(-1).state,'stopped');
    fs.unlinkSync(file);w.poll();assert.ok(updates.at(-1).error);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('startup suppresses historical completed animation',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yogo-watch-test-')),file=path.join(dir,'events.jsonl');
  try{fs.writeFileSync(file,[meta,event('task_started',{turn_id:'a'}),event('task_complete',{turn_id:'a'})].map(JSON.stringify).join('\n')+'\n');
    let result;const w=new Watcher({sessionId:'selected',transcript:file},s=>result=s);w.poll();assert.equal(result.state,'stopped');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
