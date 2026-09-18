'use strict';
const fs=require('fs'),path=require('path');
const {normalize}=require('./attention.cjs');
async function send(input){
  const event=normalize(input);if(!event)return;
  const info=JSON.parse(fs.readFileSync(path.join(process.env.YOGO_DATA_DIR||__dirname,'.local/runtime.json'),'utf8'));
  if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(info.url))return;
  const signal=AbortSignal.timeout(1500);
  const status=await(await fetch(info.url+'/status',{signal})).json();
  if(status.appId!=='yogo75-codex-status'||status.instance!==__dirname)return;
  const html=await(await fetch(info.url,{signal})).text();
  const token=html.match(/const token='([a-f0-9]+)'/)?.[1];if(!token)return;
  await fetch(info.url+'/attention',{method:'POST',signal,headers:{'X-Player-Token':token,'Content-Type':'application/json'},body:JSON.stringify(event)});
}
if(require.main===module){
  // Never approve, deny, block, start the player, or emit model-visible output.
  const deadline=setTimeout(()=>process.exit(0),2200);let data='';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',c=>{data+=c;if(data.length>1024*1024)process.exit(0);});
  process.stdin.on('end',()=>{Promise.resolve().then(()=>send(JSON.parse(data))).catch(()=>{}).finally(()=>clearTimeout(deadline));});
  process.stdin.on('error',()=>process.exit(0));
}
module.exports={send};
