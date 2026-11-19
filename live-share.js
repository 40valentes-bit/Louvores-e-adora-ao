/* Compartilhamento ao Vivo — Louvores em Cifras
 * Líder único, até dez aparelhos no total, código temporário e canal privado.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const DEVICE_KEY='louvores_live_device_v1';
const deviceId=(()=>{let v=localStorage.getItem(DEVICE_KEY);if(!v){v=crypto.randomUUID();localStorage.setItem(DEVICE_KEY,v);}return v;})();
const deviceName=(()=>{const ua=navigator.userAgent||'';const platform=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iPhone/iPad':/Windows/i.test(ua)?'Notebook Windows':/Mac/i.test(ua)?'Mac': 'Aparelho';return platform+' • '+(navigator.platform||'web');})();
let channel=null,session=null,role=null,devices=[],stateTimer=null,heartbeat=null,lastPersist=0,applying=false,localSpeedOverride=false;
const MAX_DEVICES=10;
function cloud(){return window.LouvoresCloud||null;}
function client(){return cloud()&&cloud().getClient?cloud().getClient():null;}
function user(){return cloud()&&cloud().getUser?cloud().getUser():null;}
function approved(){return !!(cloud()&&cloud().isApproved&&cloud().isApproved());}
function say(msg,error){const el=$('liveShareStatus');if(el){el.textContent=msg;el.style.color=error?'#b42318':'#176b3a';}}
function el(tag,attrs={},txt=''){const n=document.createElement(tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(txt)n.textContent=txt;return n;}
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
 const input=el('input',{id:'liveJoinCode',inputmode:'numeric',maxlength:'8',placeholder:'Digite os 4 números',style:'width:100%;padding:12px;border:1px solid #d8e0ea;border-radius:10px'});
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
  const {data,error}=await c.rpc('create_live_session',{p_device_id:deviceId,p_device_name:deviceName});
  if(error)throw error;
  if(!data||!data.ok)throw new Error(data&&data.error?data.error:'Não foi possível criar a sessão.');
  session=data.session;role='leader';
  $('liveCodeValue').textContent=data.code;$('liveCodeBox').style.display='block';
  await connectChannel();await loadDevices();startHeartbeat();await refreshPanel();say('Sessão criada. Compartilhe o código de quatro números com até nove aparelhos.');
  $('liveShareModal').style.display='none';
 }catch(e){
  if(channel){try{await c.removeChannel(channel);}catch(_){}}channel=null;
  if(session&&role==='leader'){try{await c.from('live_sessions').delete().eq('id',session.id);}catch(_){ }}
  say('Não foi possível iniciar: '+(e.message||e),true);session=null;role=null;
 }
 finally{$('liveStartBtn').disabled=false;}
}
async function joinSession(){
 const c=client();if(!c||!approved())return;
 try{
  const invite=$('liveJoinCode').value.replace(/\D/g,'');
  if(!/^(?:\d{4}|\d{8})$/.test(invite))throw new Error('Informe o código de quatro números.');
  say('Verificando autorização…');$('liveJoinBtn').disabled=true;
  const {data,error}=await c.rpc('join_live_session',{
   p_code:invite,p_device_id:deviceId,p_device_name:deviceName
  });
  if(error)throw error;
  if(!data||!data.ok)throw new Error(data&&data.error?data.error:'Não foi possível autorizar este aparelho.');
  session=data.session;role='participant';localSpeedOverride=false;waitingScreen(true);
  await connectChannel();startHeartbeat();
  await loadDevices();await refreshPanel();say('Aparelho autorizado e conectado. Agora acompanha o aparelho principal.');
  $('liveShareModal').style.display='none';
 }catch(e){
  if(channel){try{await c.removeChannel(channel);}catch(_){}}channel=null;
  say('Não foi possível autorizar: '+(e.message||e),true);
  session=null;role=null;
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
  const circle=el('div',{style:'width:min(82vw,340px);aspect-ratio:1;border-radius:50%;overflow:hidden;background:#75bdf3;border:4px solid #e4b84f;box-shadow:0 12px 34px #0005;padding:0'});
  const logo=el('img',{alt:'Louvor e Adoração',src:'./identidade-louvor-adoracao.webp',style:'display:block;width:100%;height:100%;object-fit:contain;border-radius:50%'});
  circle.appendChild(logo);
  const exit=el('button',{type:'button',class:'live-swipe-exit',style:'margin-top:28px;width:min(86vw,340px);min-height:54px;border:1px solid #0668d2;border-radius:12px;background:#0878ed;color:#fff;font-size:16px;font-weight:800;touch-action:pan-y;user-select:none;-webkit-user-select:none'},'←  DESLIZE PARA A DIREITA PARA SAIR  →');
  screen.append(circle,exit);document.body.appendChild(screen);
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
 try{if(window.LouvoresApp&&window.LouvoresApp.applyLiveState){const incoming=localSpeedOverride?{...payload,scroll_speed:undefined}:payload;window.LouvoresApp.applyLiveState(incoming);}}
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
 devices=data||[];const now=Date.now();const online=d=>d.authorized&&(d.role==='leader'||(d.last_seen_at&&now-Date.parse(d.last_seen_at)<45000));const box=$('liveDeviceList');if(!box)return;box.replaceChildren(el('h3',{},'Aparelhos conectados ('+devices.filter(online).length+'/'+MAX_DEVICES+')'));
 devices.forEach(d=>{
  const line=el('div',{style:'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 0;border-top:1px solid #e2e8f0'});
  const status=d.authorized?(online(d)?'Conectado':'Autorizado — aguardando conexão'):'Revogado';
  const info=el('div',{},(d.device_name||'Aparelho')+(d.device_id===deviceId?' (este aparelho)':'')+' — '+(d.role==='leader'?'Principal':status));
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
async function leavePairing(){
 if(role!=='participant'||!session)return;
 const c=client(),activeSession=session;
 if(c){
  const {error}=await c.from('live_devices').delete().eq('session_id',activeSession.id).eq('device_id',deviceId);
  if(error){say('Não foi possível sair do pareamento: '+error.message,true);return;}
 }
 if(window.LouvoresApp&&window.LouvoresApp.leaveLiveParticipant)window.LouvoresApp.leaveLiveParticipant();
 await leaveLocal('Você saiu do pareamento. Para voltar, informe novamente o código do aparelho principal.');
}
async function leaveLocal(message){
 if(heartbeat)clearInterval(heartbeat);heartbeat=null;if(stateTimer)clearTimeout(stateTimer);stateTimer=null;localSpeedOverride=false;
 if(channel){const c=client();if(c)await c.removeChannel(channel);}channel=null;session=null;role=null;document.body.classList.remove('live-follower');waitingScreen(false);
 $('liveCodeBox').style.display='none';$('liveDeviceList').replaceChildren();await refreshPanel();say(message||'Conexão encerrada.');
}
let swipeStart=null;
function swipeTarget(target){return target&&target.closest('.live-swipe-exit,.back-button,.format-back-button');}
function swipeDirection(button){return button.classList.contains('live-swipe-exit')?1:-1;}
function beginSwipe(button,id,x){
 swipeStart={button,id,x};button.style.transition='none';
}
function moveSwipe(id,x,event){
 if(!swipeStart||swipeStart.id!==id)return;
 if(event&&event.cancelable)event.preventDefault();
 const dir=swipeDirection(swipeStart.button),distance=Math.max(0,(x-swipeStart.x)*dir);
 swipeStart.button.style.transform='translateX('+(dir*Math.min(distance,220))+'px)';
}
let suppressSwipeClick=false;
async function finishSwipe(id,x,cancelled){
 if(!swipeStart||swipeStart.id!==id)return;
 const item=swipeStart;swipeStart=null;
 const dx=(x-item.x)*swipeDirection(item.button);
 item.button.style.transition='transform .18s ease';item.button.style.transform='';
 if(!cancelled&&dx>Math.max(45,item.button.getBoundingClientRect().width*.16)){
  suppressSwipeClick=true;
  await leavePairing();
 }
}
// Mouse/pen use Pointer Events. Touch uses Touch Events because mobile browsers
// may emit pointercancel during a horizontal gesture before pointerup.
document.addEventListener('pointerdown',event=>{
 if(event.pointerType==='touch')return;
 const button=swipeTarget(event.target);
 if(role!=='participant'||!button)return;
 beginSwipe(button,event.pointerId,event.clientX);
},true);
document.addEventListener('pointermove',event=>{
 if(event.pointerType==='touch')return;
 moveSwipe(event.pointerId,event.clientX,event);
},{capture:true,passive:false});
document.addEventListener('pointerup',event=>{if(event.pointerType!=='touch')finishSwipe(event.pointerId,event.clientX,false);},true);
document.addEventListener('pointercancel',event=>{if(event.pointerType!=='touch')finishSwipe(event.pointerId,event.clientX,true);},true);
let touchSwipeId=null;
document.addEventListener('touchstart',event=>{
 if(role!=='participant'||swipeStart)return;
 const touch=event.changedTouches&&event.changedTouches[0],button=swipeTarget(event.target);
 if(!touch||!button)return;
 touchSwipeId=touch.identifier;
 beginSwipe(button,'touch-'+touch.identifier,touch.clientX);
},{capture:true,passive:true});
document.addEventListener('touchmove',event=>{
 if(!swipeStart||touchSwipeId===null)return;
 const touch=Array.from(event.changedTouches||[]).find(t=>t.identifier===touchSwipeId);
 if(!touch)return;
 moveSwipe('touch-'+touch.identifier,touch.clientX,event);
},{capture:true,passive:false});
document.addEventListener('touchend',event=>{
 if(touchSwipeId===null)return;
 const touch=Array.from(event.changedTouches||[]).find(t=>t.identifier===touchSwipeId);
 if(!touch)return;
 const id='touch-'+touch.identifier;touchSwipeId=null;
 finishSwipe(id,touch.clientX,false);
},{capture:true,passive:true});
document.addEventListener('touchcancel',event=>{
 if(touchSwipeId===null)return;
 const touch=Array.from(event.changedTouches||[]).find(t=>t.identifier===touchSwipeId);
 if(!touch)return;
 const id='touch-'+touch.identifier;touchSwipeId=null;
 finishSwipe(id,touch.clientX,true);
},{capture:true,passive:true});
document.addEventListener('click',event=>{
 if(role==='participant'&&event.target.closest('.scroll-speed-controls button')){localSpeedOverride=true;return;}
 if(suppressSwipeClick&&swipeTarget(event.target)){suppressSwipeClick=false;event.preventDefault();event.stopImmediatePropagation();return;}
 if(role==='participant'&&swipeTarget(event.target)){event.preventDefault();event.stopImmediatePropagation();return;}
 if(role==='participant'&&(event.target.closest('#layout')||event.target.closest('.song'))){event.preventDefault();event.stopImmediatePropagation();}
},true);
document.addEventListener('click',event=>{
 if(role==='leader'&&event.target.closest('#layout'))setTimeout(()=>publishState(true),60);
},true);
document.addEventListener('scroll',event=>{if(event.target&&event.target.id==='songReading')queuePublish();},true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&role==='leader')publishState(true);});
const style=el('style');style.textContent='.live-follower #detail .song-fixed-actions{opacity:1!important;pointer-events:auto!important;position:relative;z-index:1200!important}.live-follower #detail .song-fixed-actions .reading-toggle-control{pointer-events:none!important}.live-follower #detail .song-fixed-actions .scroll-speed-controls{pointer-events:auto!important;position:relative!important;z-index:1203!important}.live-follower #detail .song-fixed-actions .scroll-speed-controls button{pointer-events:auto!important;touch-action:manipulation!important}.live-follower #detail .song-fixed-actions .back-button{display:inline-flex!important;visibility:visible!important;opacity:1!important;position:relative!important;z-index:1204!important;background:#0878ed!important;color:#fff!important;border-color:#0668d2!important;pointer-events:auto!important;touch-action:none!important;user-select:none;-webkit-user-select:none}.live-follower #detail .format-tools{pointer-events:none!important}.live-follower #detail .format-tools .scroll-speed-controls{pointer-events:auto!important;position:relative!important;z-index:1203!important}.live-follower #detail .format-tools .scroll-speed-controls button{pointer-events:auto!important;touch-action:manipulation!important}.live-follower #detail .format-tools .format-back-button{opacity:1;background:#0878ed!important;color:#fff!important;border-color:#0668d2!important;pointer-events:auto!important;touch-action:none!important;user-select:none;-webkit-user-select:none}.live-swipe-exit{box-shadow:0 3px 10px #0004;touch-action:none!important}';document.head.appendChild(style);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
