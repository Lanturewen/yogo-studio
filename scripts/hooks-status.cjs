'use strict';
const {spawn}=require('child_process'),path=require('path');
const {definition}=require('./install-hooks.cjs');
function inspect(cli,cwd){return new Promise((resolve,reject)=>{
  const child=spawn(cli,['app-server','--stdio'],{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let buffer='',finished=false;
  const end=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);child.stdin.end();child.kill();error?reject(error):resolve(result);};
  const timer=setTimeout(()=>end(new Error('读取 Codex hooks 状态超时')),15000);
  const send=value=>child.stdin.write(JSON.stringify(value)+'\n');
  child.on('error',e=>end(e));child.stdin.on('error',e=>end(e));child.stderr.on('data',()=>{});
  child.on('exit',()=>{if(!finished)end(new Error('Codex 状态接口提前退出'));});
  child.stdout.on('data',c=>{buffer+=c;let pos;while((pos=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,pos);buffer=buffer.slice(pos+1);let row;try{row=JSON.parse(line);}catch{continue;}
    if(row.id===1){if(row.error)return end(new Error('Codex 初始化失败'));send({method:'initialized',params:{}});send({id:2,method:'hooks/list',params:{cwds:[cwd]}});}
    if(row.id===2){if(row.error)return end(new Error('当前 Codex 不支持 hooks 状态查询'));return end(null,row.result);}
  }});
  send({id:1,method:'initialize',params:{clientInfo:{name:'yogo_hooks_readonly',version:require('../package.json').version},capabilities:{experimentalApi:true}}});
});}
function classify(result,root=path.resolve(__dirname,'..'),exe=process.execPath){
  const defs=definition(root,exe),expected=Object.entries(defs).map(([event,groups])=>({event:event[0].toLowerCase()+event.slice(1),group:groups[0],handler:groups[0].hooks[0]}));
  const own=[],other=[];let issues=[];
  if(!Array.isArray(result?.data)||result.data.length!==1)throw new Error('无法确定 hooks 查询范围');
  for(const batch of result.data){
    issues.push(...(batch.errors||[]),...(batch.warnings||[]));
    for(const h of batch.hooks||[]){
      const match=expected.find(e=>h.eventName===e.event&&h.handlerType==='command'&&h.command===(process.platform==='win32'?e.handler.commandWindows:e.handler.command)&&h.statusMessage===e.handler.statusMessage&&(h.matcher||null)===(e.group.matcher||null)&&h.timeoutSec===e.handler.timeout&&h.async===false&&h.source==='user');
      (match?own:other).push(h);
    }
  }
  const complete=own.length===6&&new Set(own.map(h=>h.eventName)).size===6;
  return {own,other,issues,ready:complete&&!issues.length&&own.every(h=>h.enabled&&h.trustStatus==='trusted')};
}
module.exports={inspect,classify};
