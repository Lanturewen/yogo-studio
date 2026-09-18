'use strict';
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),kind=process.argv[2];
if(!['source','windows','macos'].includes(kind))throw new Error('Use source, windows or macos');
if(kind==='macos'&&process.platform!=='darwin')throw new Error('macOS portable builds require macOS');
const names=['package.json','package-lock.json','START_HERE.md','AI_SETUP.md','start.cmd','config.example.json','.gitignore','README.md','RELEASE_NOTES.md','LICENSE','THIRD_PARTY_NOTICES.md','ANIMATIONS.md','launch.vbs','Yogo 75 codex状态适配.vbs','setup.cmd','setup-hooks.cmd','doctor.cmd','start.command','doctor.command','MACOS.md','player.cjs','player.html','settings.cjs','launcher.cjs','cli.cjs','codex-watch.cjs','yogo-hid.cjs','keyboard-preset.cjs','animations.cjs','builtin-animations.cjs','backlight.cjs','voice-animation.cjs','voice-state.cjs','voice-monitor.cjs','codex-dial.cjs','VOICE.md','attention.cjs','hook.cjs','HOOKS.md','animations','test','scripts','.github'];
const {version}=require('../package.json');
names.push('VALIDATION.md','voice-client.cjs','ui','desktop','electron-builder.json','DESKTOP.md');
function copyProductionModules(destination){
 const lock=require('../package-lock.json');
 for(const [relative,entry] of Object.entries(lock.packages||{}))if(relative.startsWith('node_modules/')&&!entry.dev){fs.cpSync(path.join(root,relative),path.join(destination,relative),{recursive:true});}
}
const dist=path.join(root,'dist');fs.mkdirSync(dist,{recursive:true});
const staging=fs.mkdtempSync(path.join(dist,'stage-'));
const folder=path.join(staging,`yogo75-codex-status-${version}-${kind}`);fs.mkdirSync(folder);
for(const name of names)fs.cpSync(path.join(root,name),path.join(folder,name),{recursive:true});
if(kind==='macos'){
 fs.mkdirSync(path.join(folder,'runtime'));
 const binary=path.join(root,'runtime','node');
 const linked=spawnSync('/usr/bin/otool',['-L',binary],{encoding:'utf8'});
 if(linked.status!==0||linked.stdout.split('\n').slice(1).some(line=>line.trim()&&!/^\s*\/(usr\/lib|System\/Library)\//.test(line)))throw new Error('runtime/node must be a standalone official macOS Node binary');
 const info=spawnSync(binary,['-p','process.arch'],{encoding:'utf8'});
 if(info.status!==0||info.stdout.trim()!==process.arch)throw new Error('Node architecture mismatch');
 fs.copyFileSync(binary,path.join(folder,'runtime','node'));
 fs.chmodSync(path.join(folder,'runtime','node'),0o755);
 copyProductionModules(folder);
 const built=spawnSync('/usr/bin/clang',require('./macos-audio-build.cjs').args(path.join(folder,'runtime','audio-watch-macos')),{stdio:'inherit'});
 if(built.status!==0)throw new Error('macOS audio helper build failed');
 const dial=spawnSync('/usr/bin/clang',['-fobjc-arc','-framework','AppKit','-framework','ApplicationServices',path.join(root,'scripts','codex-dial-macos.m'),'-o',path.join(folder,'runtime','codex-dial-macos')],{stdio:'inherit'});
 if(dial.status!==0)throw new Error('macOS Codex dial helper build failed');
 fs.copyFileSync(path.join(root,'runtime','LICENSE'),path.join(folder,'runtime','LICENSE'));
}
if(kind==='windows'){
 const runtime=fs.existsSync(path.join(root,'runtime','windows-x64','node.exe'))?path.join(root,'runtime','windows-x64'):path.join(root,'runtime');
 const checkPE=file=>{const b=fs.readFileSync(file);if(b.length<64||b.toString('ascii',0,2)!=='MZ')throw new Error('Invalid Windows executable: '+file);const offset=b.readUInt32LE(60);if(offset+6>b.length||b.readUInt32LE(offset)!==0x4550||b.readUInt16LE(offset+4)!==0x8664)throw new Error('Expected Windows x64 PE binary: '+file);};
 checkPE(path.join(runtime,'node.exe'));
 checkPE(path.join(root,'node_modules','node-hid','prebuilds','HID-win32-x64','node-napi-v4.node'));
 fs.mkdirSync(path.join(folder,'runtime'));
 for(const name of ['node.exe','LICENSE'])fs.copyFileSync(path.join(runtime,name),path.join(folder,'runtime',name));
 copyProductionModules(folder);
}
fs.writeFileSync(path.join(folder,'build-info.json'),JSON.stringify({version,target:kind==='windows'?'windows-x64':kind==='macos'?`macos-${process.arch}`:'source',assemblyPlatform:process.platform,portable:kind!=='source',windowsRuntimeVerified:kind==='windows'&&process.platform==='win32',instructions:'START_HERE.md',aiInstructions:'AI_SETUP.md'},null,2)+'\n');
// Fixed allowlist intentionally excludes local config, transcripts, audit files and runtime logs.
const zip=path.join(dist,`yogo75-codex-status-${version}-${kind==='windows'?'windows-x64-portable':kind==='macos'?`macos-${process.arch}-portable`:'source'}.zip`);
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const r=process.platform!=='win32'?spawnSync('/usr/bin/ditto',['-c','-k','--keepParent',folder,zip],{stdio:'inherit'}):spawnSync('powershell.exe',['-NoProfile','-Command',`Add-Type -AssemblyName System.IO.Compression.FileSystem; if([IO.File]::Exists(${quote(zip)})){[IO.File]::Delete(${quote(zip)})}; [IO.Compression.ZipFile]::CreateFromDirectory(${quote(folder)},${quote(zip)},[IO.Compression.CompressionLevel]::Optimal,$true)`],{stdio:'inherit'});
if(r.status!==0)throw new Error('Archive failed');
fs.writeFileSync(zip+'.sha256',crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex')+'  '+path.basename(zip)+'\n');
console.log(zip);
