'use strict';
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
function candidates(env=process.env){
  const result=[];
  for(const dir of (env.PATH||env.Path||'').split(path.delimiter).filter(Boolean))result.push(path.join(dir,process.platform==='win32'?'codex.exe':'codex'));
  if(process.platform==='win32'&&env.LOCALAPPDATA){
    const base=path.join(env.LOCALAPPDATA,'OpenAI','Codex','bin');
    try{result.push(...fs.readdirSync(base,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(base,e.name,'codex.exe')).filter(f=>fs.existsSync(f)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs));}catch{}
  }
  if(process.platform==='darwin')result.push('/Applications/Codex.app/Contents/Resources/codex');
  return [...new Set(result)].filter(f=>fs.existsSync(f));
}
function findCli(){
  for(const file of candidates()){
    const r=spawnSync(file,['--version'],{encoding:'utf8',timeout:5000,windowsHide:true});
    if(r.status===0&&/^codex-cli\s/m.test(r.stdout||''))return file;
  }
  return null;
}
async function main(){
  const cli=findCli();
  if(!cli)throw new Error('未找到可直接运行的 Codex CLI。请先安装 Codex 桌面客户端，或将 codex 可执行程序加入 PATH。说明：https://learn.chatgpt.com/docs/codex/cli');
  const root=path.resolve(__dirname,'..');
  const install=spawnSync(process.execPath,[path.join(__dirname,'install-hooks.cjs')],{cwd:root,stdio:'inherit',windowsHide:true});
  if(install.status!==0)throw new Error('配置失败，未打开审阅界面。');
  const {inspect,classify}=require('./hooks-status.cjs');
  const before=classify(await inspect(cli,root),root);
  console.log('\nYogo 显示钩子检查（只读）');
  for(const h of before.own)console.log(`${h.eventName}: ${h.trustStatus==='trusted'?'已信任':'待审阅'} / ${h.enabled?'已启用':'未启用'}`);
  if(before.ready){console.log('\n六项全部已信任并启用，无需再次授权。日常使用本平台启动器启动播放器。真实任务显示联动需另行验证。');return 0;}
  if(before.issues.length)throw new Error('Codex 返回配置警告或错误，请在 /hooks 检查；不能确认审阅范围。');
  if(before.own.length!==6)throw new Error('未准确识别本应用全部六项钩子，请检查配置；不要使用 Trust all。');
  console.log('\n进入 Codex 后输入 /hooks，审阅对应上述六种事件、指向本项目 hook.cjs 的条目。');
  if(before.other.length)console.log(`检测到另外 ${before.other.length} 项非本应用钩子。不要按总览 Trust all；请逐项审阅我们的六项。Codex 原生列表不支持由本安装器隐藏其他条目。`);
  else console.log('本次查询只发现本应用六项。请核对 /hooks 实际列表仍一致，再决定是否使用总览的 t 信任全部。');
  console.log('本工具不会替你授权，也不会移除或停用其他钩子。\n');
  const r=spawnSync(cli,[],{cwd:root,stdio:'inherit'});
  if(r.error)throw r.error;
  const after=classify(await inspect(cli,root),root);
  console.log(after.ready?'检查通过：六项已信任并启用。':'尚未全部信任并启用，请在 /hooks 完成审阅。');
  if(!after.ready)return 1;
  return r.status||0;
}
if(require.main===module)main().then(code=>{process.exitCode=code;}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={candidates,findCli};
