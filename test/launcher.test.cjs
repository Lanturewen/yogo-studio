'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../launcher.cjs'),'utf8');
function fixture(snapshot){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yogo-launcher-'));
 fs.writeFileSync(path.join(dir,'runtime.json'),JSON.stringify({url:'http://127.0.0.1:3395',pid:123}));
 const context={module:{exports:{}},__dirname:'/source',AbortSignal,fetch:async()=>({json:async()=>snapshot}),require:name=>name==='./settings.cjs'?{local:dir}:require(name)};
 vm.runInNewContext(source,context);
 return {api:context.module.exports,close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('shared data directory refuses a second backend from a different program copy',async()=>{
 const f=fixture({appId:'yogo75-codex-status',instance:'/desktop/resources/app'});
 try{await assert.rejects(f.api.ensure(),/另一份 YOGO Studio/);}finally{f.close();}
});
test('same program copy reuses its running backend',async()=>{
 const f=fixture({appId:'yogo75-codex-status',instance:'/source'});
 try{assert.equal((await f.api.ensure()).pid,123);}finally{f.close();}
});
