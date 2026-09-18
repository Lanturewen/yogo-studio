'use strict';
// Local capture-state adapter. No audio, model keys, or transcript enters this client.
const fs=require('fs'),path=require('path'),os=require('os');
async function connect({dataDir,fetchImpl=fetch}={}){
 const roots=dataDir?[dataDir]:[process.env.YOGO_DATA_DIR,process.platform==='win32'?path.join(process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming'),'YOGO Studio'):path.join(os.homedir(),'Library','Application Support','YOGO Studio'),__dirname].filter(Boolean);
 let lastError;
 for(const root of roots){try{
  const runtime=JSON.parse(fs.readFileSync(path.join(root,'.local','runtime.json'),'utf8'));
  if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(runtime.url))throw Error('Only local IPv4 loopback URLs are allowed');
  const request=(route,options={})=>fetchImpl(runtime.url+route,{...options,redirect:'error',signal:AbortSignal.timeout(4000)});
  const response=await request('/status');if(!response.ok)throw Error('Status unavailable');const status=await response.json();
  if(status.appId!=='yogo75-codex-status')throw Error('Not a YOGO Studio instance');
  const page=await request('/');if(!page.ok)throw Error('Player unavailable');const token=(await page.text()).match(/const token='([a-f0-9]+)'/)?.[1];if(!token)throw Error('Missing local player token');
  return {async capture(providerId,active,level=null){
   if(!/^[-a-z0-9]{1,40}$/.test(providerId)||typeof active!=='boolean'||level!==null&&(typeof level!=='number'||!Number.isFinite(level)||level<0||level>1))throw Error('Invalid capture event');
   const result=await request('/voice',{method:'POST',headers:{'X-Player-Token':token,'Content-Type':'application/json'},body:JSON.stringify({providerId,active,level:active?level:null})});const body=await result.json();if(!result.ok)throw Error(body.error||'Voice event rejected');return body.voice;
  }};
 }catch(error){lastError=error;}}
 throw Error('Cannot connect to local YOGO Studio: '+(lastError?.message||'runtime file not found'));
}
module.exports={connect};
