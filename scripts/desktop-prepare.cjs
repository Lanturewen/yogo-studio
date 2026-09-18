'use strict';
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),runtime=path.join(root,'runtime');fs.mkdirSync(runtime,{recursive:true});
// electron-builder does not retain the distribution-level license files automatically.
const electronDist=path.join(root,'node_modules','electron','dist'),licenses=path.join(runtime,'licenses');
fs.mkdirSync(licenses,{recursive:true});
for(const [source,destination] of [['LICENSE','ELECTRON-LICENSE.txt'],['LICENSES.chromium.html','CHROMIUM-LICENSES.html']]){
 const file=path.join(electronDist,source);
 if(!fs.existsSync(file))throw Error('Missing Electron license: '+source+'; run node node_modules/electron/install.js first');
 fs.copyFileSync(file,path.join(licenses,destination));
}
require('./desktop-icons.cjs');
require('./build-viewer.cjs');
function run(exe,args){const r=spawnSync(exe,args,{stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)throw Error('Native helper compilation failed');}
if(process.platform==='win32'){
 const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe'),wpf=path.join(path.dirname(compiler),'WPF');
 run(compiler,['/nologo','/target:exe','/optimize+','/reference:System.Web.Extensions.dll','/out:'+path.join(runtime,'audio-watch-windows.exe'),path.join(root,'scripts','audio-watch.cs')]);
 run(compiler,['/nologo','/target:exe','/optimize+','/reference:System.Web.Extensions.dll','/reference:UIAutomationClient.dll','/reference:UIAutomationTypes.dll','/reference:WindowsBase.dll','/lib:'+wpf,'/out:'+path.join(runtime,'codex-dial-windows.exe'),path.join(root,'scripts','codex-dial-windows.cs')]);
}else if(process.platform==='darwin'){
 run('/usr/bin/clang',require('./macos-audio-build.cjs').args(path.join(runtime,'audio-watch-macos')));
 run('/usr/bin/clang',['-fobjc-arc','-framework','AppKit','-framework','ApplicationServices',path.join(root,'scripts','codex-dial-macos.m'),'-o',path.join(runtime,'codex-dial-macos')]);
}else throw Error('Desktop builds require Windows or macOS');
for(const file of [process.platform==='win32'?'node.exe':'node','LICENSE'])if(!fs.existsSync(path.join(runtime,file)))throw Error('Missing bundled runtime/'+file);
console.log('Desktop runtime ready.');
