#!/usr/bin/env node
'use strict';
const {ensure,running}=require('./launcher.cjs');
(async()=>{
 const [cmd,arg]=process.argv.slice(2);
 if(cmd==='doctor'){
  const fs=require('fs'),settings=require('./settings.cjs').read();
  let devices=[],deviceError=null;try{devices=require('./yogo-hid.cjs').devices().map(d=>({product:d.product,productId:d.productId}));}catch(e){deviceError=e.message;}
  console.log(JSON.stringify({platform:process.platform,arch:process.arch,node:process.version,hid:require('node-hid/package.json').version,devices,deviceError,sessionsAvailable:fs.existsSync(settings.sessionsRoot),animations:require('./animations.cjs').list(),animationErrors:require('./animations.cjs').errors},null,2));return;
 }
 if(cmd==='list'){console.log(JSON.stringify(require('./animations.cjs').list(),null,2));return;}
 if(!['play','auto','stop','quit','status'].includes(cmd))throw new Error('Usage: cli.cjs list | play <id> | auto | stop | quit | status | doctor');
 const info=['stop','quit','status'].includes(cmd)?await running():await ensure();if(!info)throw new Error('播放器未运行');
 if(cmd==='status'){console.log(await(await fetch(info.url+'/status')).text());return;}
 const html=await(await fetch(info.url)).text(),token=html.match(/const token='([a-f0-9]+)'/)?.[1];if(!token)throw new Error('Invalid player response');
 const route={play:'/state',auto:'/auto',stop:'/stop',quit:'/shutdown'}[cmd];
 const body=cmd==='play'?{state:arg}:{};
 const response=await fetch(info.url+route,{method:'POST',headers:{'X-Player-Token':token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const s=await response.json();if(!response.ok||s.error)throw new Error(s.error||'Request failed');console.log(JSON.stringify(s));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
