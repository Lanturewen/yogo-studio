'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const {KeyboardPreset,PRESET,presetDiff}=require('../keyboard-preset.cjs');

class Keyboard {
  constructor(matrix=Buffer.alloc(384)){this.matrix=Buffer.from(matrix);this.info={productId:0x11ff};this.writes=0;}
  deviceInfo(){return {vid:0x373b,pid:0x119b,version:'0125',protocol:3,matrixSize:128,hasEncoder:true};}
  readKeyMatrix(){return Buffer.from(this.matrix);}
  writeKeyMatrix(matrix){this.matrix=Buffer.from(matrix);this.writes++;}
}
function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'yogo-preset-'));}
function desired(matrix){const next=Buffer.from(matrix);for(const item of PRESET)Buffer.from(item.value).copy(next,item.index*3);return next;}

test('preset only patches the five YOGO controls and keeps a restorable full backup',()=>{
 const local=temp(),before=Buffer.alloc(384);before[61*3]=0xab;const keyboard=new Keyboard(before),preset=new KeyboardPreset(local);
 try{
  assert.equal(presetDiff(before).length,5);const installed=preset.install(keyboard);
  assert.equal(installed.installed,true);assert.equal(keyboard.writes,1);assert.deepEqual(keyboard.matrix,desired(before));assert.equal(keyboard.matrix[61*3],0xab);
  assert.equal(fs.readdirSync(path.join(local,'keymap-backups')).length,1);
  keyboard.matrix[61*3]=0xcd;const restored=preset.restore(keyboard);
  assert.equal(restored.installed,false);assert.deepEqual(keyboard.matrix,before);
 }finally{fs.rmSync(local,{recursive:true,force:true});}
});

test('an already installed preset is read-only',()=>{
 const local=temp(),keyboard=new Keyboard(desired(Buffer.alloc(384))),preset=new KeyboardPreset(local);
 try{assert.equal(preset.check(keyboard).installed,true);assert.equal(preset.install(keyboard).installed,true);assert.equal(keyboard.writes,0);assert.equal(preset.snapshot().canRestore,false);}
 finally{fs.rmSync(local,{recursive:true,force:true});}
});

test('device and protocol mismatch cannot write',()=>{
 const local=temp(),keyboard=new Keyboard(),preset=new KeyboardPreset(local);keyboard.deviceInfo=()=>({vid:0x373b,pid:0x119c,protocol:3,matrixSize:128,hasEncoder:true});
 try{assert.throws(()=>preset.install(keyboard),/仅支持/);assert.equal(keyboard.writes,0);}
 finally{fs.rmSync(local,{recursive:true,force:true});}
});

test('failed verification rolls the original matrix back',()=>{
 const local=temp(),before=Buffer.alloc(384);before[61*3]=0xab;
 class CorruptOnce extends Keyboard {writeKeyMatrix(matrix){this.writes++;this.matrix=this.writes===1?Buffer.alloc(matrix.length,0xff):Buffer.from(matrix);}}
 const keyboard=new CorruptOnce(before),preset=new KeyboardPreset(local);
 try{assert.throws(()=>preset.install(keyboard),/写后校验不一致.*自动恢复/);assert.deepEqual(keyboard.matrix,before);assert.equal(keyboard.writes,2);}
 finally{fs.rmSync(local,{recursive:true,force:true});}
});

test('switching platform changes only the voice key mapping and backs up each previous mapping',(t)=>{
 t.mock.method(Date.prototype,'toISOString',()=> '2026-09-18T00:00:00.000Z');
 const local=temp(),before=Buffer.from(Array.from({length:384},(_,i)=>i%256)),keyboard=new Keyboard(before);
 const mac=new KeyboardPreset(local,'darwin'),win=new KeyboardPreset(local,'win32');
 try{
  mac.install(keyboard);const macMatrix=Buffer.from(keyboard.matrix);
  assert.deepEqual([...macMatrix.subarray(138,141)],[0x10,0x40,0x00]);
  assert.equal(win.check(keyboard).changed.length,1);
  const installed=win.install(keyboard);
  const expected=Buffer.from(macMatrix);expected[139]=1;expected[140]=0x3e;
  assert.deepEqual(keyboard.matrix,expected);
  assert.equal(win.backups().length,2,'same-millisecond backups must both survive');
  assert.equal(win.backups()[0],path.basename(installed.backup),'default restore selects newest backup');
  const backup=JSON.parse(fs.readFileSync(installed.backup,'utf8'));
  assert.deepEqual(Buffer.from(backup.matrix,'base64'),macMatrix);
  assert.equal(win.check(keyboard).installed,true);assert.equal(mac.check(keyboard).installed,false);
  win.restore(keyboard,path.basename(installed.backup));assert.deepEqual(keyboard.matrix,macMatrix);
 }finally{fs.rmSync(local,{recursive:true,force:true});}
});
