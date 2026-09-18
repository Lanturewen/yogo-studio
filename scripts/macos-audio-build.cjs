'use strict';
const path=require('path');
function args(output){return ['-O2','-fobjc-arc','-framework','Foundation','-framework','AVFoundation','-framework','AudioToolbox','-framework','CoreAudio',path.join(__dirname,'audio-watch-macos.m'),'-Wl,-sectcreate,__TEXT,__info_plist,'+path.join(__dirname,'audio-watch-macos.plist'),'-o',output];}
module.exports={args};
if(require.main===module){const r=require('child_process').spawnSync('/usr/bin/clang',args(process.argv[2]),{stdio:'inherit'});process.exitCode=r.status??1;}
