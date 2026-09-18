'use strict';
const fs=require('fs'),path=require('path');
const builtin=require('./builtin-animations.cjs');
const registry=new Map(['busy','done','error','waiting'].map((id,i)=>[id,{id,name:['蓝色追光','绿色对勾','红色叉号','琥珀色问号'][i],intervalMs:110,frame:ms=>builtin.frame(id,ms)}]));
registry.set('voice',{id:'voice',name:'语音波形（手动试播）',intervalMs:110,frame:(ms,options={demo:true})=>require('./voice-animation.cjs').frame(ms,options)});
const errors=[];
function validate(data){
 if(!data||!/^custom-[a-z0-9-]{1,48}$/.test(data.id))throw new Error('id must begin custom-');
 if(typeof data.name!=='string'||data.name.length<1||data.name.length>80)throw new Error('Invalid name');
 if(!Number.isInteger(data.frameMs)||data.frameMs<100||data.frameMs>5000)throw new Error('frameMs must be 100..5000');
 if(!Array.isArray(data.frames)||data.frames.length<1||data.frames.length>600)throw new Error('Expected 1..600 frames');
 for(const pixels of data.frames)if(!Array.isArray(pixels)||pixels.length!==36||pixels.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isInteger(v)||v<0||v>255)))throw new Error('Every frame needs 36 RGB triples, 0..255');
 return data;
}
function register(data){
 validate(data);if(registry.has(data.id))throw new Error('Duplicate animation id');
 registry.set(data.id,{id:data.id,name:data.name,intervalMs:data.frameMs,frame:ms=>data.frames[data.loop===false?Math.min(data.frames.length-1,Math.floor(ms/data.frameMs)):Math.floor(ms/data.frameMs)%data.frames.length]});
}
for(const dir of [path.join(__dirname,'animations'),path.join(process.env.YOGO_DATA_DIR||__dirname,'.local','animations')]){
if(!fs.existsSync(dir))continue;
for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){try{
 const full=path.join(dir,file);if(fs.statSync(full).size>2*1024*1024)throw new Error('File too large');
 register(JSON.parse(fs.readFileSync(full,'utf8')));
}catch(e){errors.push(`${file}: ${e.message}`);}}
}
function get(id){const a=registry.get(id);if(!a)throw new Error('Unknown animation: '+id);return a;}
module.exports={frame:(id,ms,options)=>get(id).frame(ms,options),get,validate,register,list:()=>[...registry.values()].map(({id,name,intervalMs})=>({id,name,intervalMs})),errors};
