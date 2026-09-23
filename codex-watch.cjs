'use strict';
const fs=require('fs');
const path=require('path');
const {StringDecoder}=require('string_decoder');
const {isQuestion}=require('./attention.cjs');
const RECONCILE_IDLE_MS=60*1000;
const STALE_ACTIVE_MS=15*60*1000;

// Only structured lifecycle events count. Tool output and assistant prose never do.
function fatal(error){
  const info=error?.codex_error_info;
  const code=typeof info==='string'?info:Object.keys(info||{})[0];
  return !['thread_rollback_failed','active_turn_not_steerable'].includes(code);
}
class Lifecycle {
  constructor(sessionId){this.sessionId=sessionId;this.reset();}
  reset(){this.valid=false;this.turn=null;this.state='stopped';this.event='waiting';this.seen=new Set();this.questions=new Set();}
  accept(row){
    if(row.type==='session_meta'){this.valid=row.payload?.id===this.sessionId;return false;}
    if(!this.valid)return false;
    if(row.type==='response_item'&&['busy','waiting'].includes(this.state)){
      const p=row.payload||{},before=this.key();
      if(p.type==='function_call'&&isQuestion(p.name)&&p.call_id){this.questions.add(p.call_id);this.state='waiting';this.event='user_input_requested';}
      if(p.type==='function_call_output'&&this.questions.delete(p.call_id)){this.state=this.questions.size?'waiting':'busy';this.event='user_input_returned';}
      return before!==this.key();
    }
    if(row.type!=='event_msg')return false;
    const p=row.payload||{},before=this.key();
    if(p.type==='task_started'&&p.turn_id&&!this.seen.has(p.turn_id)){
      this.seen.add(p.turn_id);if(this.seen.size>2048)this.seen.delete(this.seen.values().next().value);
      this.turn=p.turn_id;this.state='busy';this.event=p.type;this.questions.clear();
    }else if(this.turn&&(!p.turn_id||p.turn_id===this.turn)){
      if(p.type==='task_complete'&&['busy','waiting'].includes(this.state)){
        this.state=p.error&&fatal(p.error)?'error':'done';this.event=p.type;
      }else if(p.type==='turn_aborted'&&['busy','waiting','error'].includes(this.state)){
        this.state='stopped';this.event=p.type;
      }else if(p.type==='error'&&['busy','waiting'].includes(this.state)&&p.will_retry!==true&&fatal(p)){
        this.state='error';this.event=p.type;
      }
    }
    return before!==this.key();
  }
  key(){return `${this.turn}:${this.state}`;}
  snapshot(){return {sessionId:this.sessionId,turnId:this.turn,state:this.state,event:this.event};}
}

