'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const root=path.resolve(__dirname,'..');
function crc(buffer){let c=0xffffffff;for(const byte of buffer){c^=byte;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([head,t,data,tail]);}
function generate(size){
 const pixels=Buffer.alloc(size*(size*4+1));
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const px=x*256/size,py=y*256/size,i=y*(size*4+1)+1+x*4,dx=Math.max(38-px,0,px-217),dy=Math.max(38-py,0,py-217),inside=dx*dx+dy*dy<38*38;let rgb=[36,44,37],alpha=inside?255:0;
  const col=Math.floor((px-65)/46),row=Math.floor((py-65)/46),lx=(px-65)%46,ly=(py-65)%46;
  if(col>=0&&col<3&&row>=0&&row<3&&lx>=0&&lx<31&&ly>=0&&ly<31)rgb=col===0?[232,156,96]:[218,226,196];
  if(col===2&&row===2&&lx>=0&&lx<31&&ly>=0&&ly<31)rgb=[92,110,75];
  pixels[i]=rgb[0];pixels[i+1]=rgb[1];pixels[i+2]=rgb[2];pixels[i+3]=alpha;
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
fs.writeFileSync(path.join(root,'desktop','icon.png'),generate(512));
const png=generate(256),ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);fs.writeFileSync(path.join(root,'desktop','icon.ico'),Buffer.concat([ico,png]));
