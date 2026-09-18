'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {CodexDial}=require('../codex-dial.cjs');
test('dial decodes Chinese action events split across UTF-8 stream chunks',async()=>{
 const vm=require('vm'),{PassThrough}=require('stream'),{EventEmitter}=require('events');
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
 const module={exports:{}},root=path.resolve(__dirname,'..');
 const context={module,__dirname:root,process,console,setTimeout,clearTimeout,require:name=>name==='child_process'?{spawn:()=>child}:name==='fs'?{...fs,existsSync:()=>true}:require(name)};
 vm.runInNewContext(fs.readFileSync(path.join(root,'codex-dial.cjs'),'utf8'),context);
 const dial=new module.exports.CodexDial('/unused');await dial.start();
 for(const detail of ['降低','提高']){
  const bytes=Buffer.from(JSON.stringify({protocol:1,type:'adjust',detail})+'\n');
  for(const byte of bytes)child.stdout.write(Buffer.from([byte]));
  assert.equal(dial.snapshot().lastAction,detail);
 }
 dial.close();
});
test('dial exposes the virtual mapping without taking over Enter, F5 or Backspace',()=>{
 const dial=new CodexDial('/tmp');const status=dial.snapshot();
 assert.equal(status.keys,'- / = → Codex 原生命令');assert.equal(status.hardwareKeys,'- / =');
 assert.match(status.warning,/Codex/);dial.close();
});
test('platform helpers focus the composer and emit private native shortcuts without mouse UI',()=>{
 const mac=fs.readFileSync(path.join(__dirname,'../scripts/codex-dial-macos.m'),'utf8');
 const win=fs.readFileSync(path.join(__dirname,'../scripts/codex-dial-windows.cs'),'utf8');
 for(const source of [mac,win])assert.match(source,/ChatGPT|com\.openai\.codex/);
 assert.match(mac,/decreaseKey=27/);assert.match(mac,/increaseKey=24/);assert.match(mac,/focusComposer/);assert.match(mac,/kCGEventFlagMaskControl\|kCGEventFlagMaskAlternate\|kCGEventFlagMaskShift/);
 assert.match(mac,/focused\?15:0/);
 assert.doesNotMatch(mac,/MouseEvent|usleep/);
 assert.match(win,/VK_OEM_MINUS/);assert.match(win,/VK_OEM_PLUS/);assert.match(win,/FocusComposer/);assert.match(win,/Shortcut/);assert.match(win,/Thread\.Sleep\(15\)/);
 for(const source of [mac,win])for(const untouched of ['F5','Backspace','Enter'])assert.doesNotMatch(source,new RegExp(untouched));
});
test('dial retains actionable permission errors after the helper exits',async()=>{
 const vm=require('vm'),{PassThrough}=require('stream'),{EventEmitter}=require('events');
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
 const module={exports:{}},root=path.resolve(__dirname,'..');
 const context={module,__dirname:root,process,console,setTimeout,clearTimeout,require:name=>name==='child_process'?{spawn:()=>child}:name==='fs'?{...fs,existsSync:()=>true}:require(name)};
 vm.runInNewContext(fs.readFileSync(path.join(root,'codex-dial.cjs'),'utf8'),context);
 const dial=new module.exports.CodexDial('/unused');await dial.start();
 const detail='需要辅助功能权限来聚焦 Codex 输入框';
 child.stdout.write(JSON.stringify({protocol:1,type:'error',detail})+'\n');child.emit('exit',3);
 assert.equal(dial.snapshot().error,detail);assert.equal(dial.snapshot().ready,false);dial.close();
});
