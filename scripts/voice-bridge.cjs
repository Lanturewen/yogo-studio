'use strict';
// Send newline-delimited {active,level} from an application's capture callbacks.
// Usage: node scripts/voice-bridge.cjs provider-id [data-directory]
const readline=require('readline'),{connect}=require('../voice-client.cjs');
(async()=>{
 const providerId=process.argv[2];if(!providerId)throw Error('Usage: voice-bridge.cjs provider-id [data-directory]');
 const client=await connect({dataDir:process.argv[3]});let active=false,level=null,busy=false,heartbeat,lastInput=0,pending=Promise.resolve();
 const send=()=>{if(busy)return pending;busy=true;pending=client.capture(providerId,active,level).finally(()=>{busy=false;});return pending;};
 heartbeat=setInterval(()=>{if(!active)return;if(Date.now()-lastInput>1500){active=false;level=null;}send().catch(e=>console.error(e.message));},500);
 try{for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
  if(line.length>4096)throw Error('Capture event too long');const event=JSON.parse(line);
  if(typeof event.active!=='boolean'||event.level!=null&&(typeof event.level!=='number'||!Number.isFinite(event.level)||event.level<0||event.level>1))throw Error('Invalid capture event');
  active=event.active;level=event.level??null;lastInput=Date.now();await send();
 }}finally{clearInterval(heartbeat);await pending.catch(()=>{});await client.capture(providerId,false,null);}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
