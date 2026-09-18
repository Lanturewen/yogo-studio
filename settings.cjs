'use strict';
const fs=require('fs'),path=require('path'),os=require('os');
const root=process.env.YOGO_DATA_DIR||__dirname,local=path.join(root,'.local');fs.mkdirSync(local,{recursive:true});
const {providers,platformDefaults}=require('./voice-state.cjs');
function read(){
 const file=path.join(root,'config.json');
 const c=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 const config={scope:'global',port:3395,backlightSync:true,voiceEnabled:true,codexDialEnabled:true,resultDisplayMs:15000,theme:'light',reduceMotion:false,onboardingComplete:false,stateAnimations:{busy:'busy',done:'done',error:'error'},...c};
 config.stateAnimations={busy:'busy',done:'done',error:'error',waiting:'waiting',...c.stateAnimations};
 config.sessionsRoot=c.sessionsRoot||path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'sessions');
 if(!['global','current'].includes(config.scope))throw new Error('Invalid scope');
 if(typeof config.backlightSync!=='boolean')throw new Error('backlightSync must be true or false');
 if(typeof config.voiceEnabled!=='boolean')throw new Error('voiceEnabled must be true or false');
 if(typeof config.codexDialEnabled!=='boolean')throw new Error('codexDialEnabled must be true or false');
 config.voiceProviders=providers(c.voiceProviders??platformDefaults());
 if(!Number.isInteger(config.port)||config.port<0||config.port>65535)throw new Error('Invalid port');
 if(!Number.isInteger(config.resultDisplayMs)||config.resultDisplayMs<1000||config.resultDisplayMs>300000)throw new Error('resultDisplayMs must be 1000..300000');
 return config;
}
function savePatch(patch){const f=path.join(root,'config.json');const old=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{};const temp=f+'.tmp';fs.writeFileSync(temp,JSON.stringify({...old,...patch},null,2)+'\n');fs.renameSync(temp,f);}
function validatePatch(patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('设置格式不正确');
 const result={};
 for(const [key,value] of Object.entries(patch)){
  if(['backlightSync','voiceEnabled','codexDialEnabled','reduceMotion','onboardingComplete'].includes(key)){if(typeof value!=='boolean')throw new Error('开关值不正确');}
  else if(key==='theme'){if(!['light','dark','system'].includes(value))throw new Error('不支持的外观');}
  else if(key==='resultDisplayMs'){if(!Number.isInteger(value)||value<1000||value>300000)throw new Error('提示时长需在 1–300 秒之间');}
  else if(key==='stateAnimations'){
   if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('灯效映射格式不正确');
   for(const [state,id] of Object.entries(value)){if(!['busy','done','error','waiting'].includes(state))throw new Error('不支持的状态');require('./animations.cjs').get(id);}
  }else throw new Error('不支持的设置：'+key);
  result[key]=value;
 }
 return result;
}
module.exports={read,savePatch,validatePatch,local,root};
