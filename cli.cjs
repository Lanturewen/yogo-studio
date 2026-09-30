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
 if(!['play','auto','stop','quit','status','report'].includes(cmd))throw new Error('Usage: cli.cjs list | play <id> | auto | stop | quit | status | report | doctor');
 if(cmd==='report'){
  const args=process.argv.slice(3);
  const params={};
  for(let i=0;i<args.length;i++){
    if(args[i].startsWith('--')){
      const k=args[i].slice(2),v=args[i+1];
      if(v&&!v.startsWith('--')){params[k]=v;i++;}else{params[k]=true;}
    }
  }
  const {client,session,state,ttl,turn}=params;
  if(!client||!session||!state)throw new Error('Usage: cli.cjs report --client <name> --session <id> --state <waiting|busy|done|error|stopped> [--ttl <ms>]');
  const info=await ensure();if(!info)throw new Error('播放器未运行');
  const html=await(await fetch(info.url)).text(),token=html.match(/const token='([a-f0-9]+)'/)?.[1];if(!token)throw new Error('Invalid player response');
  const body={client,sessionId:session,state,ttlMs:ttl?Number(ttl):undefined,turnId:turn};
  const response=await fetch(info.url+'/agent-status',{method:'POST',headers:{'X-Player-Token':token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const s=await response.json();if(!response.ok||s.error)throw new Error(s.error||'Request failed');console.log(JSON.stringify(s));
  return;
 }
 const info=['stop','quit','status'].includes(cmd)?await running():await ensure();if(!info)throw new Error('播放器未运行');
 if(cmd==='status'){console.log(await(await fetch(info.url+'/status')).text());return;}
 const html=await(await fetch(info.url)).text(),token=html.match(/const token='([a-f0-9]+)'/)?.[1];if(!token)throw new Error('Invalid player response');
 const route={play:'/state',auto:'/auto',stop:'/stop',quit:'/shutdown'}[cmd];
 const body=cmd==='play'?{state:arg}:{};
 const response=await fetch(info.url+route,{method:'POST',headers:{'X-Player-Token':token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const s=await response.json();if(!response.ok||s.error)throw new Error(s.error||'Request failed');console.log(JSON.stringify(s));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
