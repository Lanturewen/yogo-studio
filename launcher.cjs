'use strict';
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const {local}=require('./settings.cjs');
async function running(){
 let info,s;
 try{info=JSON.parse(fs.readFileSync(path.join(local,'runtime.json'),'utf8'));if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(info.url))return null;s=await(await fetch(info.url+'/status',{signal:AbortSignal.timeout(2500),redirect:'error'})).json();}catch{return null;}
 if(s.appId!=='yogo75-codex-status')return null;
 if(s.instance!==__dirname)throw new Error('此数据目录正由另一份 YOGO Studio 程序使用；请使用正在运行的程序目录中的 CLI，不要启动第二个后台');
 return info;
}
async function ensure(){let info=await running();if(info)return info;
 const out=fs.openSync(path.join(local,'server.log'),'a');
 const child=spawn(process.execPath,[path.join(__dirname,'player.cjs')],{cwd:__dirname,detached:true,windowsHide:true,stdio:['ignore',out,out]});child.unref();fs.closeSync(out);
 for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,500));info=await running();if(info)return info;}
 throw new Error('后台启动失败，请检查 .local/server.log');
}
function open(url){const cmd=process.platform==='win32'?'explorer.exe':process.platform==='darwin'?'open':'xdg-open';const child=spawn(cmd,[url],{detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>console.log('请打开 '+url));child.unref();}
async function resume(info){const html=await(await fetch(info.url)).text();const token=html.match(/const token='([a-f0-9]+)'/)?.[1];if(!token)throw new Error('Invalid player token');const response=await fetch(info.url+'/auto',{method:'POST',headers:{'X-Player-Token':token,'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error('Unable to resume automatic mode');}
if(require.main===module)ensure().then(async info=>{await resume(info);console.log(info.url);if(!process.argv.includes('--silent'))open(info.url);}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={ensure,running};
