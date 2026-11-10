/* Integração Supabase: autenticação, aprovação, músicas compartilhadas e favoritos. */
(function(){
'use strict';
const SUPABASE_URL='https://cwnybkcrlljebabxscvc.supabase.co';
const SUPABASE_KEY='sb_publishable_bn_5QG9VFRoZKx49R0_zWA_R2Tbbi';
const ADMIN_EMAIL='binhabh10@gmail.com';
let client=null,user=null,approved=false,syncBusy=false;
const byId=id=>document.getElementById(id);
function node(tag,attrs={},textValue=''){
 const n=document.createElement(tag);
 Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));
 if(textValue)n.textContent=textValue;
 return n;
}
function status(message,error=false){
 const n=byId('cloudStatus');
 if(n){n.textContent=message;n.style.color=error?'#b42318':'#176b3a';}
}
function mount(){
 const toolbar=document.querySelector('.toolbar');
 if(!toolbar||byId('cloudAccountBtn'))return;
 const open=node('button',{id:'cloudAccountBtn',type:'button',class:'soft'},'☁ Conta / nuvem');
 toolbar.appendChild(open);
 const modal=node('div',{id:'cloudAccountModal',style:'display:none;position:fixed;inset:0;background:#07182dcc;z-index:99999;align-items:center;justify-content:center;padding:18px;'});
 const panel=node('section',{style:'background:white;color:#172235;width:min(100%,440px);max-height:90vh;overflow:auto;border-radius:18px;padding:22px;box-shadow:0 15px 50px #0005'});
 const heading=node('h2',{},'Conta Louvores');
 const msg=node('p',{id:'cloudStatus',role:'status'},'Entre ou crie uma conta. A biblioteca local continua protegida.');
 const emailLabel=node('label',{},'E-mail');
 const email=node('input',{id:'cloudEmail',type:'email',autocomplete:'email',style:'display:block;margin:6px 0 12px;width:100%'});
 const passLabel=node('label',{},'Senha');
 const password=node('input',{id:'cloudPassword',type:'password',autocomplete:'current-password',style:'display:block;margin:6px 0 14px;width:100%'});
 emailLabel.appendChild(email);passLabel.appendChild(password);
 const actions=node('div',{style:'display:flex;gap:8px;flex-wrap:wrap'});
 const login=node('button',{id:'cloudLogin',type:'button'},'Entrar');
 const signup=node('button',{id:'cloudSignup',type:'button',class:'soft'},'Criar conta');
 const logout=node('button',{id:'cloudLogout',type:'button',class:'soft',style:'display:none'},'Sair');
 const close=node('button',{id:'cloudClose',type:'button',class:'soft'},'Fechar');
 actions.append(login,signup,logout,close);
 const tools=node('div',{id:'cloudSyncActions',style:'display:none;margin-top:14px;border-top:1px solid #ddd;padding-top:12px'});
 const sync=node('button',{id:'cloudSync',type:'button'},'Sincronizar músicas e favoritos');
 const syncInfo=node('p',{},'A sincronização acrescenta músicas compartilhadas sem substituir as músicas locais. Músicas que você cadastrar daqui em diante serão publicadas automaticamente quando sua conta estiver aprovada.');
 tools.append(sync,syncInfo);
 const admin=node('div',{id:'cloudAdmin',style:'margin-top:14px'});
 panel.append(heading,msg,emailLabel,passLabel,actions,tools,admin);modal.appendChild(panel);document.body.appendChild(modal);
 open.onclick=()=>{modal.style.display='flex';refresh();};
 close.onclick=()=>modal.style.display='none';
 login.onclick=doLogin;signup.onclick=doSignup;logout.onclick=doLogout;sync.onclick=syncAll;
}
async function refresh(){
 if(!client){status('Conectando ao serviço de contas…');return;}
 byId('cloudSyncActions').style.display=approved?'block':'none';
 byId('cloudLogout').style.display=user?'inline-block':'none';
 byId('cloudAdmin').replaceChildren();
 if(!user){approved=false;status('Entre ou crie uma conta. A biblioteca local continua protegida.');return;}
 byId('cloudEmail').value=user.email||'';
 await checkApproval();
}
async function checkApproval(){
 const {data,error}=await client.from('user_approvals').select('approved').eq('user_id',user.id).maybeSingle();
 if(error){approved=false;status('Não foi possível consultar a aprovação: '+error.message,true);return;}
 approved=!!(data&&data.approved)||((user.email||'').toLowerCase()===ADMIN_EMAIL);
 if(approved){
  status('Acesso aprovado para '+user.email+'. Sincronização disponível.');
  byId('cloudSyncActions').style.display='block';
  saveSettings().catch(e=>console.warn('Favoritos ainda não sincronizados:',e));
 }else{
  status('Cadastro recebido. Aguardando aprovação do administrador.');
  byId('cloudSyncActions').style.display='none';
 }
 if((user.email||'').toLowerCase()===ADMIN_EMAIL)loadPending();
}
async function doLogin(){
 const email=byId('cloudEmail').value.trim(),password=byId('cloudPassword').value;
 const {data,error}=await client.auth.signInWithPassword({email,password});
 if(error){status('Não foi possível entrar: '+error.message,true);return;}
 user=data.user;await refresh();
}
async function doSignup(){
 const email=byId('cloudEmail').value.trim(),password=byId('cloudPassword').value;
 if(!email||password.length<6){status('Informe um e-mail válido e uma senha com pelo menos 6 caracteres.',true);return;}
 const {data,error}=await client.auth.signUp({email,password});
 if(error){status('Não foi possível criar a conta: '+error.message,true);return;}
 user=data.user||null;
 status('Cadastro enviado. Confirme o e-mail, se solicitado. Depois o administrador deverá aprovar o acesso.');
 if(user)await checkApproval();
}
async function doLogout(){
 await client.auth.signOut();user=null;approved=false;byId('cloudSyncActions').style.display='none';byId('cloudAdmin').replaceChildren();status('Você saiu da conta.');
}
async function loadPending(){
 const box=byId('cloudAdmin');box.replaceChildren(node('h3',{},'Aprovar novos usuários'));
 const {data,error}=await client.from('user_approvals').select('user_id,email,created_at').eq('approved',false).order('created_at');
 if(error){box.appendChild(node('p',{},'Não foi possível listar pendências: '+error.message));return;}
 if(!data||!data.length){box.appendChild(node('p',{},'Nenhum cadastro pendente.'));return;}
 data.forEach(row=>{
  const line=node('div',{style:'display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 0;border-top:1px solid #ddd'});
  const label=node('span',{},row.email||row.user_id);
  const button=node('button',{type:'button'},'Aprovar');
  button.onclick=async()=>{
   button.disabled=true;
   const {error}=await client.from('user_approvals').update({approved:true,approved_at:new Date().toISOString()}).eq('user_id',row.user_id);
   if(error){button.disabled=false;status('Falha ao aprovar: '+error.message,true);}
   else{line.remove();status('Usuário aprovado.');}
  };
  line.append(label,button);box.appendChild(line);
 });
}
function songKey(s){return String(s.title||'').trim().toLocaleLowerCase('pt-BR')+'|'+String(s.artist||'').trim().toLocaleLowerCase('pt-BR');}
function toCloudSong(s){
 return {owner_id:user.id,title:s.title,artist:s.artist||'',category:s.category||'',musical_key:s.key||'',capo:s.capo||'',chords:s.chords||'',chord_color:s.chordColor||'',lyric_color:s.lyricColor||'',font_family:s.fontFamily||'',bold:!!s.bold,source_local_id:String(s.id)};
}
async function publishSong(song){
 if(!client||!user||!approved||!song||!song.title)return false;
 const row=toCloudSong(song);
 const {error}=await client.from('shared_songs').upsert(row,{onConflict:'owner_id,source_local_id'});
 if(error){status('A música ficou salva neste aparelho, mas não foi enviada à nuvem: '+error.message,true);return false;}
 return true;
}
async function saveSettings(){
 if(!client||!user||!approved)return;
 const favorites=(window.LouvoresApp&&window.LouvoresApp.getFavorites?window.LouvoresApp.getFavorites():[]);
 const favKeys=favorites.map(id=>{
  const song=window.LouvoresApp.getSongs().find(s=>String(s.id)===String(id));
  return song?songKey(song):null;
 }).filter(Boolean);
 const {error}=await client.from('user_settings').upsert({user_id:user.id,settings:{favorite_song_keys:favKeys},updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(error)throw error;
}
async function syncAll(){
 if(syncBusy||!approved)return;
 syncBusy=true;byId('cloudSync').disabled=true;status('Sincronizando músicas e favoritos…');
 try{
  const {data:remote,error}=await client.from('shared_songs').select('id,owner_id,title,artist,category,musical_key,capo,chords,chord_color,lyric_color,font_family,bold,source_local_id,created_at').order('created_at');
  if(error)throw error;
  const local=window.LouvoresApp.getSongs();
  const seen=new Set(local.map(songKey));
  let nextId=local.reduce((m,s)=>Math.max(m,Number(s.id)||0),0)+1,added=0;
  (remote||[]).forEach(row=>{
   const key=songKey(row);
   if(!row.title||seen.has(key))return;
   local.push({id:nextId++,title:row.title,artist:row.artist||'',category:row.category||'Congregacionais',key:row.musical_key||'C',capo:row.capo||'',chords:row.chords||'',chordColor:row.chord_color||'#1d4f91',lyricColor:row.lyric_color||'#172235',fontFamily:row.font_family||'Courier New',bold:!!row.bold,shared:true});
   seen.add(key);added++;
  });
  if(added)await window.LouvoresApp.persist();
  const {data:settings,error:settingsError}=await client.from('user_settings').select('settings').eq('user_id',user.id).maybeSingle();
  if(settingsError)throw settingsError;
  const keys=settings&&settings.settings&&Array.isArray(settings.settings.favorite_song_keys)?settings.settings.favorite_song_keys:[];
  if(keys.length){
   const ids=local.filter(s=>keys.includes(songKey(s))).map(s=>s.id);
   await window.LouvoresApp.setFavorites(ids);
  }else await saveSettings();
  status('Sincronização concluída. '+added+' música(s) nova(s) adicionada(s); nenhuma música local foi substituída.');
 }catch(e){status('A sincronização não foi concluída: '+(e.message||e),true);}
 finally{syncBusy=false;byId('cloudSync').disabled=false;}
}
window.LouvoresCloud={
 publishSong,
 saveSettings,
 isApproved:()=>approved,
 syncAll
};
async function start(){
 mount();
 if(!window.supabase||!window.supabase.createClient){status('O serviço de conexão não carregou. Verifique a internet e recarregue.');return;}
 client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
 const {data,error}=await client.auth.getSession();
 if(error){status('Falha ao iniciar a sessão: '+error.message,true);return;}
 user=data.session&&data.session.user||null;
 client.auth.onAuthStateChange((_event,session)=>{
  user=session&&session.user||null;
  approved=false;
  setTimeout(()=>refresh(),0);
 });
 await refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();