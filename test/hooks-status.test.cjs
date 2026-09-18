'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {definition}=require('../scripts/install-hooks.cjs');
const {classify}=require('../scripts/hooks-status.cjs');
function fixture(){return {data:[{hooks:Object.entries(definition()).map(([event,[group]])=>({eventName:event[0].toLowerCase()+event.slice(1),handlerType:'command',command:process.platform==='win32'?group.hooks[0].commandWindows:group.hooks[0].command,statusMessage:group.hooks[0].statusMessage,matcher:group.matcher||null,timeoutSec:3,async:false,source:'user',enabled:true,trustStatus:'trusted'})),errors:[],warnings:[]}]};}
test('recognizes all six exact definitions and their actual trust/enabled status',()=>{
  const r=fixture();assert.equal(classify(r).ready,true);
  r.data[0].hooks[0].trustStatus='new';assert.equal(classify(r).ready,false);
  r.data[0].hooks[0].trustStatus='trusted';r.data[0].hooks[0].enabled=false;assert.equal(classify(r).ready,false);
});
test('same name does not identify unrelated commands; warnings and missing entries cannot pass',()=>{
  const r=fixture();r.data[0].hooks.push({...r.data[0].hooks[0],command:'unrelated command'});
  assert.equal(classify(r).other.length,1);assert.equal(classify(r).own.length,6);
  r.data[0].warnings.push('partial config');assert.equal(classify(r).ready,false);
  r.data[0].warnings=[];r.data[0].hooks.shift();assert.equal(classify(r).ready,false);
});
