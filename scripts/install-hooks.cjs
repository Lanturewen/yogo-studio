'use strict';
const fs=require('fs'),path=require('path'),os=require('os');
const marker='Yogo 75 codex status display';
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const psQuote=s=>"'"+s.replaceAll("'","''")+"'";
function definition(root=path.resolve(__dirname,'..'),exe=process.execPath,script=path.join(root,'hook.cjs')){
  const command=quote(exe)+' '+quote(script);
  const encoded=Buffer.from('& '+psQuote(exe)+' '+psQuote(script),'utf16le').toString('base64');
  const handler={type:'command',command,commandWindows:'powershell.exe -NoProfile -NonInteractive -EncodedCommand '+encoded,timeout:3,statusMessage:marker};
  return Object.fromEntries(['PermissionRequest','PreToolUse','PostToolUse','Stop','Interrupt','SessionEnd'].map(event=>[event,[{...(event==='PreToolUse'?{matcher:'^(functions\\.)?request_user_input$'}:{}),hooks:[{...handler}]}]]));
}
function merge(config,defs,remove=false){
  const result=structuredClone(config);result.hooks??={};
  for(const [event,groups] of Object.entries(defs)){
    const old=result.hooks[event]||[];
    result.hooks[event]=old.map(g=>({...g,hooks:g.hooks.filter(h=>h.statusMessage!==marker)})).filter(g=>g.hooks.length);
    if(!remove)result.hooks[event].push(...groups);
    if(!result.hooks[event].length)delete result.hooks[event];
  }
  return result;
}
if(require.main===module){
  const home=process.env.CODEX_HOME||path.join(os.homedir(),'.codex');fs.mkdirSync(home,{recursive:true});
  const file=path.join(home,'hooks.json'),old=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
  const updated=JSON.stringify(merge(old?JSON.parse(old):{},definition(),process.argv.includes('--remove')),null,2)+'\n';
  if(updated!==old){if(old!==null)fs.copyFileSync(file,file+'.yogo-backup-'+Date.now());fs.writeFileSync(file,updated);}
  console.log(process.argv.includes('--remove')?'Yogo hooks removed.':'Yogo hooks installed. Review and trust these display-only hooks with /hooks in Codex CLI, then restart/resume Codex. No trust or permission settings were changed.');
}
module.exports={definition,merge};
