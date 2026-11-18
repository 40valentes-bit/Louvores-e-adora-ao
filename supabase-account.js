/* Integração Supabase: autenticação, aprovação, músicas compartilhadas e favoritos. */
(function(){
'use strict';
const SUPABASE_URL='https://cwnybkcrlljbebaxscvc.supabase.co';
const SUPABASE_KEY='sb_publishable_bn_5QG9VFRoZKx49R0_zWA_R2TbPPbi';
const ADMIN_EMAIL='binhabh10@gmail.com';
let client=null,user=null,approved=false,syncBusy=false,cloudStateMerged=false;
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
 const setOrder=node('button',{id:'cloudSetOrder',type:'button',class:'soft',style:'margin-top:8px'},'Definir ordem deste aparelho como oficial');
 const syncInfo=node('p',{},'A sincronização acrescenta músicas compartilhadas sem substituir as músicas locais. Para definir a ordem principal, faça isso uma única vez no notebook; depois sincronize os outros aparelhos.');
 tools.append(sync,setOrder,syncInfo);
 const admin=node('div',{id:'cloudAdmin',style:'margin-top:14px'});
 panel.append(heading,msg,emailLabel,passLabel,actions,tools,admin);modal.appendChild(panel);document.body.appendChild(modal);
 open.onclick=()=>{modal.style.display='flex';refresh();};
 close.onclick=()=>modal.style.display='none';
 login.onclick=doLogin;signup.onclick=doSignup;logout.onclick=doLogout;sync.onclick=syncAll;byId('cloudSetOrder').onclick=setCanonicalOrder;
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
function hasUsableChords(s){const value=String(s&&s.chords||'').trim();return !!value&&!/^Letra e cifra não foram incluídas\./i.test(value);}
function toCloudSong(s){
 return {owner_id:user.id,title:s.title,artist:s.artist||'',category:s.category||'',musical_key:s.key||'',capo:s.capo||'',chords:s.chords||'',chord_color:s.chordColor||'',lyric_color:s.lyricColor||'',font_family:s.fontFamily||'',bold:!!s.bold,source_local_id:String(s.id)};
}
function mutationPasswordDialog(isSetup){
 return new Promise(resolve=>{
  const overlay=node('div',{style:'position:fixed;inset:0;z-index:100000;background:#07182dcc;display:flex;align-items:center;justify-content:center;padding:18px'});
  const panel=node('section',{style:'width:min(100%,420px);background:#fff;color:#172235;border-radius:18px;padding:22px;box-shadow:0 15px 50px #0006'});
  const title=node('h2',{},isSetup?'Cadastrar senha de administrador':'Confirmar alteração');
  const message=node('p',{},isSetup?'Crie uma senha com pelo menos 12 caracteres. Ela protegerá cada inclusão, edição e exclusão de música.':'Digite sua senha de administrador para autorizar esta alteração.');
  const first=node('input',{type:'password',autocomplete:'new-password',placeholder:isSetup?'Nova senha (mínimo 12 caracteres)':'Senha de administrador',style:'box-sizing:border-box;width:100%;padding:12px;margin:8px 0;border:1px solid #ccd3dd;border-radius:9px'});
  const second=node('input',{type:'password',autocomplete:'new-password',placeholder:'Repita a nova senha',style:'box-sizing:border-box;width:100%;padding:12px;margin:8px 0;border:1px solid #ccd3dd;border-radius:9px'});
  const error=node('p',{style:'color:#b42318;min-height:20px;margin:4px 0'});
  const actions=node('div',{style:'display:flex;gap:10px;justify-content:flex-end;margin-top:12px'});
  const cancel=node('button',{type:'button',class:'soft'},'Cancelar');
  const confirm=node('button',{type:'button'},isSetup?'Cadastrar senha':'Confirmar');
  actions.append(cancel,confirm);panel.append(title,message,first);if(isSetup)panel.append(second);panel.append(error,actions);overlay.append(panel);document.body.append(overlay);
  const finish=value=>{overlay.remove();resolve(value);};
  cancel.onclick=()=>finish(null);
  confirm.onclick=()=>{
   const value=first.value;
   if(value.length<12){error.textContent='Use pelo menos 12 caracteres.';first.focus();return;}
   if(isSetup&&value!==second.value){error.textContent='As senhas não conferem.';second.focus();return;}
   finish(value);
  };
  overlay.addEventListener('click',e=>{if(e.target===overlay)finish(null);});
  first.addEventListener('keydown',e=>{if(e.key==='Enter'){if(isSetup)second.focus();else confirm.click();}});
  second.addEventListener('keydown',e=>{if(e.key==='Enter')confirm.click();});
  first.focus();
 });
}
async function requestMutationPassword(){
 if(!client||!user||!approved)throw new Error('Entre na conta principal 123plicativo@gmail.com e confirme a aprovação antes de alterar músicas.');
 if(user.id!=='4148b351-24b5-4a22-bfa5-d0cc1601fa83')throw new Error('Somente a conta principal está autorizada a alterar músicas.');
 const {data:configured,error:statusError}=await client.rpc('admin_mutation_password_is_set');
 if(statusError)throw new Error('Não foi possível verificar a proteção de senha: '+statusError.message);
 const password=await mutationPasswordDialog(!configured);
 if(!password)throw new Error('Operação cancelada.');
 if(!configured){
  const {error}=await client.rpc('set_admin_mutation_password',{p_password:password});
  if(error)throw new Error('Não foi possível cadastrar a senha: '+error.message);
  status('Senha de administrador cadastrada com segurança.');
 }
 return password;
}
async function rpcSongUpsert(song,password=null,oldSong=null){
 const row=toCloudSong(song);
 delete row.owner_id;delete row.source_local_id;
 const {data,error}=await client.rpc('admin_upsert_song',{
  p_password:password,
  p_song:row,
  p_old_title:oldSong?oldSong.title:null,
  p_old_artist:oldSong?oldSong.artist||'':null
 });
 if(error)throw error;
 return data;
}
async function mutateSong(song,oldSong,password){
 if(!client||!user||!approved)throw new Error('Conta principal sem sessão aprovada.');
 await rpcSongUpsert(song,password,oldSong);
 return true;
}
async function deleteSongCloud(song,password){
 if(!client||!user||!approved)throw new Error('Conta principal sem sessão aprovada.');
 const {error}=await client.rpc('admin_delete_song',{
  p_password:password,p_title:song.title,p_artist:song.artist||''
 });
 if(error)throw error;
 return true;
}
async function publishSong(song){
 if(!client||!user||!approved||!song||!song.title)return false;
 if(!hasUsableChords(song))return true;
 // A sincronização não pede senha para músicas já autorizadas e idênticas.
 // Qualquer inclusão ou diferença de conteúdo é bloqueada pelo banco sem senha.
 try{await rpcSongUpsert(song,null,null);return true;}
 catch(error){status('A sincronização encontrou uma alteração que precisa de confirmação de senha: '+error.message,true);return false;}
}
async function readCloudSettings(){
 const {data,error}=await client.from('user_settings').select('settings').eq('user_id',user.id).maybeSingle();
 if(error)throw error;
 return data&&data.settings&&typeof data.settings==='object'?data.settings:{};
}
async function writeCloudSettings(settings){
 const {error}=await client.from('user_settings').upsert({user_id:user.id,settings,updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(error)throw error;
}
async function saveSettings(){
 if(!client||!user||!approved||!cloudStateMerged)return;
 const favorites=(window.LouvoresApp&&window.LouvoresApp.getFavorites?window.LouvoresApp.getFavorites():[]);
 const songs=window.LouvoresApp.getSongs();
 const favKeys=favorites.map(id=>{
  const song=songs.find(s=>String(s.id)===String(id));
  return song?songKey(song):null;
 }).filter(Boolean);
 const settings=await readCloudSettings();
 settings.favorite_song_keys=favKeys;
 await writeCloudSettings(settings);
}
async function setCanonicalOrder(){
 const button=byId('cloudSetOrder');
 if(!approved||!user)return;
 button.disabled=true;status('Registrando a ordem deste notebook na nuvem…');
 try{
  const songs=window.LouvoresApp.getSongs();
  const keys=songs.map(songKey);
  if(keys.some(key=>key==='|'))throw new Error('Há uma música sem título. Corrija antes de definir a ordem.');
  if(new Set(keys).size!==keys.length)throw new Error('Existem músicas com o mesmo título e artista. Não alterei a ordem na nuvem para evitar misturar registros.');
  const settings=await readCloudSettings();
  settings.song_order_keys=keys;
  await writeCloudSettings(settings);
  status('Ordem oficial registrada com '+keys.length+' músicas. Agora sincronize o telefone e o tablet.');
 }catch(e){status('Não foi possível registrar a ordem: '+(e.message||e),true);}
 finally{button.disabled=false;}
}
async function syncAll(){
 if(syncBusy||!approved)return;
 syncBusy=true;byId('cloudSync').disabled=true;status('Sincronizando músicas e favoritos…');
 try{
  const local=window.LouvoresApp.getSongs();
  const beforeCleanup=local.slice();
  const favoriteKeysBefore=window.LouvoresApp.getFavorites().map(id=>beforeCleanup.find(song=>String(song.id)===String(id))).filter(hasUsableChords).map(songKey);
  const bestByKey=new Map();
  for(const song of beforeCleanup){
   if(!song.title||!hasUsableChords(song))continue;
   const key=songKey(song),current=bestByKey.get(key);
   const score=item=>[item.key,item.capo,item.chordColor,item.lyricColor,item.fontFamily,item.bold].filter(Boolean).length;
   if(!current||String(song.chords||'').length>String(current.chords||'').length||(String(song.chords||'').length===String(current.chords||'').length&&score(song)>score(current)))bestByKey.set(key,song);
  }
  local.splice(0,local.length,...bestByKey.values());
  const removedLocal=beforeCleanup.length-local.length;
  if(removedLocal&&!await window.LouvoresApp.persist())throw new Error('Não foi possível salvar a limpeza local; nenhuma música da nuvem foi removida.');
  for(const song of local){
   if(!await publishSong(song))throw new Error('Falha ao enviar a música local: '+(song.title||'sem título'));
  }
  const {data:remote,error}=await client.from('shared_songs').select('id,owner_id,title,artist,category,musical_key,capo,chords,chord_color,lyric_color,font_family,bold,source_local_id,created_at').order('created_at');
  if(error)throw error;
  const cloudSettings=await readCloudSettings();
  const seen=new Set(local.map(songKey));
  let nextId=local.reduce((m,s)=>Math.max(m,Number(s.id)||0),0)+1,added=0;
  const bestRemote=new Map();
  (remote||[]).filter(row=>row.title&&hasUsableChords(row)).forEach(row=>{
   const key=songKey(row),current=bestRemote.get(key);
   const score=item=>[item.musical_key,item.capo,item.chord_color,item.lyric_color,item.font_family,item.bold].filter(Boolean).length;
   if(!current||String(row.chords||'').length>String(current.chords||'').length||(String(row.chords||'').length===String(current.chords||'').length&&score(row)>score(current)))bestRemote.set(key,row);
  });
  bestRemote.forEach(row=>{
   const key=songKey(row);
   if(seen.has(key))return;
   local.push({id:nextId++,title:row.title,artist:row.artist||'',category:row.category||'Congregacionais',key:row.musical_key||'C',capo:row.capo||'',chords:row.chords||'',chordColor:row.chord_color||'#1d4f91',lyricColor:row.lyric_color||'#172235',fontFamily:row.font_family||'Courier New',bold:!!row.bold,shared:true});
   seen.add(key);added++;
  });
  let orderKeys=Array.isArray(cloudSettings.song_order_keys)?cloudSettings.song_order_keys.slice():null;
  let reordered=false,orderMatched=0,appendedToOfficial=0;
  if(orderKeys&&orderKeys.length){
   const normalizeOrderKey=value=>String(value||'').normalize('NFC').replace(/[\\u200B-\\u200D\\uFEFF\\u2060\\u00AD]/g,'').replace(/\\s+/g,' ').trim().toLocaleLowerCase('pt-BR');
   const knownOrderKeys=new Set(orderKeys.map(normalizeOrderKey));
   // Toda música local válida que já foi publicada/recebida precisa entrar na ordem oficial.
   // Isso evita o ciclo 35/36 quando um novo louvor é enviado à nuvem antes da ordem ser atualizada.
   local.forEach(song=>{
    if(!song.title||!hasUsableChords(song))return;
    const key=songKey(song),normalized=normalizeOrderKey(key);
    if(!knownOrderKeys.has(normalized)){
     orderKeys.push(key);
     knownOrderKeys.add(normalized);
     appendedToOfficial++;
    }
   });
   if(appendedToOfficial){
    cloudSettings.song_order_keys=orderKeys;
    await writeCloudSettings(cloudSettings);
   }
   const rank=new Map(orderKeys.map((key,index)=>[normalizeOrderKey(key),index]));
   orderMatched=local.filter(song=>rank.has(normalizeOrderKey(songKey(song)))).length;
   const before=local.map(songKey).join('\\n');
   local.sort((a,b)=>{
    const ar=rank.has(normalizeOrderKey(songKey(a)))?rank.get(normalizeOrderKey(songKey(a))):Number.MAX_SAFE_INTEGER;
    const br=rank.has(normalizeOrderKey(songKey(b)))?rank.get(normalizeOrderKey(songKey(b))):Number.MAX_SAFE_INTEGER;
    return ar-br;
   });
   reordered=before!==local.map(songKey).join('\\n');
  }
  if((added||reordered)&&!await window.LouvoresApp.persist())throw new Error('As músicas recebidas ou a nova ordem não puderam ser salvas neste aparelho.');
  const keys=Array.isArray(cloudSettings.favorite_song_keys)?cloudSettings.favorite_song_keys:[];
  const mergedKeys=new Set([...keys,...favoriteKeysBefore]);
  const ids=local.filter(song=>mergedKeys.has(songKey(song))).map(song=>song.id);
  if(!await window.LouvoresApp.setFavorites(ids))throw new Error('Os favoritos não puderam ser salvos neste aparelho.');
  cloudStateMerged=true;
  await saveSettings();
  status('Sincronização concluída. '+added+' música(s) nova(s) adicionada(s); '+removedLocal+' registro(s) sem cifra ou duplicado(s) removido(s) deste aparelho. Ordem oficial: '+(orderKeys&&orderKeys.length?orderMatched+'/'+local.length+' músicas reconhecidas; '+(appendedToOfficial?appendedToOfficial+' música(s) incorporada(s) automaticamente à ordem oficial. ': '')+(reordered?'lista reordenada e salva':'lista já estava nessa ordem'):'não encontrada na nuvem')+'. Cifras válidas preservadas.');
 }catch(e){status('A sincronização não foi concluída: '+(e.message||e),true);}
 finally{syncBusy=false;byId('cloudSync').disabled=false;}
}
window.LouvoresCloud={
 getClient:()=>client,
 getUser:()=>user,
 publishSong,
 requestMutationPassword,
 mutateSong,
 deleteSong:deleteSongCloud,
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
