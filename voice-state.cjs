'use strict';
const defaults=[{id:'wetype',name:'微信输入法',type:'audio-session',enabled:true,
 processNames:['wetype_server.exe','wetype_renderer.exe','wetype_service.exe','wetype_update.exe'],pathIncludes:'\\tencent\\wetype\\'}];
function providers(value=defaults){
 if(!Array.isArray(value)||value.length>16)throw new Error('voiceProviders must be an array of at most 16 providers');
 const ids=new Set();
 return value.map(p=>{
  if(!p||!/^[-a-z0-9]{1,40}$/.test(p.id)||ids.has(p.id))throw new Error('Invalid or duplicate voice provider id');ids.add(p.id);
  if(typeof p.name!=='string'||p.name.length<1||p.name.length>80||!['audio-session','event'].includes(p.type)||typeof p.enabled!=='boolean')throw new Error('Invalid voice provider');
  if(p.type==='audio-session'&&(!Array.isArray(p.processNames)||!p.processNames.length||p.processNames.some(n=>typeof n!=='string'||!/^[-a-z0-9_.]+$/i.test(n))))throw new Error('Audio provider needs exact executable names');
  if(p.pathIncludes!==undefined&&(typeof p.pathIncludes!=='string'||!p.pathIncludes.trim()))throw new Error('Invalid voice provider pathIncludes');
  return {...p,processNames:(p.processNames||[]).map(n=>n.toLowerCase()),pathIncludes:p.pathIncludes?.replaceAll('/','\\').toLowerCase()};
 });
}
const level=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1?v:null;
class VoiceState{
 constructor(config=defaults){this.providers=providers(config);this.records=new Map();this.error='';this.devices=null;}
 observe(observation,now=Date.now()){
  if(observation.protocol!==1||!Array.isArray(observation.sessions))throw new Error('Invalid audio observer response');
  if(observation.error){this.fail(observation.error);return;}
  this.error=observation.meterError?String(observation.meterError).slice(0,200):observation.errors?.length?'部分麦克风设备无法检查':'';this.devices=observation.devices;
  for(const p of this.providers.filter(p=>p.enabled&&p.type==='audio-session')){
   const found=observation.sessions.filter(s=>s.active===true&&p.processNames.includes(s.processName?.toLowerCase())&&
    (!p.pathIncludes||s.executablePath?.replaceAll('/','\\').toLowerCase().includes(p.pathIncludes)));
   if(found.length){const metered=found.filter(s=>level(s.level)!==null).sort((a,b)=>b.level-a.level)[0];
    let measured=metered?level(metered.level):null;
    const old=this.records.get(p.id);
    if(measured!==null&&old?.active&&old.level!==null&&now-old.at<500){
     const blend=measured>old.level ? .65 : .3;measured=old.level+(measured-old.level)*blend;
    }
    this.records.set(p.id,{at:now,active:true,level:measured,levelKind:metered?.levelKind||'unavailable'});
   }else{
    const old=this.records.get(p.id);
    // Bridge brief session transitions, but never keep recording alive without fresh evidence.
    if(!old||now-old.at>=350)this.records.set(p.id,{at:now,active:false,level:null,levelKind:'unavailable'});
   }
  }
 }
 accept(event,now=Date.now()){
  const p=this.providers.find(p=>p.id===event.providerId&&p.enabled&&p.type==='event');
  if(!p)throw new Error('Unknown or disabled event voice provider');
  if(typeof event.active!=='boolean'||event.level!==undefined&&event.level!==null&&level(event.level)===null)throw new Error('Invalid voice event');
  this.records.set(p.id,{at:now,active:event.active,level:event.active?level(event.level):null,levelKind:event.active&&level(event.level)!==null?'provider':'unavailable'});
 }
 fail(message){this.error=String(message).slice(0,200);for(const p of this.providers.filter(p=>p.type==='audio-session'))this.records.delete(p.id);}
 snapshot(now=Date.now()){
  const active=this.providers.filter(p=>{const r=this.records.get(p.id);return p.enabled&&r?.active&&now-r.at<2000;});
  const winner=active.map(p=>({p,r:this.records.get(p.id)})).sort((a,b)=>(b.r.level??-1)-(a.r.level??-1))[0];
  return {active:!!winner,providerId:winner?.p.id||null,providerName:winner?.p.name||null,
   level:winner?.r.level??null,levelKind:winner?.r.levelKind||'unavailable',error:this.error,devices:this.devices};
 }
}
function platformDefaults(platform=process.platform){return platform==='darwin'?[{...defaults[0],processNames:['WeType'],pathIncludes:'/WeType.app/Contents/'}]:defaults;}
module.exports={VoiceState,providers,defaults,platformDefaults};
