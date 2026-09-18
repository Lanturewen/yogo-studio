'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..');
test('desktop API: preview is read-only, settings persist, untrusted writes fail, imported animations reload',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yogo-desktop-api-'));let child,url,token;
 fs.mkdirSync(path.join(dir,'sessions'));fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({port:0,voiceEnabled:true,voiceProviders:[{id:"test-capture",name:"Test capture",type:"event",enabled:true}],codexDialEnabled:false,sessionsRoot:path.join(dir,'sessions')}));
 async function launch(){
  child=spawn(process.execPath,[path.join(root,'player.cjs')],{env:{...process.env,YOGO_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
  url=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error('Server start timeout')),7000);child.stdout.on('data',d=>{out+=d;const match=out.match(/PLAYER (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);reject(Error('Server exit '+code));});});
  const html=await(await fetch(url)).text();token=html.match(/const token='([a-f0-9]+)'/)[1];
 }
 const get=route=>fetch(url+route).then(r=>r.json());
 const post=(route,data,headers={})=>fetch(url+route,{method:'POST',headers:{'X-Player-Token':token,'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
 async function close(){const running=child;if(!running||running.exitCode!==null)return;const exited=new Promise(resolve=>running.once('exit',resolve));await post('/shutdown',{});await exited;child=null;}
 try{
  await launch();await post('/stop',{});
  const html=await fetch(url);assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  for(const route of ['/ui.css','/ui.js'])assert.equal((await fetch(url+route)).status,200);
  const before=await get('/status');
  const preview=await get('/catalog-preview?id=done&ms=1100');assert.equal(preview.pixels.length,36);assert.equal(preview.keys.length,84);assert.ok(preview.pixels.some(p=>p.some(n=>n>0)));
  const after=await get('/status');assert.equal(after.frames,before.frames);assert.equal(after.mode,before.mode);assert.equal(after.connection,null);
  assert.equal((await post('/settings',{theme:'dark'},{'X-Player-Token':'invalid'})).status,403);
  assert.equal((await post('/settings',{theme:'dark'},{Origin:'https://example.com'})).status,403);
  assert.equal((await post('/settings',{theme:'dark',resultDisplayMs:5000})).status,200);
  assert.equal((await get('/app-info')).settings.theme,'dark');
  assert.equal((await post('/settings',{port:1})).status,500);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'config.json'))).port,0);
  assert.equal((await post('/scope',{scope:'current',sessionId:'missing'})).status,500);
  assert.equal((await get('/app-info')).settings.scope,'global');
  const animation={id:'custom-api-test',name:'本地动画',frameMs:100,frames:[Array.from({length:36},()=>[7,8,9])]};
  assert.equal((await post('/import-animation',animation)).status,200);
  assert.equal((await post('/import-animation',animation)).status,500);
  assert.equal((await post('/import-animation',{...animation,id:'../../bad'})).status,500);
  assert.ok((await get('/animations')).some(a=>a.id===animation.id));
  const client=await require('../voice-client.cjs').connect({dataDir:dir});
  const capture=await client.capture('test-capture',true,.42);assert.equal(capture.active,true);assert.equal(capture.providerId,'test-capture');assert.equal(capture.levelKind,'provider');assert.equal(capture.level,.42);
  assert.equal((await get('/status')).state,'stopped'); // Capture cannot steal manual control or write hardware.
  await assert.rejects(client.capture('unregistered',true,.2),/Unknown/);
  await assert.rejects(client.capture('test-capture',true,2),/Invalid/);
  await client.capture('test-capture',false);assert.equal((await get('/status')).voice.active,false);
  await client.capture('test-capture',true,null);await new Promise(r=>setTimeout(r,2100));assert.equal((await get('/status')).voice.active,false);
  await close();await launch();assert.equal((await get('/app-info')).settings.theme,'dark');
  assert.deepEqual((await get('/catalog-preview?id=custom-api-test&ms=0')).pixels[0],[7,8,9]);
 }finally{try{await close();}finally{child?.kill();fs.rmSync(dir,{recursive:true,force:true});}}
});
