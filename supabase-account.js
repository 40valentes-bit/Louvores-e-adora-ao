/* Conta e aprovação do Louvores & Adoração */
(function(){
'use strict';
const SUPABASE_URL='https://cwnybkcrlljebabxscvc.supabase.co';
const SUPABASE_KEY='sb_publishable_bn_5QG9VFRoZKx49R0_zWA_R2Tbbi';
let client=null,user=null;
const ADMIN_EMAIL='binhabh10@gmail.com';
function el(tag,attrs={},html=''){const n=document.createElement(tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));n.innerHTML=html;return n;}
function status(msg,error=false){const n=document.getElementById('cloudStatus');if(n){n.textContent=msg;n.style.color=error?'#b42318':'#176b3a';}}
function mount(){
 if(document.getElementById('cloudAccountBtn'))return;
 const toolbar=document.querySelector('.toolbar');if(!toolbar)return;
 const b=el('button',{id:'cloudAccountBtn',type:'button',class:'soft'},'☁ Conta / sincronização');
 toolbar.appendChild(b);
 const modal=el('div',{id:'cloudAccountModal',style:'display:none;position:fixed;inset:0;background:#07182dcc;z-index:99999;align-items:center;justify-content:center;padding:18px;'});
 modal.innerHTML='<section style="background:white;color:#172235;width:min(100%,420px);border-radius:18px;padding:22px;box-shadow:0 15px 50px #0005"><h2 style="margin:0 0 8px">Conta Louvores</h2><p id="cloudStatus" role="status">Entre ou crie uma conta. O aplicativo local continua disponível.</p><label>E-mail<input id="cloudEmail" type="email" autocomplete="email" style="display:block;margin:6px 0 12px"></label><label>Senha<input id="cloudPassword" type="password" autocomplete="current-password" style="display:block;margin:6px 0 14px"></label><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="cloudLogin">Entrar</button><button id="cloudSignup" class="soft">Criar conta</button><button id="cloudLogout" class="soft" style="display:none">Sair</button><button id="cloudClose" class="soft">Fechar</button></div><div id="cloudAdmin" style="margin-top:14px"></div></section>';
 document.body.appendChild(modal);
 b.onclick=()=>{modal.style.display='flex';refresh();};
 document.getElementById('cloudClose').onclick=()=>modal.style.display='none';
 document.getElementById('cloudLogin').onclick=login;
 document.getElementById('cloudSignup').onclick=signup;
 document.getElementById('cloudLogout').onclick=logout;
}
function refresh(){
 if(!client){status('Conectando ao serviço de contas…');return;}
 if(!user){status('Entre ou crie uma conta. O aplicativo local continua disponível.');return;}
 document.getElementById('cloudEmail').value=user.email||'';
 document.getElementById('cloudLogout').style.display='inline-block';
 checkApproval();
}
async function checkApproval(){
 const {data,error}=await client.from('user_approvals').select('approved').eq('user_id',user.id).maybeSingle();
 if(error){status('Conta conectada, mas não foi possível consultar a aprovação: '+error.message,true);return;}
 if(data&&data.approved){status('Conta aprovada: '+user.email+'. A sincronização de músicas será ativada após validação do banco.');}
 else status('Cadastro recebido. Aguardando aprovação do administrador.');
 if((user.email||'').toLowerCase()===ADMIN_EMAIL.toLowerCase())loadPending();
}
async function login(){
 const email=document.getElementById('cloudEmail').value.trim(),password=document.getElementById('cloudPassword').value;
 const {data,error}=await client.auth.signInWithPassword({email,password});
 if(error){status('Não foi possível entrar: '+error.message,true);return;}
 user=data.user;await refresh();
}
async function signup(){
 const email=document.getElementById('cloudEmail').value.trim(),password=document.getElementById('cloudPassword').value;
 if(password.length<6){status('Use uma senha com pelo menos 6 caracteres.',true);return;}
 const {data,error}=await client.auth.signUp({email,password});
 if(error){status('Não foi possível criar a conta: '+error.message,true);return;}
 user=data.user;
 status('Cadastro iniciado. Confirme o e-mail, se solicitado. Depois o administrador deverá aprovar o acesso.');
 if(user)await checkApproval();
}
async function logout(){await client.auth.signOut();user=null;document.getElementById('cloudLogout').style.display='none';status('Você saiu da conta.');}
async function loadPending(){
 const box=document.getElementById('cloudAdmin');box.innerHTML='<h3>Cadastros pendentes</h3>';
 const {data,error}=await client.from('user_approvals').select('user_id,email,created_at').eq('approved',false).order('created_at');
 if(error){box.textContent='Não foi possível listar pendências: '+error.message;return;}
 if(!data||!data.length){box.append('Nenhum cadastro pendente.');return;}
 data.forEach(row=>{
  const line=el('div',{style:'display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 0;border-top:1px solid #ddd'});
  const name=el('span',{},row.email||row.user_id);
  const approve=el('button',{type:'button'},'Aprovar');
  approve.onclick=async()=>{approve.disabled=true;const {error}=await client.from('user_approvals').update({approved:true,approved_at:new Date().toISOString()}).eq('user_id',row.user_id);if(error){approve.disabled=false;status('Falha ao aprovar: '+error.message,true);}else{line.remove();status('Usuário aprovado.');}};
  line.append(name,approve);box.appendChild(line);
 });
}
async function start(){
 mount();
 if(!window.supabase||!window.supabase.createClient){status('Biblioteca de conexão não carregou.');return;}
 client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
 const {data}=await client.auth.getSession();user=data.session&&data.session.user||null;
 client.auth.onAuthStateChange((_event,session)=>{user=session&&session.user||null;});
 refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();