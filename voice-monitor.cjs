'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process');
async function build(local){
 const mac=process.platform==='darwin';
 const bundled=path.join(process.env.YOGO_RUNTIME_DIR||path.join(__dirname,'runtime'),mac?'audio-watch-macos':'audio-watch-windows.exe');
 if(fs.existsSync(bundled))return bundled;
 const source=path.join(__dirname,'scripts',mac?'audio-watch-macos.m':'audio-watch.cs');
 const hash=crypto.createHash('sha256').update(fs.readFileSync(source)).update(mac?fs.readFileSync(path.join(__dirname,'scripts','audio-watch-macos.plist')):'').digest('hex').slice(0,16);
 const exe=path.join(local,`audio-watch-${process.platform}-${process.arch}-${hash}${mac?'':'.exe'}`);if(fs.existsSync(exe))return exe;
 const windows=process.env.SystemRoot||'C:\\Windows';
 const compiler=mac?'/usr/bin/clang':['Framework64','Framework'].map(p=>path.join(windows,'Microsoft.NET',p,'v4.0.30319','csc.exe')).find(p=>fs.existsSync(p));
 if(!compiler)throw new Error('语音监听需要 Windows .NET Framework 4.x 编译器');
 const temp=exe+'.'+process.pid+'.exe';
 await new Promise((resolve,reject)=>{
  const args=mac?require('./scripts/macos-audio-build.cjs').args(temp):['/nologo','/target:exe','/optimize+','/reference:System.Web.Extensions.dll','/out:'+temp,source];
  const c=spawn(compiler,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';const timer=setTimeout(()=>{c.kill();reject(new Error('语音监听组件编译超时'));},20000);
  c.stdout.on('data',d=>output=(output+d).slice(-2000));c.stderr.on('data',d=>output=(output+d).slice(-2000));
  c.on('error',e=>{clearTimeout(timer);reject(e);});c.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('语音监听组件编译失败：'+output));});
 });
 try{fs.renameSync(temp,exe);}catch(e){if(!fs.existsSync(exe))throw e;fs.unlinkSync(temp);}return exe;
}
class AudioObserver{
 constructor(state,local,changed=()=>{}){this.state=state;this.local=local;this.changed=changed;this.closed=false;this.child=null;this.retry=null;this.watchdog=null;}
 async start(){
  if(this.closed)return;
  const names=[...new Set(this.state.providers.filter(p=>p.enabled&&p.type==='audio-session').flatMap(p=>p.processNames))];
  if(!names.length)return;
  if(!['win32','darwin'].includes(process.platform)){this.state.fail('语音会话监听支持 Windows 和 macOS 14.2+');this.changed();return;}
  try{
   const exe=await build(this.local);if(this.closed)return;
   const args=process.platform==='darwin'?this.state.providers.filter(p=>p.enabled&&p.type==='audio-session').flatMap(p=>p.processNames.flatMap(n=>['--target',n,p.pathIncludes?.replaceAll('\\','/')||''])):names.flatMap(n=>['--process',n]);
   const child=spawn(exe,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;
   let buffer='',ended=false;this.lastSeen=Date.now();
   const failed=message=>{if(ended)return;ended=true;clearInterval(this.watchdog);if(this.child===child)this.child=null;child.stdin.destroy();child.kill();if(!this.closed){this.state.fail(message);this.changed();this.retry=setTimeout(()=>this.start(),5000);}};
   child.stdin.on('error',()=>{});child.stdout.on('data',chunk=>{
    buffer+=chunk;if(buffer.length>262144){failed('语音监听数据异常');return;}
    let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);try{this.state.observe(JSON.parse(line));this.lastSeen=Date.now();this.changed();}catch{failed('语音监听协议异常');return;}}
   });
   child.stderr.on('data',()=>{});child.on('error',e=>failed(e.message));child.on('exit',()=>failed('语音监听进程已退出，正在重连'));
   this.watchdog=setInterval(()=>{if(Date.now()-this.lastSeen>2500)failed('语音监听失去响应，正在重连');},1000);
  }catch(e){if(!this.closed){this.state.fail(e.message);this.changed();this.retry=setTimeout(()=>this.start(),10000);}}
 }
 close(){this.closed=true;clearTimeout(this.retry);clearInterval(this.watchdog);this.child?.stdin.end();this.child?.kill();this.child=null;}
}
module.exports={AudioObserver,build};
