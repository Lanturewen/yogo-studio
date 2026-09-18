'use strict';
const crypto=require('crypto');
const events=new Set(['PermissionRequest','PreToolUse','PostToolUse','Stop','Interrupt','SessionEnd']);
const isQuestion=name=>/^(?:functions\.)?request_user_input$/.test(name||'');
function stable(v){return Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;}
// Discard prompts, commands and answers before sending anything to the player.
function normalize(input){
  const event=input.hook_event_name,session=input.session_id,turn=input.turn_id||'';
  if(!events.has(event)||typeof session!=='string'||!session||session.length>128||typeof turn!=='string'||turn.length>128)return null;
  const tool=input.tool_name||'';
  if(event==='PreToolUse'&&!isQuestion(tool))return null;
  let args=input.tool_input||{};
  if(typeof args.command==='string')args={command:args.command};
  else if(args&&typeof args==='object'){args={...args};delete args.description;}
  const key=crypto.createHash('sha256').update(JSON.stringify([tool,stable(args)])).digest('hex');
  return {event,session,turn,key,question:isQuestion(tool)};
}
class Attention {
  constructor(){this.pending=new Map();this.lastEvent=null;}
  accept(e){
    if(!e||!events.has(e.event)||typeof e.session!=='string'||!e.session||e.session.length>128||typeof e.turn!=='string'||e.turn.length>128||!/^[a-f0-9]{64}$/.test(e.key)||typeof e.question!=='boolean')throw new Error('Invalid attention event');
    this.lastEvent=e.event;
    const id=JSON.stringify([e.session,e.turn,e.key]);
    if(e.event==='PermissionRequest'||e.event==='PreToolUse'&&e.question)this.pending.set(id,{...e,observed:false});
    else if(e.event==='PostToolUse')this.pending.delete(id);
    else if(['Stop','Interrupt','SessionEnd'].includes(e.event)){
      for(const [k,p] of this.pending)if(p.session===e.session&&(!e.turn||e.turn===p.turn))this.pending.delete(k);
    }
  }
  overlay(snapshot,entries,scopeSession){
    const known=new Map(entries.map(s=>[s.sessionId,s]));
    for(const [k,p] of this.pending){
      const s=known.get(p.session);
      if(s?.turnId===p.turn){p.observed=true;if(!['busy','waiting'].includes(s.state))this.pending.delete(k);}
      else if(p.observed&&s?.turnId)this.pending.delete(k);
    }
    const waiting=[...this.pending.values()].filter(p=>!scopeSession||p.session===scopeSession).length;
    return {...snapshot,waiting:(snapshot.waiting||0)+waiting,...(waiting?{state:'waiting'}:{})};
  }
}
module.exports={Attention,normalize,isQuestion};
