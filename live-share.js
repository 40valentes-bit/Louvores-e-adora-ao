/* Compartilhamento ao Vivo — Louvores em Cifras
 * Líder único, até cinco aparelhos no total, código temporário e canal privado.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const DEVICE_KEY='louvores_live_device_v1';
const deviceId=(()=>{let v=localStorage.getItem(DEVICE_KEY);if(!v){v=crypto.randomUUID();localStorage.setItem(DEVICE_KEY,v);}return v;})();
const deviceName=(()=>{const ua=navigator.userAgent||'';const platform=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iPhone/iPad':/Windows/i.test(ua)?'Notebook Windows':/Mac/i.test(ua)?'Mac': 'Aparelho';return platform+' • '+(navigator.platform||'web');})();
let channel=null,session=null,role=null,devices=[],stateTimer=null,heartbeat=null,lastPersist=0,applying=false;
const MAX_DEVICES=5;
function cloud(){return window.LouvoresCloud||null;}
function client(){return cloud()&&cloud().getClient?cloud().getClient():null;}
function user(){return cloud()&&cloud().getUser?cloud().getUser():null;}
function approved(){return !!(cloud()&&cloud().isApproved&&cloud().isApproved());}
function say(msg,error){const el=$('liveShareStatus');if(el){el.textContent=msg;el.style.color=error?'#b42318':'#176b3a';}}
function el(tag,attrs={},txt=''){const n=document.createElement(tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(txt)n.textContent=txt;return n;}
async function digest(value){const bytes=new TextEncoder().encode(value);const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');}
function code(){const n=new Uint32Array(1);crypto.getRandomValues(n);return String(n[0]%100000000).padStart(8,'0');}
function mount(){
 const toolbar=document.querySelector('.toolbar');if(!toolbar||$('liveShareBtn'))return;
 const open=el('button',{id:'liveShareBtn',type:'button',class:'soft'},'◉ Compartilhamento ao vivo');toolbar.appendChild(open);
 const modal=el('div',{id:'liveShareModal',style:'display:none;position:fixed;inset:0;background:#07182dcc;z-index:100000;align-items:center;justify-content:center;padding:14px;'});
 const panel=el('section',{style:'background:#fff;color:#172235;width:min(100%,480px);max-height:92vh;overflow:auto;border-radius:18px;padding:20px;box-shadow:0 15px 50px #0005'});
 const title=el('h2',{},'Compartilhamento ao Vivo');
 const status=el('p',{id:'liveShareStatus',role:'status'},'Conecte os aparelhos à mesma conta Louvores para começar.');
 const leader=el('button',{id:'liveStartBtn',type:'button',class:'primary',style:'width:100%;margin:8px 0'},'Iniciar como aparelho principal');
 const joinWrap=el('div',{style:'border-top:1px solid #e2e8f0;margin-top:14px;padding-top:12px'});
 joinWrap.append(el('label',{},'Código de autorização do aparelho principal'));
 const input=el('input',{id:'liveJoinCode',inputmode:'numeric',maxlength:'8',placeholder:'Digite os 8 números',style:'width:100%;padding:12px;border:1px solid #d8e0ea;border-radius:10px'});
 const join=el('button',{id:'liveJoinBtn',type:'button',class:'soft',style:'width:100%;margin-top:8px'},'Autorizar este aparelho');
 joinWrap.append(input,join);
 const codeBox=el('div',{id:'liveCodeBox',style:'display:none;background:#eef5ff;border:1px solid #c7dcf5;border-radius:12px;padding:12px;margin:12px 0;text-align:center'});
 const codeLabel=el('div',{style:'font-size:12px;color:#536171'},'Código temporário para os outros aparelhos');
 const codeValue=el('strong',{id:'liveCodeValue',style:'display:block;font-size:30px;letter-spacing:5px;color:#174a78;margin:5px 0'},'');
 const copy=el('button',{id:'liveCopyCode',type:'button',class:'soft'},'Copiar código');
 codeBox.append(codeLabel,codeValue,copy);
 const list=el('div',{id:'liveDeviceList',style:'margin-top:14px'});
 const stop=el('button',{id:'liveStopBtn',type:'button',style:'display:none;width:100%;margin-top:12px;background:#fee2e2;color:#991b1b'},'Encerrar compartilhamento');
 const close=el('button',{id:'liveCloseBtn',type:'button',class:'soft',style:'width:100%;margin-top:10px'},'Fechar');
 panel.append(title,status,leader,joinWrap,codeBox,list,stop,close);modal.appendChild(panel);document.body.appendChild(modal);
 open.onclick=()=>{modal.style.display='flex';refreshPanel();};
 close.onclick=()=>modal.style.display='none';
 leader.onclick=startAsLeader;join.onclick=joinSession;stop.onclick=endSession;
 copy.onclick=()=>{const v=$('liveCodeValue').textContent;navigator.clipboard&&navigator.clipboard.writeText(v).then(()=>say('Código copiado.'));};
}
async function refreshPanel(){
 const c=client(),u=user();
 if(!c||!u||!approved()){say('Entre na Conta / nuvem e confirme que o acesso está aprovado.',true);$('liveStartBtn').disabled=true;$('liveJoinBtn').disabled=true;return;}
 $('liveStartBtn').disabled=false;$('liveJoinBtn').disabled=false;
 if(session){$('liveStartBtn').style.display=role==='leader'?'block':'none';$('liveJoinBtn').style.display='none';$('liveStopBtn').style.display=role==='leader'?'block':'none';await loadDevices();say(role==='leader'?'Este aparelho é o principal. Os demais acompanham sua leitura.':'Aparelho conectado como participante.');}
 else{$('liveStartBtn').style.display='block';$('liveJoinBtn').style.display='block';$('liveStopBtn').style.display='none';$('liveCodeBox').style.display='none';$('liveDeviceList').replaceChildren();say('Inicie no aparelho principal ou informe o código recebido.');}
}
async function startAsLeader(){
 const c=client(),u=user();if(!c||!u||!approved())return;
 try{
  $('liveStartBtn').disabled=true;say('Criando sessão segura…');
  const invite=code(),hash=await digest(invite);
  const {data,error}=await c.from('live_sessions').insert({owner_id:u.id,leader_device_id:deviceId,invite_code_hash:hash}).select('*').single();
  if(error)throw error;
  session=data;role='leader';
  const {error:deviceError}=await c.from('live_devices').insert({session_id:session.id,device_id:deviceId,device_name:deviceName,role:'leader',authorized:true});
  if(deviceError)throw deviceError;
  $('liveCodeValue').textContent=invite;$('liveCodeBox').style.display='block';
  await connectChannel();await loadDevices();startHeartbeat();await refreshPanel();say('Sessão criada. Compartilhe o código com até quatro aparelhos.');
  $('liveShareModal').style.display='none';
 }catch(e){
  if(channel){try{await c.removeChannel(channel);}catch(_){}}channel=null;
  if(session&&role==='leader'){try{await c.from('live_sessions').delete().eq('id',session.id);}catch(_){}}
  say('Não foi possível iniciar: '+(e.message||e),true);session=null;role=null;
 }
 finally{$('liveStartBtn').disabled=false;}
}
async function joinSession(){
 const c=client();if(!c||!approved())return;
 try{
  const invite=$('liveJoinCode').value.replace(/\D/g,'');
  if(invite.length!==8)throw new Error('O código deve ter 8 números.');
  say('Verificando autorização…');$('liveJoinBtn').disabled=true;
  const hash=await digest(invite);
  const {data,error}=await c.from('live_sessions').select('*').eq('invite_code_hash',hash).eq('status','active').maybeSingle();
  if(error)throw error;if(!data)throw new Error('Código inválido ou sessão encerrada.');
  const {data:existing,error:existingError}=await c.from('live_devices').select('authorized').eq('session_id',data.id).eq('device_id',deviceId).maybeSingle();
  if(existingError)throw existingError;
  if(existing&&!existing.authorized)throw new Error('Este aparelho teve o acesso revogado pelo principal.');
  if(!existing){
   const {count,error:countError}=await c.from('live_devices').select('*',{count:'exact',head:true}).eq('session_id',data.id).eq('authorized',true);
   if(countError)throw countError;
   if((count||0)>=MAX_DEVICES)throw new Error('Esta sessão já atingiu o limite de cinco aparelhos.');
   const {error:deviceError}=await c.from('live_devices').insert({session_id:data.id,device_id:deviceId,device_name:deviceName,role:'participant',authorized:true});
   if(deviceError)throw deviceError;
  }else{
   const {error:touchError}=await c.from('live_devices').update({last_seen_at:new Date().toISOString()}).eq('session_id',data.id).eq('device_id',deviceId);
   if(touchError)throw touchError;
  }
  session=data;role='participant';await connectChannel();startHeartbeat();
  const {data:latest,error:stateError}=await c.from('live_sessions').select('*').eq('id',session.id).single();
  if(!stateError&&latest)applyState(latest);
  await loadDevices();await refreshPanel();say('Aparelho autorizado e conectado. Agora acompanha o aparelho principal.');
  $('liveShareModal').style.display='none';
 }catch(e){
  if(channel){try{await c.removeChannel(channel);}catch(_){}}channel=null;
  if(session&&role==='participant'){try{await c.from('live_devices').delete().eq('session_id',session.id).eq('device_id',deviceId);}catch(_){}}
  session=null;role=null;document.body.classList.remove('live-follower');
  say('Não foi possível conectar: '+(e.message||e),true);
 }
 finally{$('liveJoinBtn').disabled=false;}
}
async function connectChannel(){
 const c=client();if(!c)throw new Error('Conta Louvores não conectada.');
 if(c.realtime&&typeof c.realtime.setAuth==='function')await c.realtime.setAuth();
 if(channel)await c.removeChannel(channel);
 channel=c.channel('louvores-live:'+session.id,{config:{private:true,presence:{key:deviceId}}});
 channel.on('broadcast',{event:'state'},({payload})=>{if(role==='participant')applyState(payload);});
 channel.on('broadcast',{event:'revoke'},({payload})=>{if(role==='participant'&&payload&&(payload.device_id===deviceId||payload.device_id==='*')){leaveLocal('O aparelho principal revogou este acesso.');}});
 
 await new Promise((resolve,reject)=>channel.subscribe(status=>{if(status==='SUBSCRIBED')resolve();if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')reject(new Error('Falha ao conectar o canal privado. Verifique a autorização Realtime do Supabase.'));}));

 if(role==='leader')publishState(true);
 document.body.classList.toggle('live-follower',role==='participant');
}
function waitingScreen(show){
 let screen=$('liveWaitingScreen');
 if(!screen){
  screen=el('div',{id:'liveWaitingScreen',style:'display:none;position:fixed;inset:0;z-index:200000;background:#102b52;color:#fff;align-items:center;justify-content:center;padding:20px;text-align:center'});
  const circle=el('div',{style:'width:min(82vw,340px);aspect-ratio:1;border-radius:50%;background:linear-gradient(145deg,#1d5795,#102b52);border:4px solid #e4b84f;box-shadow:0 12px 34px #0005;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:34px'});
  const brand=el('div',{style:'font-size:clamp(22px,5.5vw,30px);font-weight:800;letter-spacing:1px;line-height:1.2'},'LOUVOR E ADORAÇÃO');
  const message=el('div',{style:'font-size:clamp(17px,4.3vw,22px);font-weight:600;line-height:1.3'},'Aguardando a próxima música...');
  circle.append(brand,message);screen.appendChild(circle);document.body.appendChild(screen);
 }
 screen.style.display=show?'flex':'none';
}
function applyState(payload){
 if(!payload)return;
 // Participantes só abrem a música quando o principal inicia a apresentação.
 // Antes disso, permanecem na tela circular de espera.
 if(role==='participant')waitingScreen(!payload.song_key||payload.presentation_active!==true);
 // A aplicação do estado é síncrona. Não manter bloqueio artificial de 100 ms:
 // isso descartava comandos PAUSAR/ROLAR que chegavam durante atualizações da rolagem.
 applying=true;
 try{if(window.LouvoresApp&&window.LouvoresApp.applyLiveState)window.LouvoresApp.applyLiveState(payload);}
 finally{applying=false;}
}
async function publishState(force){
 if(role!=='leader'||!channel||!session||applying)return;
 const app=window.LouvoresApp;if(!app||!app.getLiveState)return;
 const state={...app.getLiveState(),updated_at:new Date().toISOString()};
 try{await channel.send({type:'broadcast',event:'state',payload:state});}catch(e){console.warn('Falha ao transmitir estado:',e);}
 const now=Date.now();
 if(force||now-lastPersist>1000){
  lastPersist=now;
  const {error}=await client().from('live_sessions').update({song_key:state.song_key,song_title:state.song_title,scroll_top:state.scroll_top,scroll_speed:state.scroll_speed,is_scrolling:state.is_scrolling,state_version:Date.now(),updated_at:state.updated_at}).eq('id',session.id);
  if(error)console.warn('Falha ao salvar estado da sessão:',error.message);
 }
}
function queuePublish(){
 if(role!=='leader'||applying||stateTimer)return;
 stateTimer=setTimeout(()=>{stateTimer=null;publishState(false);},90);
}
async function loadDevices(){
 if(!session||!client())return;
 const {data,error}=await client().from('live_devices').select('device_id,device_name,role,authorized,last_seen_at').eq('session_id',session.id).order('created_at');
 if(error){say('Não foi possível listar os aparelhos: '+error.message,true);return;}
 devices=data||[];const box=$('liveDeviceList');if(!box)return;box.replaceChildren(el('h3',{},'Aparelhos autorizados ('+devices.filter(d=>d.authorized).length+'/'+MAX_DEVICES+')'));
 devices.forEach(d=>{
  const line=el('div',{style:'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 0;border-top:1px solid #e2e8f0'});
  const info=el('div',{},(d.device_name||'Aparelho')+(d.device_id===deviceId?' (este aparelho)':'')+' — '+(d.role==='leader'?'Principal':d.authorized?'Conectado':'Revogado'));
  line.appendChild(info);
  if(role==='leader'&&d.role!=='leader'&&d.authorized){
   const revoke=el('button',{type:'button',class:'soft',style:'font-size:12px;padding:7px 9px'},'Revogar');
   revoke.onclick=()=>revokeDevice(d.device_id);line.appendChild(revoke);
  }
  box.appendChild(line);
 });
}
async function revokeDevice(id){
 if(role!=='leader'||!session)return;
 const {error}=await client().from('live_devices').update({authorized:false}).eq('session_id',session.id).eq('device_id',id);
 if(error){say('Não foi possível revogar: '+error.message,true);return;}
 if(channel)await channel.send({type:'broadcast',event:'revoke',payload:{device_id:id}});
 await loadDevices();say('Acesso do aparelho revogado.');
}
function startHeartbeat(){
 if(heartbeat)clearInterval(heartbeat);
 heartbeat=setInterval(async()=>{
  if(!session||!client())return;
  await client().from('live_devices').update({last_seen_at:new Date().toISOString()}).eq('session_id',session.id).eq('device_id',deviceId);
 },15000);
}
async function endSession(){
 if(role!=='leader'||!session)return;
 try{
  if(channel)await channel.send({type:'broadcast',event:'revoke',payload:{device_id:'*'}});
  const {error}=await client().from('live_sessions').update({status:'ended',is_scrolling:false,updated_at:new Date().toISOString()}).eq('id',session.id);
  if(error)throw error;
 }catch(e){say('A sessão não foi encerrada corretamente: '+(e.message||e),true);return;}
 await leaveLocal('Compartilhamento encerrado.');
}
async function leaveLocal(message){
 if(heartbeat)clearInterval(heartbeat);heartbeat=null;if(stateTimer)clearTimeout(stateTimer);stateTimer=null;
 if(channel){const c=client();if(c)await c.removeChannel(channel);}channel=null;session=null;role=null;document.body.classList.remove('live-follower');waitingScreen(false);
 $('liveCodeBox').style.display='none';$('liveDeviceList').replaceChildren();await refreshPanel();say(message||'Conexão encerrada.');
}
document.addEventListener('click',event=>{
 if(role==='participant'&&(event.target.closest('#layout')||event.target.closest('.song'))){event.preventDefault();event.stopImmediatePropagation();}
},true);
document.addEventListener('click',event=>{
 if(role==='leader'&&event.target.closest('#layout'))setTimeout(()=>publishState(true),60);
},true);
document.addEventListener('scroll',event=>{if(event.target&&event.target.id==='songReading')queuePublish();},true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&role==='leader')publishState(true);});
const style=el('style');style.textContent='.live-follower #detail .song-fixed-actions{opacity:.45;pointer-events:none!important}.live-follower #detail .format-tools{pointer-events:none!important}';document.head.appendChild(style);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