class Watcher {
  constructor(config,onChange){
    this.config=config;this.onChange=onChange;this.lifecycle=new Lifecycle(config.sessionId);
    this.offset=0;this.decoder=new StringDecoder('utf8');this.pending='';this.error='';this.timer=null;this.ready=false;this.lastReconciledAt=0;
  }
  read(){
    const stat=fs.statSync(this.config.transcript);
    if(stat.size===this.offset&&this.lifecycle.valid)return;
    if(stat.size<this.offset){this.offset=0;this.pending='';this.decoder=new StringDecoder('utf8');this.lifecycle.reset();}
    const fd=fs.openSync(this.config.transcript,'r');
    try{
      const buffer=Buffer.alloc(256*1024);
      while(this.offset<stat.size){
        const n=fs.readSync(fd,buffer,0,Math.min(buffer.length,stat.size-this.offset),this.offset);if(!n)break;
        this.offset+=n;this.pending+=this.decoder.write(buffer.subarray(0,n));
        let pos;while((pos=this.pending.indexOf('\n'))!==-1){
          const line=this.pending.slice(0,pos);this.pending=this.pending.slice(pos+1);
          if(!line.trim())continue;
          // Fail visibly on corrupt records, never infer a successful completion.
          this.lifecycle.accept(JSON.parse(line));
        }
      }
    }finally{fs.closeSync(fd);}
    if(!this.lifecycle.valid)throw new Error('会话标识不匹配');
  }
  poll(){
    const previous=this.lifecycle.key(),previousError=this.error;
    try{this.read();this.error='';}catch(e){this.error=e.code==='ENOENT'?'找不到所选会话文件':e.message;}
    if(!this.ready||previous!==this.lifecycle.key()||previousError!==this.error){
      const initial=!this.ready;this.ready=true;
      // Do not play a historical success/error when starting the player.
      if(initial&&!['busy','waiting'].includes(this.lifecycle.state))this.lifecycle.state='stopped';
      this.onChange(this.snapshot());
    }
  }
  snapshot(){return {...this.lifecycle.snapshot(),error:this.error,scope:'当前任务',offset:this.offset};}
  reconcile(){
    const fresh=new Watcher(this.config,()=>{});
    fresh.read();
    const before=this.lifecycle.key();
    this.lifecycle=fresh.lifecycle;this.offset=fresh.offset;this.pending=fresh.pending;this.decoder=fresh.decoder;
    this.lastReconciledAt=Date.now();
    if(before!==this.lifecycle.key())this.onChange(this.snapshot());
  }
  start(){this.poll();this.timer=setInterval(()=>this.poll(),500);}
  close(){clearInterval(this.timer);}
}
function aggregate(entries){
  const values=[...entries];
  const active=values.filter(x=>x.state==='busy').length;
  const waiting=values.filter(x=>x.state==='waiting').length;
  const failed=values.filter(x=>x.state==='error').length;
  return {state:waiting?'waiting':active?'busy':failed?'error':values.some(x=>x.state==='done')?'done':'stopped',active,failed,waiting};
}
class GlobalWatcher {
  constructor(config,onChange){this.config=config;this.onChange=onChange;this.watchers=new Map();this.states=new Map();this.error='';this.last='';this.scanAt=0;}
  discover(){
    const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      const file=path.join(dir,e.name);if(e.isDirectory())walk(file);
      else if(e.name.endsWith('.jsonl')&&!this.watchers.has(file)){
        const fd=fs.openSync(file,'r'),buf=Buffer.alloc(256*1024);let n;try{n=fs.readSync(fd,buf,0,buf.length,0);}finally{fs.closeSync(fd);}
        const newline=buf.subarray(0,n).indexOf(10);if(newline<0)continue;
        let meta;try{meta=JSON.parse(buf.subarray(0,newline).toString('utf8'));}catch{continue;}
        if(meta.type!=='session_meta'||!meta.payload?.id)continue;
        const w=new Watcher({sessionId:meta.payload.id,transcript:file},s=>{
          // A new batch starts after all previous work has settled. Clear past results.
          if(['busy','waiting'].includes(s.state)&&!['busy','waiting'].includes(this.states.get(file)?.state)&&![...this.states.values()].some(x=>['busy','waiting'].includes(x.state)))this.states.clear();
          this.states.set(file,s);
        });
        // Old archives are baselined once, then still watched for resumed work.
        const stat=fs.statSync(file);
        if(Date.now()-stat.mtimeMs>24*60*60*1000){w.offset=stat.size;w.lifecycle.accept(meta);w.ready=true;}
        this.watchers.set(file,w);
      }
    }};walk(this.config.sessionsRoot);
  }
  poll(){
    try{
      if(Date.now()-this.scanAt>5000){this.discover();this.scanAt=Date.now();}
      this.error='';
      for(const [file,w] of this.watchers){
        w.poll();
        if(w.error){this.states.delete(file);if(!fs.existsSync(file))this.watchers.delete(file);else this.error='部分会话读取异常';}
        else if(['busy','waiting'].includes(w.lifecycle.state)){
          const age=Date.now()-fs.statSync(file).mtimeMs;
          if(age>=RECONCILE_IDLE_MS&&Date.now()-w.lastReconciledAt>=RECONCILE_IDLE_MS){try{w.reconcile();}catch{this.error='部分会话读取异常';}}
          if(['busy','waiting'].includes(w.lifecycle.state)){
            if(age>=STALE_ACTIVE_MS)this.states.delete(file);
            else if(!this.states.has(file))this.states.set(file,w.snapshot());
          }
        }
      }
    }catch(e){this.error=e.message;}
    const s=this.snapshot(),key=JSON.stringify(s);
    if(key!==this.last){this.last=key;this.onChange(s);}
  }
  snapshot(){return {...aggregate(this.states.values()),scope:'全局任务',tracked:this.watchers.size,error:this.error};}
  start(){this.poll();this.timer=setInterval(()=>this.poll(),1000);}
  close(){clearInterval(this.timer);}
}
module.exports={Lifecycle,Watcher,GlobalWatcher,aggregate};
