'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {Yogo,devices}=require('./yogo-hid.cjs');
const animations=require('./animations.cjs');
const {frame}=animations;
const backlight=require('./backlight.cjs');
const settings=require('./settings.cjs');
const initial=settings.read();
const {VoiceState}=require('./voice-state.cjs');
const {AudioObserver}=require('./voice-monitor.cjs');
const {CodexDial}=require('./codex-dial.cjs');
const voice=new VoiceState(initial.voiceProviders);
let audioObserver=null,voicePoll=null,lastVoiceActive=false,codexDial=null;
let animationId=null;
for(const id of Object.values(initial.stateAnimations))animations.get(id);
const {Watcher,GlobalWatcher}=require('./codex-watch.cjs');
const token=crypto.randomBytes(24).toString('hex');
let keyboard=null,state='stopped',started=0,timer=null,lastError='',frames=0;
let shuttingDown=false;
let backlightError='',backlightFailed=false;
let lastDotAt=0,lastDotCheckAt=0,lastDotSignature=null,backlightFrames=0,lastDisplayedDot=null;
let resultDisplayMs=initial.resultDisplayMs;
let releaseTimer=null,releasedFor=null;
let mode='auto',watcher=null,follow=null;
const selectableSessions=new Map();
const {Attention}=require('./attention.cjs');
const attention=new Attention();
function refreshFollow(){
  const base=watcher?.snapshot()||{state:'stopped'};
  const entries=watcher?.states?[...watcher.states.values()]:[base];
  follow=attention.overlay(base,entries,base.scope==='当前任务'?base.sessionId:null);
  applyFollow();
}
function applyFollow(){
  if(mode!=='auto')return;
  try{
    if(follow&&['busy','waiting'].includes(follow.state))releasedFor=null;
    if(initial.voiceEnabled!==false&&voice.snapshot().active){
      if(state!=='voice'||!keyboard){const previousRelease=releasedFor;start('voice');releasedFor=previousRelease;}
      return;
    }
    if(!follow){if(state==='voice')stop();return;}
    if(follow.error||follow.state==='stopped')stop();
    else if(releasedFor===follow.state&&!['busy','waiting'].includes(follow.state)){if(state==='voice')stop();return;}
    else if(state!==follow.state||!keyboard||state==='waiting'&&releaseTimer)start(follow.state);
  }catch(e){lastError=e.message;try{stop();}catch{}}
}
function refreshVoice(){
  const active=initial.voiceEnabled!==false&&voice.snapshot().active;
  // Meter samples update the renderer without repeatedly retrying a disconnected keyboard.
  if(active!==lastVoiceActive){lastVoiceActive=active;applyFollow();}
}
function voiceOptions(){return {demo:mode==='manual',level:voice.snapshot().level};}
function displayFrame(elapsed,options=voiceOptions()){return frame(animationId,elapsed,animationId==='voice'?options:undefined);}
function stop(){
  clearTimeout(releaseTimer);releaseTimer=null;
  clearTimeout(timer);timer=null;state='stopped';
  if(keyboard){const k=keyboard;keyboard=null;k.stop();}
}
function tick(){
  if(!keyboard||state==='stopped')return;
  try{
    const begin=Date.now(),elapsed=begin-started;
    const options=voiceOptions(),dot=displayFrame(elapsed,options);
    const smoothBacklight=initial.backlightSync&&!backlightFailed;
    const dotInterval=animations.get(animationId).intervalMs;
    const syncSymbol=['done','error','waiting'].includes(state);
    const entryDuration=require('./builtin-animations.cjs').entryMs[state];
    const finishingEntry=syncSymbol&&elapsed>=entryDuration&&lastDotCheckAt-started<entryDuration;
    if(!smoothBacklight||lastDotSignature===null||finishingEntry||begin-lastDotCheckAt>=dotInterval){
      lastDotCheckAt=begin;
      const signature=JSON.stringify(dot);
      if(!smoothBacklight||signature!==lastDotSignature||begin-lastDotAt>=2500){
        keyboard.frame(dot);frames++;lastDotAt=begin;lastDotSignature=signature;lastDisplayedDot=dot;
      }
    }
    if(initial.backlightSync&&!backlightFailed){
      // Symbol brightness follows the frame actually sent to the display.
      try{keyboard.backlight(backlight.frame(state,elapsed,syncSymbol&&lastDisplayedDot?lastDisplayedDot:dot,{...options,hardwareWaitingAmber:state==='waiting'&&animationId==='waiting'}));backlightFrames++;}
      catch(e){backlightError=e.message;backlightFailed=true;try{keyboard.endBacklight();}catch{}}
    }
    // Prioritize backlight at up to 25Hz; dot retains its own cadence and shared timeline.
    // Serial acknowledged writes never overlap or accumulate a frame backlog.
    const interval=initial.backlightSync&&!backlightFailed?40:dotInterval;
    timer=setTimeout(tick,Math.max(2,interval-(Date.now()-begin)));
  }catch(e){lastError=e.message;try{stop();}catch{};}
}
function start(next){
  const selected=initial.stateAnimations[next]||next;animations.get(selected);animationId=selected;
  clearTimeout(timer);
  clearTimeout(releaseTimer);releaseTimer=null;releasedFor=null;
  if(!keyboard){const ds=devices();const wired=ds.some(d=>d.productId===0x119b);keyboard=new Yogo({wireless:!wired});backlightError='';backlightFailed=false;}
  lastDotSignature=null;lastDotAt=0;lastDotCheckAt=0;lastDisplayedDot=null;
  state=next;started=Date.now();lastError='';tick();
  if(keyboard&&next!=='busy'&&!(['waiting','voice'].includes(next)&&mode==='auto'))releaseTimer=setTimeout(()=>{
    releasedFor=next;
    try{stop();}catch(e){lastError=e.message;}
  },resultDisplayMs);
}
function status(){return {appId:'yogo75-codex-status',version:require('./package.json').version,instance:__dirname,animationId,voice:{enabled:initial.voiceEnabled,...voice.snapshot(),demo:state==='voice'&&mode==='manual'},codexDial:codexDial?.snapshot()??{enabled:false},backlightSync:initial.backlightSync,backlightError,animationErrors:animations.errors,state,frames,backlightFrames,error:lastError,mode,follow,hookLastEvent:attention.lastEvent,releasedFor,resultDisplayMs,connection:keyboard?(keyboard.size===32?'2.4G 接收器':'USB 有线'):null,stats:keyboard?.stats??null};}
function updateSettings(patch){
 const valid=settings.validatePatch(patch);
 if(valid.stateAnimations)valid.stateAnimations={...initial.stateAnimations,...valid.stateAnimations};
 settings.savePatch(valid);Object.assign(initial,valid);resultDisplayMs=initial.resultDisplayMs;
 if('codexDialEnabled' in valid){codexDial?.close();codexDial=null;if(initial.codexDialEnabled){codexDial=new CodexDial(settings.local);codexDial.start();}}
 if('voiceEnabled' in valid){clearInterval(voicePoll);voicePoll=null;audioObserver?.close();audioObserver=null;voice.fail('');lastVoiceActive=false;if(initial.voiceEnabled){audioObserver=new AudioObserver(voice,settings.local,refreshVoice);audioObserver.start();voicePoll=setInterval(refreshVoice,250);}}
 if('backlightSync' in valid||'stateAnimations' in valid||'resultDisplayMs' in valid){const previous=state;stop();if(mode==='manual'&&previous!=='stopped')start(previous);}
 if(mode==='auto')applyFollow();
}
function reply(res,code,data,type='application/json'){res.writeHead(code,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(typeof data==='string'?data:JSON.stringify(data));}
const server=http.createServer((req,res)=>{
  const base=`http://127.0.0.1:${server.address().port}`;
  if(req.headers.host!==new URL(base).host)return reply(res,403,{error:'Host rejected'});
  if(req.method==='GET'&&req.url==='/favicon.ico'){res.writeHead(204);return res.end();}
  if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' 'nonce-${token}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`);return reply(res,200,fs.readFileSync(path.join(__dirname,'player.html'),'utf8').replaceAll('__TOKEN__',token),'text/html');}
  if(req.method==='GET'&&['/ui.css','/ui.js','/viewer.js'].includes(req.url))return reply(res,200,fs.readFileSync(path.join(__dirname,'ui',req.url.slice(1)),'utf8'),req.url.endsWith('.css')?'text/css':'text/javascript');
  if(req.method==='GET'&&['/assets/yogo-pro-front.png','/assets/yogo-pro-underside.jpg','/assets/yogo-pro-controls.png'].includes(req.url)){res.writeHead(200,{'Content-Type':req.url.endsWith('.png')?'image/png':'image/jpeg','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'});return fs.createReadStream(path.join(__dirname,'ui',req.url.slice(1))).pipe(res);}
  if(req.method==='GET'&&req.url==='/app-info'){
    let connected=[],deviceError='';try{connected=devices().map(d=>({transport:d.productId===0x119b?'USB 有线':'2.4G 接收器',name:d.product||'YOGO 75 PRO'}));}catch(e){deviceError=e.message;}
    const config=settings.read();
    return reply(res,200,{platform:process.platform,devices:connected,deviceError,settings:{scope:config.scope,sessionId:config.sessionId,backlightSync:initial.backlightSync,voiceEnabled:initial.voiceEnabled,codexDialEnabled:initial.codexDialEnabled,showInDock:initial.showInDock,resultDisplayMs,theme:initial.theme,reduceMotion:initial.reduceMotion,onboardingComplete:initial.onboardingComplete,stateAnimations:initial.stateAnimations},sessionsAvailable:fs.existsSync(initial.sessionsRoot)});
  }
  if(req.method==='GET'&&req.url==='/sessions'){try{const index=watcher?.watchers?watcher:new GlobalWatcher(settings.read(),()=>{});index.discover();const list=[];for(const [file,w] of index.watchers){const id=w.config.sessionId;selectableSessions.set(id,file);list.push({id,modified:fs.statSync(file).mtimeMs});}return reply(res,200,list.sort((a,b)=>b.modified-a.modified).slice(0,60));}catch(e){return reply(res,400,{error:e.message});}}
  if(req.method==='GET'&&req.url.startsWith('/catalog-preview?')){try{const query=new URL(req.url,base).searchParams,id=query.get('id'),ms=Number(query.get('ms'));if(!Number.isFinite(ms)||ms<0||ms>86400000)throw Error('Invalid preview time');const dot=frame(id,ms,{demo:true});return reply(res,200,{pixels:dot,keys:backlight.frame(id,ms,dot,{demo:true}),id});}catch(e){return reply(res,400,{error:e.message});}}
  if(req.method==='GET'&&req.url==='/animations')return reply(res,200,animations.list());
  if(req.method==='GET'&&req.url==='/preview')return reply(res,200,state==='stopped'?Array.from({length:36},()=>[0,0,0]):displayFrame(Date.now()-started));
  if(req.method==='GET'&&req.url==='/status')return reply(res,200,status());
  if(req.method==='POST'&&['/state','/auto','/scope','/stop','/shutdown','/attention','/voice','/settings','/import-animation'].includes(req.url)){
    if(req.headers['x-player-token']!==token||(req.headers.origin&&req.headers.origin!==base))return reply(res,403,{error:'Request rejected'});
    let body='';req.on('data',c=>{body+=c;if(body.length>(req.url==='/import-animation'?2*1024*1024:8192))req.destroy();});
    req.on('end',()=>{try{
      if(req.url==='/settings')updateSettings(JSON.parse(body));
      else if(req.url==='/import-animation'){
        const data=animations.validate(JSON.parse(body));if(animations.list().some(a=>a.id===data.id))throw new Error('已有相同 ID 的动画，请更改文件中的 ID 后重试');
        const dir=path.join(settings.local,'animations');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,data.id+'.json'),JSON.stringify(data),{flag:'wx'});animations.register(data);
      }
      else if(req.url==='/scope'){const {scope,sessionId}=JSON.parse(body);if(!['global','current'].includes(scope))throw new Error('Invalid scope');const patch={scope};if(scope==='current'){const config=settings.read(),file=selectableSessions.get(sessionId)||(sessionId===config.sessionId?config.transcript:null);if(!file||!fs.existsSync(file))throw new Error('请先选择一个存在的本地任务');patch.sessionId=sessionId;patch.transcript=file;}settings.savePatch(patch);watcher?.close();mode='auto';setupWatch();}
      else if(req.url==='/auto'){mode='auto';refreshFollow();}
      else if(req.url==='/attention'){attention.accept(JSON.parse(body));refreshFollow();}
      else if(req.url==='/voice'){if(!initial.voiceEnabled)throw new Error('Voice monitoring is disabled');voice.accept(JSON.parse(body));applyFollow();}
      else if(req.url==='/state'){mode='manual';start(JSON.parse(body).state);}
      else {mode='manual';stop();}
      reply(res,200,status());
      if(req.url==='/shutdown')setTimeout(shutdown,100);
    }catch(e){lastError=e.message;reply(res,500,{...status(),error:e.message});}});return;
  }
  reply(res,404,{error:'Not found'});
});
function shutdown(){if(shuttingDown)return;shuttingDown=true;watcher?.close();clearInterval(voicePoll);audioObserver?.close();codexDial?.close();try{stop();}catch(e){console.error(e.message);}server.close(()=>process.exit());setTimeout(()=>process.exit(),1500).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
process.on('uncaughtException',e=>{console.error(e);shutdown();});
server.on('error',e=>{if(e.code==='EADDRINUSE')server.listen(0,'127.0.0.1');else shutdown();});
server.listen(initial.port,'127.0.0.1',()=>{
  const port=server.address().port;fs.writeFileSync(path.join(settings.local,'runtime.json'),JSON.stringify({port,pid:process.pid,url:`http://127.0.0.1:${port}`}));console.log(`PLAYER http://127.0.0.1:${port}`);
  setupWatch();
  if(process.env.YOGO_PARENT_PID){const parent=Number(process.env.YOGO_PARENT_PID);setInterval(()=>{try{process.kill(parent,0);}catch{shutdown();}},2000).unref();}
  setInterval(()=>{if(mode==='auto'&&!keyboard&&(voice.snapshot().active||['busy','waiting'].includes(follow?.state))){try{if(devices().length)applyFollow();}catch{}}},5000).unref();
  if(initial.voiceEnabled){audioObserver=new AudioObserver(voice,settings.local,refreshVoice);audioObserver.start();voicePoll=setInterval(refreshVoice,250);}
  if(initial.codexDialEnabled){codexDial=new CodexDial(settings.local);codexDial.start();}
});
function setupWatch(){
  try{
    const config=settings.read();
    if(config.scope==='current'&&(!config.sessionId||!config.transcript))throw new Error('仅当前任务需要在 config.json 设置 sessionId 和 transcript；请使用全局模式或手动试播。');
    const Watch=config.scope==='global'?GlobalWatcher:Watcher;
    watcher=new Watch(config,snapshot=>{
      const entries=watcher?.states?[...watcher.states.values()]:[snapshot];
      follow=attention.overlay(snapshot,entries,snapshot.scope==='当前任务'?snapshot.sessionId:null);
      // Deliberately omit conversation text and error messages from the audit trail.
      const log=path.join(settings.local,'events.jsonl');
      if(fs.existsSync(log)&&fs.statSync(log).size>1024*1024){fs.copyFileSync(log,log+'.previous');fs.writeFileSync(log,'');}
      fs.appendFileSync(log,JSON.stringify({at:new Date().toISOString(),scope:snapshot.scope,active:snapshot.active,failed:snapshot.failed,session:snapshot.sessionId,turn:snapshot.turnId,state:snapshot.state,event:snapshot.event,watchError:!!snapshot.error})+'\n');
      applyFollow();
    });watcher.start();
  }catch(e){follow={error:e.message,state:'stopped'};try{stop();}catch{}}}
