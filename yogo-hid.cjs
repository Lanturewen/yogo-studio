'use strict';
const native = require('node-hid');
const ALLOWED = new Set([0x10,0x11,0x12,0x14,0x16,0x1a,0x1b,0x2e,0x2f,0x3c,0x3d]);
function devices(){return native.devices().filter(d=>d.vendorId===0x373b&&[0x119b,0x11ff].includes(d.productId)&&d.usagePage===0xff60&&d.usage===0x61);}
class Yogo {
  constructor({wireless=false}={}){
    const candidates=devices().filter(d=>d.productId===(wireless?0x11ff:0x119b));
    if(candidates.length!==1)throw new Error(`Expected one ${wireless?'wireless':'wired'} YOGO control interface; found ${candidates.length}`);
    this.info=candidates[0];this.hid=new native.HID(this.info.path);this.size=wireless?32:64;this.payload=this.size-8;
    this.seq=0x9000+Math.floor(Math.random()*0x4000);this.stats={sent:0,acked:0,ignored:0};this.closed=false;
  }
  command(cmd,data=[],offset=0,length=data.length){
    if(!ALLOWED.has(cmd))throw new Error('Command outside lighting/read allowlist');
    if(data.length>this.payload||offset<0||offset>65535||length>this.payload)throw new Error('Invalid packet bounds');
    const p=Buffer.alloc(this.size);p[0]=0xaa;p[1]=cmd;p.writeUInt16LE(offset,2);p[4]=length;
    this.seq=(this.seq+1)&65535;p.writeUInt16LE(this.seq,5);Buffer.from(data).copy(p,8);
    this.hid.write([0,...p]);this.stats.sent++;
    const deadline=Date.now()+1500;
    while(Date.now()<deadline){
      let r=Buffer.from(this.hid.readTimeout(Math.max(1,deadline-Date.now())));
      if(r.length===this.size+1&&r[0]===0)r=r.subarray(1);
      if(r.length<8||r.readUInt16LE(5)!==this.seq){this.stats.ignored++;continue;}
      if(r[2]===255)throw new Error(`Device rejected command ${cmd.toString(16)}: ${r.toString('hex')}`);
      this.stats.acked++;return r;
    }
    throw new Error(`No acknowledgement for 0x${cmd.toString(16)}`);
  }
  start(){this.command(0x10);this.started=Date.now();}
  readData(cmd,total){
    const out=Buffer.alloc(total);
    for(let offset=0;offset<total;offset+=this.payload){const length=Math.min(this.payload,total-offset);this.command(cmd,[],offset,length).copy(out,offset,8,8+length);}
    return out;
  }
  deviceInfo(){
    this.start();const raw=this.readData(0x12,39);
    return {vid:raw.readUInt16LE(2),pid:raw.readUInt16LE(4),version:raw[7].toString(16).padStart(2,'0')+raw[6].toString(16).padStart(2,'0'),protocol:raw[8],matrixSize:raw[12],hasEncoder:raw[37]===1,raw};
  }
  keyMatrixBytes(){return this.payload*(this.size===32?16:7);}
  readKeyMatrix(){this.start();return this.readData(0x1a,this.keyMatrixBytes());}
  writeKeyMatrix(matrix){
    if(!Buffer.isBuffer(matrix)||matrix.length!==this.keyMatrixBytes())throw new Error(`Expected ${this.keyMatrixBytes()} key-matrix bytes`);
    this.start();for(let offset=0;offset<matrix.length;offset+=this.payload)this.command(0x1b,matrix.subarray(offset,offset+this.payload),offset,this.payload);
  }
  frame(rgb){
    if(rgb.length!==36||rgb.some(p=>p.length!==3||p.some(n=>!Number.isInteger(n)||n<0||n>255)))throw new Error('Expected 36 RGB pixels');
    if(!this.started||Date.now()-this.started>3000)this.start();
    const data=Buffer.alloc(72);rgb.forEach(([r,g,b],i)=>data.writeUInt16LE(((r>>3)<<11)|((g>>2)<<5)|(b>>3),i*2));
    for(let offset=0;offset<72;offset+=this.payload){const part=data.subarray(offset,offset+this.payload);this.command(0x3c,part,offset,part.length);}
  }
  backlight(rgb){
    // ATK HUB POn.startSyncMusic: LEDs 0..83 plus the unused 255 sentinel,
    // RGB565 little endian, byte offsets, 24-byte wireless / 56-byte wired chunks.
    if(rgb.length!==84||rgb.some(p=>p.length!==3||p.some(n=>!Number.isInteger(n)||n<0||n>255)))throw new Error('Expected 84 RGB backlight pixels');
    if(!this.started||Date.now()-this.started>3000)this.start();
    const data=Buffer.alloc(170);rgb.forEach(([r,g,b],i)=>data.writeUInt16LE(((r>>3)<<11)|((g>>2)<<5)|(b>>3),i*2));
    this.backlightActive=true;
    for(let offset=0;offset<data.length;offset+=this.payload){const part=data.subarray(offset,offset+this.payload);this.command(0x2e,part,offset,part.length);}
  }
  endBacklight(){if(this.backlightActive){this.command(0x2f);this.backlightActive=false;}}
  stop(){
    if(this.closed)return;
    let error;
    try{for(const action of [()=>this.endBacklight(),()=>this.command(0x3d),()=>this.command(0x11)])try{action();}catch(e){error??=e;}}
    finally{this.hid.close();this.closed=true;}
    if(error)throw error;
  }
}
module.exports={Yogo,devices};
if(require.main===module){
  console.log(JSON.stringify(devices(),null,2));
  if(process.argv.includes('--probe')){
    const y=new Yogo({wireless:process.argv.includes('--wireless')});
    try{y.start();const info=[];for(let o=0;o<39;o+=y.payload){const n=Math.min(y.payload,39-o);info.push(...y.command(0x12,[],o,n).subarray(8,8+n));}console.log(JSON.stringify({deviceInfo:info,stats:y.stats}));}
    finally{try{y.command(0x11);}finally{y.hid.close();}}
  }
}
