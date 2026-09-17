'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const colors = { bg:'#0a030d', panel:'#140a1e', text:'#fff', muted:'#a89db5', pink:'#e80068', purple:'#9b00e8', green:'#23a559', red:'#da373c' };

export default function AdminDashboard() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState('usuarios');
  const [data, setData] = useState({ users:[], invites:[], channels:[], settings:{} });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [newUser, setNewUser] = useState({ email:'',username:'',password:'',role:'membro' });
  const [guestName, setGuestName] = useState('');
  const [inviteMinutes, setInviteMinutes] = useState(30);
  const [newChannel, setNewChannel] = useState('');

  async function load() {
    setLoading(true); setMessage('');
    const { data: { session: current } } = await supabase.auth.getSession();
    if (!current) return router.replace('/');
    const { data: profile } = await supabase.from('profiles').select('role,status').eq('id', current.user.id).single();
    if (!profile || profile.role !== 'admin' || profile.status === 'suspenso') return router.replace('/servidor');
    setSession(current);
    const res = await fetch('/api/admin/manage', { headers:{ Authorization:`Bearer ${current.access_token}` } });
    const json = await res.json();
    if (!res.ok) { setMessage(json.error || 'Erro ao carregar painel.'); return; }
    setData(json);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function action(body) {
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/admin/manage', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` }, body:JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Operação não concluída.');
      setMessage('Operação concluída com sucesso.');
      await load();
      return json;
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }

  async function createUser(e) {
    e.preventDefault();
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/admin/create-user', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`}, body:JSON.stringify(newUser) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Não foi possível criar o usuário.');
      setNewUser({email:'',username:'',password:'',role:'membro'}); setMessage('Usuário criado.'); await load();
    } catch(e) { setMessage(e.message); } finally { setBusy(false); }
  }

  async function generateInvite() {
    const result = await action({ action:'create', guestName, expiresMinutes:inviteMinutes, count:1 });
    if (result?.invites?.[0]?.code) {
      await navigator.clipboard?.writeText(result.invites[0].code);
      setMessage(`Convite criado: ${result.invites[0].code} (copiado para a área de transferência)`);
    }
  }

  if (loading) return <main style={{minHeight:'100vh',background:colors.bg,color:colors.pink,display:'grid',placeItems:'center',fontFamily:'sans-serif'}}>CARREGANDO CENTRO DE COMANDO...</main>;
  const input = {background:'#050108',color:'#fff',border:`1px solid ${colors.purple}`,padding:10,borderRadius:6,width:'100%',boxSizing:'border-box'};
  const button = {background:`linear-gradient(90deg,${colors.pink},${colors.purple})`,color:'#fff',border:0,padding:'10px 16px',borderRadius:6,fontWeight:'bold',cursor:'pointer'};
  return <main style={{minHeight:'100vh',background:colors.bg,color:colors.text,fontFamily:'sans-serif',padding:30}}>
    <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:25,borderBottom:`1px solid ${colors.purple}`,paddingBottom:15}}>
      <div><h1 style={{margin:0,color:colors.pink}}>Centro de Comando</h1><small style={{color:colors.muted}}>Gerenciamento real do CPX</small></div>
      <button style={{...button,background:'transparent',border:`1px solid ${colors.pink}`}} onClick={()=>router.push('/servidor')}>Voltar</button>
    </header>
    <nav style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>{['usuarios','convites','canais','config'].map(t=><button key={t} onClick={()=>setTab(t)} style={{...button,background:tab===t?`linear-gradient(90deg,${colors.pink},${colors.purple})`:'transparent',border:`1px solid ${colors.purple}`}}>{t.toUpperCase()}</button>)}</nav>
    {message && <div style={{background:'rgba(35,165,89,.12)',border:`1px solid ${colors.green}`,padding:12,borderRadius:6,marginBottom:15}}>{message}</div>}

    {tab==='usuarios' && <section style={{background:colors.panel,padding:20,borderRadius:10}}>
      <h2>Usuários</h2>
      <form onSubmit={createUser} style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:25}}>
        <input style={input} placeholder="E-mail" type="email" required value={newUser.email} onChange={e=>setNewUser({...newUser,email:e.target.value})}/>
        <input style={input} placeholder="Username" required value={newUser.username} onChange={e=>setNewUser({...newUser,username:e.target.value})}/>
        <input style={input} placeholder="Senha (8+)" type="password" minLength={8} required value={newUser.password} onChange={e=>setNewUser({...newUser,password:e.target.value})}/>
        <div style={{display:'flex',gap:8}}><select style={input} value={newUser.role} onChange={e=>setNewUser({...newUser,role:e.target.value})}><option value="membro">Membro</option><option value="admin">Admin</option></select><button disabled={busy} style={button}>Criar</button></div>
      </form>
      <table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th>Usuário</th><th>Status</th><th>Cargo</th><th>Ações</th></tr></thead><tbody>{data.users.map(u=><tr key={u.id} style={{borderTop:'1px solid #30203a'}}><td style={{padding:10}}>{u.username}</td><td>{u.status}</td><td><select value={u.role} onChange={e=>action({action:'update-user',id:u.id,role:e.target.value,status:u.status})}><option value="membro">membro</option><option value="admin">admin</option></select></td><td><button onClick={()=>action({action:'update-user',id:u.id,role:u.role,status:u.status==='ativo'?'suspenso':'ativo'})} style={{...button,background:u.status==='ativo'?colors.red:colors.green}}>{u.status==='ativo'?'Suspender':'Reativar'}</button> <button onClick={()=>confirm(`Excluir ${u.username}?`)&&action({action:'delete-user',id:u.id})} style={{...button,background:colors.red}}>Excluir</button></td></tr>)}</tbody></table>
    </section>}

    {tab==='convites' && <section style={{background:colors.panel,padding:20,borderRadius:10}}>
      <h2>Convites</h2><div style={{display:'grid',gridTemplateColumns:'2fr 1fr auto',gap:8,marginBottom:20}}><input style={input} placeholder="Nome do convidado" value={guestName} onChange={e=>setGuestName(e.target.value)}/><input style={input} type="number" min={5} max={10080} value={inviteMinutes} onChange={e=>setInviteMinutes(e.target.value)}/><button disabled={busy} style={button} onClick={generateInvite}>Gerar código</button></div>
      <table style={{width:'100%'}}><thead><tr><th>Final</th><th>Convidado</th><th>Expira</th><th>Status</th><th>Ação</th></tr></thead><tbody>{data.invites.map(i=><tr key={i.id}><td>{i.code_preview}</td><td>{i.guest_name}</td><td>{new Date(i.expires_at).toLocaleString('pt-BR')}</td><td>{i.used_at?'usado':i.revoked_at?'revogado':new Date(i.expires_at)<new Date()?'expirado':'ativo'}</td><td>{!i.used_at&&!i.revoked_at&&<button style={{...button,background:colors.red}} onClick={()=>action({action:'revoke-invite',id:i.id})}>Revogar</button>}</td></tr>)}</tbody></table>
    </section>}

    {tab==='canais' && <section style={{background:colors.panel,padding:20,borderRadius:10}}><h2>Canais</h2><div style={{display:'flex',gap:8,marginBottom:20}}><input style={input} placeholder="Nome do canal" value={newChannel} onChange={e=>setNewChannel(e.target.value)}/><button style={button} onClick={async()=>{await action({action:'create-channel',name:newChannel});setNewChannel('')}}>Criar</button></div>{data.channels.map(c=><div key={c.id} style={{display:'flex',alignItems:'center',gap:12,borderTop:'1px solid #30203a',padding:'12px 0'}}><b style={{flex:1}}># {c.name}</b><label>Ativo <input type="checkbox" checked={c.is_active} onChange={e=>action({action:'update-channel',id:c.id,is_active:e.target.checked})}/></label><label>Convidado <input type="checkbox" checked={c.guest_access} onChange={e=>action({action:'update-channel',id:c.id,guest_access:e.target.checked})}/></label><button style={{...button,background:colors.red}} onClick={()=>confirm(`Excluir #${c.name}?`)&&action({action:'delete-channel',id:c.id})}>Excluir</button></div>)}</section>}

    {tab==='config' && <section style={{background:colors.panel,padding:20,borderRadius:10}}><h2>Configurações</h2><label style={{display:'block',margin:'15px 0'}}>Modo manutenção <input type="checkbox" defaultChecked={data.settings.maintenance_mode} id="maintenance"/></label><label style={{display:'block',margin:'15px 0'}}>Logs Discord <input type="checkbox" defaultChecked={data.settings.discord_logs} id="discordLogs"/></label><label style={{display:'block',margin:'15px 0'}}>Limite global <select id="maxUsers" defaultValue={data.settings.max_users||'ilimitado'}><option value="50">50</option><option value="100">100</option><option value="200">200</option><option value="ilimitado">Ilimitado</option></select></label><button style={button} onClick={()=>action({action:'settings',maintenanceMode:document.getElementById('maintenance').checked,discordLogs:document.getElementById('discordLogs').checked,maxUsers:document.getElementById('maxUsers').value})}>Salvar</button></section>}
  </main>;
}
