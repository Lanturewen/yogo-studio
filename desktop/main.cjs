'use strict';
const {app,BrowserWindow,Tray,Menu,nativeImage,ipcMain,shell,dialog}=require('electron');
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
app.setName('YOGO Studio');
if(process.platform==='win32')app.setAppUserModelId('studio.yogo.desktop');
const root=path.resolve(__dirname,'..');
const runtime=app.isPackaged?path.join(process.resourcesPath,'runtime'):path.join(root,'runtime');
const node=path.join(runtime,process.platform==='win32'?'node.exe':'node');
let win,tray,child,url,token,quitting=false,closed=false,log;
const dataRoot=process.env.YOGO_DESKTOP_DATA_DIR||app.getPath('userData');
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>show());
 app.on('activate',()=>show());
 app.on('window-all-closed',()=>{});
 app.on('before-quit',event=>{if(closed)return;event.preventDefault();void quit();});
 app.whenReady().then(start).catch(error=>{dialog.showErrorBox('YOGO Studio 启动失败',error.message+'\n请检查本地数据文件夹中的 desktop.log。');closed=true;app.quit();});
}
function show(){
 if((!win||win.isDestroyed())&&url){createWindow();void win.loadURL(url).then(()=>{win.show();win.focus();});return;}
 if(win&&!win.isDestroyed()){win.show();if(win.isMinimized())win.restore();win.focus();}
}
function createWindow(){
 win=new BrowserWindow({title:'YOGO Studio',width:1280,height:930,minWidth:800,minHeight:650,backgroundColor:'#f5f4f0',show:false,icon:path.join(__dirname,'icon.png'),autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
 win.once('ready-to-show',()=>{if(!process.argv.includes('--hidden'))show();});
 win.on('close',event=>{if(!quitting){event.preventDefault();win.hide();}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,target)=>{if(!url||new URL(target).origin!==url)event.preventDefault();});
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
}
async function api(endpoint,body){if(!url)throw Error('本地服务尚未启动');const r=await fetch(url+endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Player-Token':token},body:JSON.stringify(body||{}),signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error((await r.json()).error||'本地服务操作失败');return r.json();}
async function stopAt(info){try{if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(info.url))return;const s=await(await fetch(info.url+'/status',{signal:AbortSignal.timeout(1500)})).json();if(s.appId!=='yogo75-codex-status'||s.instance!==root)return;const html=await(await fetch(info.url)).text();const oldToken=html.match(/const token='([a-f0-9]+)'/)?.[1];if(!oldToken)return;await fetch(info.url+'/shutdown',{method:'POST',headers:{'X-Player-Token':oldToken,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(2000)});await new Promise(r=>setTimeout(r,450));}catch{}}
function migrate(){
 fs.mkdirSync(dataRoot,{recursive:true});const dest=path.join(dataRoot,'config.json');
 if(!fs.existsSync(dest)){
  const old=path.join(root,'config.json');
  // Source users retain their existing preferences. New installs do not start input hooks before setup.
  fs.writeFileSync(dest,fs.existsSync(old)?fs.readFileSync(old):JSON.stringify({port:3395,codexDialEnabled:false,voiceEnabled:false,backlightSync:true,theme:'light'},null,2));
  for(const folder of ['keymap-backups','animations']){const from=path.join(root,'.local',folder),to=path.join(dataRoot,'.local',folder);if(fs.existsSync(from)&&!fs.existsSync(to))fs.cpSync(from,to,{recursive:true});}
 }
}
async function start(){
 migrate();log=fs.createWriteStream(path.join(dataRoot,'desktop.log'),{flags:'a'});
 if(!fs.existsSync(node))throw Error('缺少内置运行环境。请重新下载完整安装包。开发者可先准备 runtime/'+path.basename(node));
 for(const base of [root,dataRoot]){try{await stopAt(JSON.parse(fs.readFileSync(path.join(base,'.local','runtime.json'),'utf8')));}catch{}}
 const icon=path.join(__dirname,'icon.png');
 createWindow();
 await win.loadFile(path.join(__dirname,'loading.html'));
 Menu.setApplicationMenu(Menu.buildFromTemplate(process.platform==='darwin'?[{label:'YOGO Studio',submenu:[{label:'关于 YOGO Studio',role:'about'},{type:'separator'},{label:'退出 YOGO Studio',click:()=>quit()}]},{label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'窗口',submenu:[{role:'minimize'},{role:'zoom'}]}]:[]));
 const trayImage=nativeImage.createFromPath(icon).resize({width:process.platform==='darwin'?18:24,height:process.platform==='darwin'?18:24});
 tray=new Tray(trayImage);tray.setToolTip('YOGO Studio · 本地键盘联动');tray.setContextMenu(Menu.buildFromTemplate([{label:'打开 YOGO Studio',click:show},{type:'separator'},{label:'恢复自动跟随',click:()=>api('/auto').catch(report)},{label:'暂停并恢复键盘显示',click:()=>api('/stop').catch(report)},{type:'separator'},{label:'退出 YOGO Studio',click:()=>quit()}]));tray.on('double-click',show);tray.on('click',show);
 registerIPC();
 child=spawn(node,[path.join(root,'player.cjs')],{cwd:root,windowsHide:true,env:{...process.env,YOGO_DATA_DIR:dataRoot,YOGO_RUNTIME_DIR:runtime,YOGO_PARENT_PID:String(process.pid)},stdio:['ignore','pipe','pipe']});
 let exited=false;child.on('error',e=>{exited=true;log.write(e.stack+'\n');});child.on('exit',(code)=>{exited=true;if(!quitting){log.write('Backend exited: '+code+'\n');void win.loadFile(path.join(__dirname,'loading.html'),{query:{error:'后台服务已停止，请退出应用后重新打开。'}});show();}});
 child.stdout.on('data',d=>log.write(d));child.stderr.on('data',d=>log.write(d));
 for(let i=0;i<80;i++){
  if(exited)throw Error('本地服务启动失败');
  await new Promise(r=>setTimeout(r,150));
  try{const info=JSON.parse(fs.readFileSync(path.join(dataRoot,'.local','runtime.json'),'utf8'));if(info.pid!==child.pid)continue;const s=await(await fetch(info.url+'/status',{signal:AbortSignal.timeout(1000)})).json();if(s.appId!=='yogo75-codex-status'||s.instance!==root)continue;url=info.url;const html=await(await fetch(url)).text();token=html.match(/const token='([a-f0-9]+)'/)?.[1];if(token){await win.loadURL(url);return;}}catch{}
 }
 throw Error('本地服务未能在预期时间内启动');
}
function report(error){dialog.showErrorBox('操作未完成',error.message);}
function registerIPC(){
 const handle=(name,fn)=>ipcMain.handle(name,async(event,...args)=>{if(!url||event.sender!==win.webContents||event.senderFrame.url.split('#')[0]!==url+'/')throw Error('拒绝非应用页面请求');return fn(...args);});
 handle('yogo:info',()=>({packaged:app.isPackaged,openAtLogin:app.isPackaged&&app.getLoginItemSettings().openAtLogin}));
 handle('yogo:data',async()=>{const error=await shell.openPath(dataRoot);if(error)throw Error(error);});
 handle('yogo:permissions',()=>{if(process.platform==='darwin')return shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');});
 handle('yogo:login',value=>{if(typeof value!=='boolean'||!app.isPackaged)throw Error('仅安装版支持登录启动');app.setLoginItemSettings({openAtLogin:value,args:['--hidden']});});
 handle('yogo:quit',()=>{void quit();});
 handle('yogo:hooks',()=>{
  const os=require('os'),{definition,merge}=require('../scripts/install-hooks.cjs');
  const home=process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),file=path.join(home,'hooks.json');fs.mkdirSync(home,{recursive:true});
  const wrapper=path.join(dataRoot,'display-hook.cjs');
  // Execute hook.cjs as the entrypoint so its stdin listener and timeout run normally.
  const launch="process.env.YOGO_DATA_DIR="+JSON.stringify(dataRoot)+";\nconst {spawn}=require('child_process');\nconst child=spawn("+JSON.stringify(node)+",["+JSON.stringify(path.join(root,'hook.cjs'))+"],{env:process.env,windowsHide:true,stdio:['pipe','ignore','ignore']});\nprocess.stdin.pipe(child.stdin);child.on('error',()=>process.exit(0));child.stdin.on('error',()=>{});const timer=setTimeout(()=>{child.kill();process.exit(0);},2500);child.on('exit',()=>{clearTimeout(timer);process.exit(0);});\n";
  fs.writeFileSync(wrapper,launch);
  const old=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null,defs=definition(root,node,wrapper),updated=JSON.stringify(merge(old?JSON.parse(old):{},defs),null,2)+'\n';
  if(old!==updated){if(old!==null)fs.copyFileSync(file,file+'.yogo-backup-'+Date.now());const temp=file+'.yogo-tmp';fs.writeFileSync(temp,updated);fs.renameSync(temp,file);}
  return {message:'显示钩子已写入；请在 Codex /hooks 中审阅并信任。本应用没有更改信任设置。'};
 });
}
async function quit(){if(quitting)return;quitting=true;try{await api('/shutdown');await new Promise(r=>setTimeout(r,400));}catch{}child?.kill();tray?.destroy();log?.end();closed=true;app.quit();}
