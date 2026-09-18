'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {connect}=require('../voice-client.cjs');
test('voice client rejects non-loopback discovery before network access',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yogo-client-'));fs.mkdirSync(path.join(dir,'.local'));
 try{fs.writeFileSync(path.join(dir,'.local/runtime.json'),JSON.stringify({url:'https://example.com'}));let calls=0;
 await assert.rejects(connect({dataDir:dir,fetchImpl:async()=>{calls++;}}),/loopback/);assert.equal(calls,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('voice client does not fetch a token from an unrelated local service',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yogo-client-'));fs.mkdirSync(path.join(dir,'.local'));
 try{fs.writeFileSync(path.join(dir,'.local/runtime.json'),JSON.stringify({url:'http://127.0.0.1:3456'}));const requests=[];
 await assert.rejects(connect({dataDir:dir,fetchImpl:async(url,options)=>{requests.push(url);assert.equal(options.redirect,'error');return {ok:true,json:async()=>({appId:'unrelated'})};}}),/Not a YOGO/);assert.equal(requests.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
