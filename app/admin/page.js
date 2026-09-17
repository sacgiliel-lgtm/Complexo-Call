'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Avatar, Badge, EmptyState, Icon, Modal, Spinner, ToastStack } from '../../components/ui';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const tabs = [
  ['dashboard', 'Visão geral'],
  ['usuarios', 'Usuários'],
  ['convites', 'Convites'],
  ['canais', 'Canais'],
  ['config', 'Configuração'],
];

export default function AdminDashboard() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [data, setData] = useState({ users: [], invites: [], channels: [], activities: [], settings: {}, stats: {} });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [toasts, setToasts] = useState([]);
  const [userModal, setUserModal] = useState(false);
  const [inviteModal, setInviteModal] = useState(false);
  const [channelModal, setChannelModal] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [newUser, setNewUser] = useState({ email: '', username: '', password: '', role: 'membro' });
  const [inviteForm, setInviteForm] = useState({ guestName: '', expiresMinutes: 30 });
  const [channelForm, setChannelForm] = useState({ id: '', name: '', category: 'GERAL', description: '', icon: 'voice', sort_order: 0, guest_access: false, is_waiting_room: false, is_active: true });
  const [settingsForm, setSettingsForm] = useState({ maintenance_mode: false, discord_logs: true, max_users: 'ilimitado' });

  function toast(message, type = 'success', title = 'Centro de comando') {
    const item = { id: `${Date.now()}-${Math.random()}`, message, type, title };
    setToasts((current) => [...current.slice(-3), item]);
    window.setTimeout(() => setToasts((current) => current.filter((entry) => entry.id !== item.id)), 4000);
  }

  async function load() {
    const { data: { session: current } } = await supabase.auth.getSession();
    if (!current) { router.replace('/'); return; }
    const { data: profile } = await supabase.from('profiles').select('role,status').eq('id', current.user.id).single();
    if (!profile || profile.role !== 'admin' || profile.status === 'suspenso') { router.replace('/servidor'); return; }
    setSession(current);
    try {
      const response = await fetch('/api/admin/manage', { headers: { Authorization: `Bearer ${current.access_token}` }, cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Erro ao carregar o painel.');
      setData(json);
      setSettingsForm({ maintenance_mode: !!json.settings?.maintenance_mode, discord_logs: json.settings?.discord_logs !== false, max_users: json.settings?.max_users ?? 'ilimitado' });
    } catch (error) { toast(error.message, 'error', 'Falha ao carregar'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function action(body, successMessage = 'Operação concluída.') {
    if (!session) return null;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/manage', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Operação não concluída.');
      toast(successMessage);
      await load();
      return json;
    } catch (error) { toast(error.message, 'error', 'Não foi possível concluir'); return null; }
    finally { setBusy(false); }
  }

  async function createUser(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/api/admin/create-user', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(newUser) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Não foi possível criar o usuário.');
      setNewUser({ email: '', username: '', password: '', role: 'membro' }); setUserModal(false); toast(`Usuário ${json.user.username} criado.`); await load();
    } catch (error) { toast(error.message, 'error', 'Novo usuário'); }
    finally { setBusy(false); }
  }

  async function generateInvite(event) {
    event?.preventDefault();
    const result = await action({ action: 'create', guestName: inviteForm.guestName, expiresMinutes: Number(inviteForm.expiresMinutes), count: 1 }, 'Convite gerado.');
    if (result?.invites?.[0]?.code) {
      setGeneratedCode(result.invites[0].code);
      try { await navigator.clipboard?.writeText(result.invites[0].code); toast('Código copiado para a área de transferência.'); } catch {}
    }
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(generatedCode); toast('Código copiado.'); } catch { toast('Não foi possível acessar a área de transferência.', 'error'); }
  }

  function openCreateChannel() { setChannelForm({ id: '', name: '', category: 'GERAL', description: '', icon: 'voice', sort_order: 0, guest_access: false, is_waiting_room: false, is_active: true }); setChannelModal(true); }
  function openEditChannel(channel) { setChannelForm({ id: channel.id, name: channel.name || '', category: channel.category || 'GERAL', description: channel.description || '', icon: channel.icon || 'voice', sort_order: channel.sort_order || 0, guest_access: !!channel.guest_access, is_waiting_room: !!channel.is_waiting_room, is_active: !!channel.is_active }); setChannelModal(true); }
  async function saveChannel(event) {
    event.preventDefault();
    const body = { ...channelForm, action: channelForm.id ? 'update-channel' : 'create-channel' };
    const result = await action(body, channelForm.id ? 'Canal atualizado.' : 'Canal criado.');
    if (result) setChannelModal(false);
  }

  async function saveSettings() {
    await action({ action: 'settings', maintenanceMode: settingsForm.maintenance_mode, discordLogs: settingsForm.discord_logs, maxUsers: settingsForm.max_users }, 'Configurações salvas.');
  }

  const q = search.trim().toLowerCase();
  const filteredUsers = useMemo(() => data.users.filter((user) => !q || `${user.username} ${user.role} ${user.status}`.toLowerCase().includes(q)), [data.users, q]);
  const filteredInvites = useMemo(() => data.invites.filter((invite) => !q || `${invite.guest_name} ${invite.code_preview} ${invite.type}`.toLowerCase().includes(q)), [data.invites, q]);
  const filteredChannels = useMemo(() => data.channels.filter((channel) => !q || `${channel.name} ${channel.category} ${channel.description || ''}`.toLowerCase().includes(q)), [data.channels, q]);

  function inviteStatus(invite) {
    if (invite.used_at) return ['Usado', 'neutral'];
    if (invite.revoked_at) return ['Revogado', 'red'];
    if (new Date(invite.expires_at).getTime() <= Date.now()) return ['Expirado', 'yellow'];
    return ['Ativo', 'green'];
  }

  function activityLabel(item) {
    const map = { user_created: 'criou o usuário', user_updated: 'alterou o usuário', user_deleted: 'excluiu o usuário', invite_created: 'gerou convite para', invite_revoked: 'revogou convite', channel_created: 'criou o canal', channel_updated: 'alterou o canal', channel_deleted: 'excluiu o canal', participant_disconnected: 'desconectou participante', participant_muted: 'silenciou participante', settings_updated: 'atualizou configurações' };
    return `${item.actor_name || 'Admin'} ${map[item.action] || item.action}${item.target ? ` • ${item.target}` : ''}`;
  }

  if (loading) return <main className="login-page"><Spinner label="Carregando Centro de Comando..." /></main>;

  return <main className="admin-page">
    <div className="admin-wrap">
      <header className="admin-head"><div className="admin-brand"><div className="brand-mark" style={{ marginBottom: 8 }}><div className="brand-logo">CPX</div><div className="brand-copy"><strong>Centro de Comando</strong><span>Administração e moderação do servidor</span></div></div></div><div style={{ display: 'flex', gap: 7 }}><button className="secondary-btn button-sm" onClick={() => router.push('/servidor')}><Icon name="chevron" size={14} /> Voltar para call</button></div></header>

      <nav className="admin-nav">{tabs.map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}<div className="admin-search" style={{ marginLeft: 'auto' }}><Icon name="search" size={15} /><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar..." /></div></nav>

      {tab === 'dashboard' && <>
        <div className="stat-grid"><Stat label="USUÁRIOS" value={data.stats.users ?? data.users.length} icon="users" /><Stat label="ONLINE NAS CALLS" value={data.stats.online ?? 0} icon="phone" /><Stat label="CANAIS ATIVOS" value={data.stats.channels ?? data.channels.length} icon="chat" /><Stat label="CONVITES ATIVOS" value={data.stats.activeInvites ?? 0} icon="shield" /></div>
        <div className="admin-grid"><section className="admin-card"><div className="admin-card-head"><div><h2>Atividade recente</h2><span className="helper">Eventos administrativos e de moderação.</span></div><Badge tone="purple">Tempo real via painel</Badge></div>{data.activities.length ? <div className="activity-list">{data.activities.slice(0, 12).map((item) => <div className="activity-item" key={item.id}><i className="activity-bullet" /><span><b style={{ color: '#fff' }}>{activityLabel(item)}</b><br />{item.details || 'Sem detalhes'}<br />{new Date(item.created_at).toLocaleString('pt-BR')}</span></div>)}</div> : <EmptyState icon="chat" title="Sem atividade registrada" description="Ações do painel aparecerão aqui." />}</section><section className="admin-card"><div className="admin-card-head"><div><h2>Estado do servidor</h2><span className="helper">Resumo das configurações atuais.</span></div><Badge tone={data.settings.maintenance_mode ? 'yellow' : 'green'}>{data.settings.maintenance_mode ? 'Manutenção' : 'Operacional'}</Badge></div><div className="toggle-row"><div><strong>Modo manutenção</strong><span>Bloqueia novas entradas de membros e convidados.</span></div><span className={`presence-dot ${data.settings.maintenance_mode ? 'away' : ''}`} /></div><div className="toggle-row"><div><strong>Logs Discord</strong><span>Registro de acessos e eventos no webhook configurado.</span></div><Badge tone={data.settings.discord_logs !== false ? 'green' : 'neutral'}>{data.settings.discord_logs !== false ? 'Ativo' : 'Desligado'}</Badge></div><div className="toggle-row"><div><strong>Limite por call</strong><span>Quantidade máxima configurada para cada sala.</span></div><b>{data.settings.max_users ?? 'Ilimitado'}</b></div></section></div>
      </>}

      {tab === 'usuarios' && <section className="admin-card"><div className="admin-card-head"><div><h2>Usuários</h2><span className="helper">Contas, cargos, presença e controle de acesso.</span></div><button className="primary-btn button-sm" onClick={() => setUserModal(true)}><Icon name="plus" size={14} /> Novo usuário</button></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Usuário</th><th>Status</th><th>Presença</th><th>Cargo</th><th>Criado em</th><th>Ações</th></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id}><td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={user.username} size="sm" status={user.presence_status || 'offline'} /><div><b>{user.username}</b><div className="helper">{user.id.slice(0, 8)}...</div></div></div></td><td><Badge tone={user.status === 'ativo' ? 'green' : 'red'}>{user.status}</Badge></td><td><Badge tone={user.presence_status === 'online' ? 'green' : user.presence_status === 'away' ? 'yellow' : 'neutral'}>{user.presence_status || 'offline'}</Badge></td><td><select value={user.role} disabled={busy} onChange={(e) => action({ action: 'update-user', id: user.id, role: e.target.value, status: user.status }, 'Cargo atualizado.')}><option value="membro">Membro</option><option value="admin">Admin</option></select></td><td>{new Date(user.created_at).toLocaleDateString('pt-BR')}</td><td><div style={{ display: 'flex', gap: 5 }}><button className={`button-sm ${user.status === 'ativo' ? 'danger-btn' : 'primary-btn'}`} disabled={busy} onClick={() => action({ action: 'update-user', id: user.id, role: user.role, status: user.status === 'ativo' ? 'suspenso' : 'ativo' }, user.status === 'ativo' ? 'Usuário suspenso.' : 'Usuário reativado.')}>{user.status === 'ativo' ? 'Suspender' : 'Reativar'}</button>{user.role !== 'admin' && <button className="danger-btn button-sm" disabled={busy} onClick={() => window.confirm(`Excluir ${user.username}?`) && action({ action: 'delete-user', id: user.id }, 'Usuário excluído.')}>Excluir</button>}</div></td></tr>)}</tbody></table></div>{!filteredUsers.length && <div className="admin-empty">Nenhum usuário encontrado.</div>}</section>}

      {tab === 'convites' && <section className="admin-card"><div className="admin-card-head"><div><h2>Convites</h2><span className="helper">Códigos temporários para acesso de convidados.</span></div><button className="primary-btn button-sm" onClick={() => { setGeneratedCode(''); setInviteModal(true); }}><Icon name="plus" size={14} /> Gerar convite</button></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Final</th><th>Convidado</th><th>Expira</th><th>Status</th><th>Criado</th><th>Ação</th></tr></thead><tbody>{filteredInvites.map((invite) => { const [label, tone] = inviteStatus(invite); return <tr key={invite.id}><td><b>••••{invite.code_preview}</b></td><td>{invite.guest_name || 'Convidado'}</td><td>{new Date(invite.expires_at).toLocaleString('pt-BR')}</td><td><Badge tone={tone}>{label}</Badge></td><td>{new Date(invite.created_at).toLocaleString('pt-BR')}</td><td>{label === 'Ativo' && <button className="danger-btn button-sm" disabled={busy} onClick={() => action({ action: 'revoke-invite', id: invite.id }, 'Convite revogado.')}>Revogar</button>}</td></tr>; })}</tbody></table></div>{!filteredInvites.length && <div className="admin-empty">Nenhum convite encontrado.</div>}</section>}

      {tab === 'canais' && <section className="admin-card"><div className="admin-card-head"><div><h2>Canais de voz e vídeo</h2><span className="helper">Organize categorias, acesso de convidados e sala de espera.</span></div><button className="primary-btn button-sm" onClick={openCreateChannel}><Icon name="plus" size={14} /> Novo canal</button></div>{filteredChannels.length ? filteredChannels.map((channel) => <div className="channel-admin-row" key={channel.id}><div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><b># {channel.name}</b><Badge tone={channel.is_active ? 'green' : 'red'}>{channel.is_active ? 'ativo' : 'inativo'}</Badge></div><span className="helper">{channel.category || 'GERAL'} • {channel.description || 'Sem descrição'}</span></div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Badge tone={channel.guest_access ? 'purple' : 'neutral'}>{channel.guest_access ? 'Convidado' : 'Membro'}</Badge>{channel.is_waiting_room && <Badge tone="yellow">Sala de espera</Badge>}</div><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5 }}><button className="secondary-btn button-sm" onClick={() => openEditChannel(channel)}>Editar</button><button className="danger-btn button-sm" disabled={busy} onClick={() => window.confirm(`Excluir #${channel.name}?`) && action({ action: 'delete-channel', id: channel.id }, 'Canal excluído.')}>Excluir</button></div></div>) : <div className="admin-empty">Nenhum canal encontrado.</div>}</section>}

      {tab === 'config' && <section className="admin-card"><div className="admin-card-head"><div><h2>Configurações do servidor</h2><span className="helper">Controle de manutenção, logs e limite por chamada.</span></div><Badge tone="purple">Servidor</Badge></div><div className="toggle-row"><div><strong>Modo manutenção</strong><span>Usuários não administrativos recebem uma tela de manutenção.</span></div><input className="switch" type="checkbox" checked={settingsForm.maintenance_mode} onChange={(e) => setSettingsForm({ ...settingsForm, maintenance_mode: e.target.checked })} /></div><div className="toggle-row"><div><strong>Logs Discord</strong><span>Registra eventos de acesso quando o webhook estiver configurado.</span></div><input className="switch" type="checkbox" checked={settingsForm.discord_logs} onChange={(e) => setSettingsForm({ ...settingsForm, discord_logs: e.target.checked })} /></div><div style={{ paddingTop: 15 }}><div className="field"><label>Limite máximo de usuários por call</label><select className="input" value={settingsForm.max_users} onChange={(e) => setSettingsForm({ ...settingsForm, max_users: e.target.value })}><option value="ilimitado">Ilimitado</option><option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="200">200</option><option value="500">500</option></select></div></div><div className="form-actions"><button className="primary-btn" disabled={busy} onClick={saveSettings}>{busy ? <Spinner label="Salvando..." /> : <><Icon name="check" size={15} /> Salvar configurações</>}</button></div></section>}
    </div>

    <Modal open={userModal} title="Criar novo usuário" onClose={() => setUserModal(false)}><form onSubmit={createUser}><div className="field"><label>E-mail</label><input className="input" type="email" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></div><div className="field"><label>Username</label><input className="input" maxLength={32} required value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} /></div><div className="field"><label>Senha</label><input className="input" type="password" minLength={8} required value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></div><div className="field"><label>Cargo</label><select className="input" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}><option value="membro">Membro</option><option value="admin">Administrador</option></select></div><div className="modal-actions"><button type="button" className="ghost-btn" onClick={() => setUserModal(false)}>Cancelar</button><button className="primary-btn" disabled={busy}>{busy ? <Spinner label="Criando..." /> : 'Criar usuário'}</button></div></form></Modal>

    <Modal open={inviteModal} title={generatedCode ? 'Convite pronto' : 'Gerar convite'} onClose={() => setInviteModal(false)}>{generatedCode ? <><div className="invite-code-card"><div><div className="helper">Código temporário</div><div className="invite-code">{generatedCode}</div></div><button className="secondary-btn button-sm" onClick={copyCode}><Icon name="copy" size={14} /> Copiar</button></div><p className="helper" style={{ margin: '12px 0 0', lineHeight: 1.5 }}>Esse código é exibido somente agora. Guarde ou envie ao convidado antes de fechar.</p><div className="modal-actions"><button className="primary-btn" onClick={() => { setGeneratedCode(''); setInviteForm({ guestName: '', expiresMinutes: 30 }); }}>Gerar outro</button><button className="ghost-btn" onClick={() => setInviteModal(false)}>Fechar</button></div></> : <form onSubmit={generateInvite}><div className="field"><label>Nome do convidado</label><input className="input" placeholder="Ex.: João" value={inviteForm.guestName} onChange={(e) => setInviteForm({ ...inviteForm, guestName: e.target.value })} /></div><div className="field"><label>Validade</label><select className="input" value={inviteForm.expiresMinutes} onChange={(e) => setInviteForm({ ...inviteForm, expiresMinutes: Number(e.target.value) })}><option value={15}>15 minutos</option><option value={30}>30 minutos</option><option value={60}>1 hora</option><option value={180}>3 horas</option><option value={1440}>24 horas</option><option value={10080}>7 dias</option></select></div><div className="modal-actions"><button type="button" className="ghost-btn" onClick={() => setInviteModal(false)}>Cancelar</button><button className="primary-btn" disabled={busy}>{busy ? <Spinner label="Gerando..." /> : 'Gerar convite'}</button></div></form>}</Modal>

    <Modal open={channelModal} title={channelForm.id ? `Editar #${channelForm.name}` : 'Criar canal'} onClose={() => setChannelModal(false)}><form onSubmit={saveChannel}><div className="form-grid two"><div className="field"><label>Nome</label><input className="input" required maxLength={50} value={channelForm.name} onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })} /></div><div className="field"><label>Categoria</label><input className="input" maxLength={30} value={channelForm.category} onChange={(e) => setChannelForm({ ...channelForm, category: e.target.value.toUpperCase() })} /></div></div><div className="field"><label>Descrição</label><textarea className="input" maxLength={150} value={channelForm.description} onChange={(e) => setChannelForm({ ...channelForm, description: e.target.value })} placeholder="Para que este canal serve?" /></div><div className="form-grid"><div className="field"><label>Ícone</label><select className="input" value={channelForm.icon} onChange={(e) => setChannelForm({ ...channelForm, icon: e.target.value })}><option value="voice">Voz</option><option value="chat">Chat</option></select></div><div className="field"><label>Ordem</label><input className="input" type="number" min="0" value={channelForm.sort_order} onChange={(e) => setChannelForm({ ...channelForm, sort_order: Number(e.target.value) })} /></div><label className="toggle-row" style={{ border: 0 }}><span><strong>Ativo</strong></span><input className="switch" type="checkbox" checked={channelForm.is_active} onChange={(e) => setChannelForm({ ...channelForm, is_active: e.target.checked })} /></label><label className="toggle-row" style={{ border: 0 }}><span><strong>Convidado</strong></span><input className="switch" type="checkbox" checked={channelForm.guest_access} onChange={(e) => setChannelForm({ ...channelForm, guest_access: e.target.checked })} /></label></div><label className="toggle-row"><span><strong>Sala de espera</strong><em style={{ display: 'block', color: 'var(--muted)', fontStyle: 'normal', fontSize: 10 }}>Identifica este canal como recepção.</em></span><input className="switch" type="checkbox" checked={channelForm.is_waiting_room} onChange={(e) => setChannelForm({ ...channelForm, is_waiting_room: e.target.checked })} /></label><div className="modal-actions"><button type="button" className="ghost-btn" onClick={() => setChannelModal(false)}>Cancelar</button><button className="primary-btn" disabled={busy}>{busy ? <Spinner label="Salvando..." /> : 'Salvar canal'}</button></div></form></Modal>

    <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
  </main>;
}

function Stat({ label, value, icon }) {
  return <div className="stat-card"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span className="stat-label">{label}</span><span style={{ color: 'var(--purple)' }}><Icon name={icon} size={17} /></span></div><div className="stat-value">{value}</div></div>;
}
