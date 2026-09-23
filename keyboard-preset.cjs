'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');

function presetForPlatform(platform=process.platform){return [
  {index:46,label:'下方自定义键 1：微信语音输入 '+(platform==='win32'?'Ctrl+F5':'右 Option'),value:platform==='win32'?[0x10,0x01,0x3e]:[0x10,0x40,0x00]},
  {index:47,label:'下方自定义键 2：Backspace',value:[0x10,0x00,0x2a]},
  {index:112,label:'波轮左转：-',value:[0x10,0x00,0x2d]},
  {index:113,label:'波轮右转：=',value:[0x10,0x00,0x2e]},
  {index:114,label:'波轮按下：Enter',value:[0x10,0x00,0x28]}
];}
const PRESET=presetForPlatform();
const MODEL_PID=0x119b;
function digest(buffer){return crypto.createHash('sha256').update(buffer).digest('hex');}
function same(a,b){return Buffer.compare(a,b)===0;}
function presetDiff(matrix,preset=PRESET){return preset.filter(item=>!same(matrix.subarray(item.index*3,item.index*3+3),Buffer.from(item.value))).map(item=>item.label);}
function validateDevice(keyboard){
  const device=keyboard.deviceInfo();
  if(device.vid!==0x373b||device.pid!==MODEL_PID||device.protocol!==3||device.matrixSize!==128||!device.hasEncoder)throw new Error('仅支持协议匹配的 ATK YOGO 75 PRO；未写入键盘');
  return device;
}
class KeyboardPreset {
  constructor(local,platform=process.platform){
    this.preset=presetForPlatform(platform);
    this.dir=path.join(local,'keymap-backups');
    this.info={state:'unchecked',installed:null,message:'尚未检查板载预设',changed:[],canRestore:this.backups().length>0,backup:null};
  }
  backups(){try{return fs.readdirSync(this.dir).filter(name=>/^yogo75pro-.*\.json$/.test(name)).sort().reverse();}catch{return [];}}
  snapshot(){return {...this.info,keys:this.preset.map(item=>item.label)};}
  set(next){this.info={...this.info,...next,canRestore:this.backups().length>0};return this.snapshot();}
  fail(error){return this.set({state:'error',message:error.message});}
  read(keyboard){const device=validateDevice(keyboard),matrix=keyboard.readKeyMatrix();return {device,matrix,changed:presetDiff(matrix,this.preset)};}
  check(keyboard){const data=this.read(keyboard);return this.set({state:data.changed.length?'missing':'installed',installed:data.changed.length===0,message:data.changed.length?`还需写入 ${data.changed.length} 项板载映射`:'Codex 五项板载映射已就绪',changed:data.changed});}
  saveBackup(device,matrix){
    fs.mkdirSync(this.dir,{recursive:true});
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const backup={format:1,createdAt:new Date().toISOString(),device:{vid:device.vid,pid:device.pid,version:device.version,protocol:device.protocol,matrixSize:device.matrixSize,transportPid:device.transportPid},sha256:digest(matrix),matrix:matrix.toString('base64')};
    for(let sequence=0;sequence<1000000;sequence++){
      const file=path.join(this.dir,`yogo75pro-${stamp}~${String(sequence).padStart(6,'0')}.json`);
      try{fs.writeFileSync(file,JSON.stringify(backup,null,2)+'\n',{flag:'wx'});return file;}catch(error){if(error.code!=='EEXIST')throw error;}
    }
    throw new Error('同一时间的备份数量超限，未写入键盘');
  }
  install(keyboard){
    const {device,matrix,changed}=this.read(keyboard);device.transportPid=keyboard.info.productId;
    if(!changed.length)return this.set({state:'installed',installed:true,message:'Codex 五项板载映射原本已就绪，无需重复写入',changed:[]});
    const backup=this.saveBackup(device,matrix),next=Buffer.from(matrix);for(const item of this.preset)Buffer.from(item.value).copy(next,item.index*3);
    try{
      keyboard.writeKeyMatrix(next);const actual=keyboard.readKeyMatrix();if(!same(actual,next))throw new Error('写后校验不一致');
      return this.set({state:'installed',installed:true,message:`已写入 ${changed.length} 项板载映射，并完成写后校验`,changed:[],backup});
    }catch(error){
      let rollback='';try{keyboard.writeKeyMatrix(matrix);rollback=same(keyboard.readKeyMatrix(),matrix)?'；原映射已自动恢复':'；自动恢复校验失败';}catch(e){rollback=`；自动恢复失败：${e.message}`;}
      throw new Error(`${error.message}${rollback}；备份保存在 ${backup}`);
    }
  }
  restore(keyboard,backupId){
    const latest=backupId||this.backups()[0];if(!latest)throw new Error('没有可恢复的板载映射备份');
    if(!this.backups().includes(latest))throw new Error('所选备份不存在');
    const file=path.join(this.dir,latest),backup=JSON.parse(fs.readFileSync(file,'utf8')),current=this.read(keyboard),matrix=Buffer.from(backup.matrix||'','base64');
    if(backup.format!==1||backup.device?.vid!==current.device.vid||backup.device?.pid!==current.device.pid||backup.device?.protocol!==current.device.protocol||matrix.length!==current.matrix.length||digest(matrix)!==backup.sha256)throw new Error('备份与当前键盘或协议不匹配，未执行恢复');
    try{
      keyboard.writeKeyMatrix(matrix);const actual=keyboard.readKeyMatrix();if(!same(actual,matrix))throw new Error('恢复后的板载映射校验失败');
      const changed=presetDiff(actual,this.preset);return this.set({state:changed.length?'restored':'installed',installed:changed.length===0,message:`已恢复备份 ${latest}`,changed,backup:file});
    }catch(error){
      let rollback='';try{keyboard.writeKeyMatrix(current.matrix);rollback=same(keyboard.readKeyMatrix(),current.matrix)?'；恢复前的映射已自动写回':'；自动写回校验失败';}catch(e){rollback=`；自动写回失败：${e.message}`;}
      throw new Error(`${error.message}${rollback}`);
    }
  }
}
module.exports={KeyboardPreset,PRESET,presetDiff,presetForPlatform};
