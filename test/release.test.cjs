'use strict';
const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const timers=new Map();let seq=0,closed=0;
class Keyboard{constructor(){this.size=32;}frame(){}backlight(){}endBacklight(){}stop(){closed++;}}
const context={__dirname:path.resolve(__dirname,'..'),assert,Buffer,console,setTimeout:fn=>{timers.set(++seq,fn);return seq;},clearTimeout:id=>timers.delete(id),fire:id=>timers.get(id)(),require:name=>name==='./yogo-hid.cjs'?{Yogo:Keyboard,devices:()=>[]}:name.startsWith('.')?require(path.join(__dirname,'..',name)):require(name)};
const source=fs.readFileSync(path.join(__dirname,'../player.cjs'),'utf8').split('const server=http.createServer')[0];
vm.runInNewContext(source+`
follow={state:'done'};applyFollow();assert.equal(state,'done');
fire(releaseTimer);assert.equal(state,'stopped');assert.equal(keyboard,null);
follow={state:'done',tracked:200};applyFollow();assert.equal(keyboard,null);
follow={state:'busy'};applyFollow();assert.equal(state,'busy');assert.ok(keyboard);assert.equal(releaseTimer,null);
follow={state:'error'};applyFollow();assert.equal(state,'error');
const oldTimer=releaseTimer;follow={state:'busy'};applyFollow();assert.equal(state,'busy');
follow={state:'waiting'};applyFollow();assert.equal(state,'waiting');assert.equal(releaseTimer,null);
mode='manual';start('waiting');assert.ok(releaseTimer);
mode='auto';applyFollow();assert.equal(state,'waiting');assert.equal(releaseTimer,null);
follow={state:'busy'};applyFollow();assert.equal(state,'busy');
`,context);
assert.equal(closed,1);console.log('PASS: auto release, duplicate result suppressed, new work reconnects, busy cancels result timer');
