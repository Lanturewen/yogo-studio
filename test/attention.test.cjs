'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Attention,normalize}=require('../attention.cjs');
const {Lifecycle,aggregate}=require('../codex-watch.cjs');
const {definition,merge}=require('../scripts/install-hooks.cjs');
const event=(name,extra={})=>normalize({hook_event_name:name,session_id:'one',turn_id:'a',tool_name:'Bash',tool_input:{command:'private command',description:'private reason'},...extra});
test('permission priority, deduplication, exact completion, multiple sessions and terminal cleanup',()=>{
  const a=new Attention(),base={state:'busy',active:2};
  a.accept(event('PermissionRequest'));a.accept(event('PermissionRequest'));
  assert.equal(a.overlay(base,[]).waiting,1);
  a.accept(event('PostToolUse',{tool_input:{command:'unrelated'}}));assert.equal(a.overlay(base,[]).state,'waiting');
  a.accept(event('PermissionRequest',{session_id:'two'}));
  a.accept(event('PostToolUse',{tool_input:{command:'private command'}}));assert.equal(a.overlay(base,[]).waiting,1);
  assert.equal(a.overlay(base,[],'one').state,'busy');
  a.accept(event('Interrupt',{session_id:'two'}));assert.equal(a.overlay(base,[]).state,'busy');
  a.accept(event('PermissionRequest'));assert.equal(a.overlay(base,[{sessionId:'one',turnId:'a',state:'done'}]).waiting,0);
});
test('hook forwards only identifiers and hashes, no decisions, input, answers or transcript',()=>{
  const e=event('PermissionRequest');assert.ok(!JSON.stringify(e).includes('private'));
  assert.equal(normalize({hook_event_name:'unexpected',session_id:'a'}),null);
  assert.throws(()=>new Attention().accept({event:'PermissionRequest'}));
});
test('plan question waits until matching answer; unrelated output and prose ignored',()=>{
  const l=new Lifecycle('one');l.accept({type:'session_meta',payload:{id:'one'}});
  l.accept({type:'event_msg',payload:{type:'task_started',turn_id:'a'}});
  const row=payload=>({type:'response_item',payload});
  l.accept(row({type:'function_call',name:'request_user_input',call_id:'q1'}));
  assert.equal(l.state,'waiting');assert.equal(aggregate([l.snapshot(),{state:'busy'}]).state,'waiting');
  l.accept(row({type:'function_call_output',call_id:'other',output:'done'}));assert.equal(l.state,'waiting');
  l.accept(row({type:'function_call_output',call_id:'q1',output:'answer'}));assert.equal(l.state,'busy');
  l.accept(row({type:'message',role:'assistant',content:'please approve?'}));assert.equal(l.state,'busy');
  l.accept(row({type:'function_call',name:'request_user_input',call_id:'q2'}));
  l.accept({type:'event_msg',payload:{type:'turn_aborted',turn_id:'a'}});assert.equal(l.state,'stopped');
});
test('question hook pair and new turn cleanup',()=>{
  const a=new Attention(),input={tool_name:'request_user_input',tool_input:{questions:[]}};
  a.accept(event('PreToolUse',input));assert.equal(a.overlay({state:'busy'},[{sessionId:'one',turnId:'a',state:'busy'}]).state,'waiting');
  a.accept(event('PostToolUse',input));assert.equal(a.overlay({state:'busy'},[]).waiting,0);
  a.accept(event('PermissionRequest'));a.overlay({state:'busy'},[{sessionId:'one',turnId:'a',state:'busy'}]);
  assert.equal(a.overlay({state:'busy'},[{sessionId:'one',turnId:'b',state:'busy'}]).waiting,0);
});
test('installer preserves other hooks, is idempotent and removes only its own entries',()=>{
  const original={description:'other',hooks:{Stop:[{hooks:[{type:'command',command:'other'}]}]}};
  const defs=definition('/folder with space/project','/node path/node');
  const installed=merge(original,defs);assert.deepEqual(merge(installed,defs),installed);
  assert.deepEqual(merge(installed,defs,true),original);
});
