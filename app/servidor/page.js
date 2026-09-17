'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Icon, Avatar, Badge, EmptyState, Modal, Spinner, ToastStack } from '../../components/ui';
import { RoomExperience } from '../../components/RoomExperience';
import '@livekit/components-styles';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function ServidorPage() {
  const router = useRouter();
  const searchRef = useRef(null);
  const [user, setUser] = useState(null);
  const [cred, setCred] = useState(null);
  const [channels, setChannels] = useState([]);
  const [active, setActive] = useState(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [rightTab, setRightTab] = useState('participants');
  const [search, setSearch] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [presence, setPresence] = useState('online');
  const [theme, setTheme] = useState('cpx');
  const [sounds, setSounds] = useState(true);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [toasts, setToasts] = useState([]);

  function pushToast(toast) {
    const item = { id: `${Date.now()}-${Math.random()}`, type: toast.type || 'info', title: toast.title || 'CPX', message: toast.message || '' };
    setToasts((current) => [...current.slice(-3), item]);
    if (sounds && typeof window !== 'undefined' && window.AudioContext) {
      try { const ctx = new window.AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = toast.type === 'error' ? 180 : 520; gain.gain.value = 0.035; osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.06); } catch {}
    }
    window.setTimeout(() => setToasts((current) => current.filter((entry) => entry.id !== item.id)), 4500);
  }

  useEffect(() => {
    const savedTheme = localStorage.getItem('cpx-theme');
    const savedSounds = localStorage.getItem('cpx-sounds');
    if (savedTheme) setTheme(savedTheme);
    if (savedSounds !== null) setSounds(savedSounds !== 'false');
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : '';
    localStorage.setItem('cpx-theme', theme);
  }, [theme]);

  useEffect(() => { localStorage.setItem('cpx-sounds', String(sounds)); }, [sounds]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        if (session) {
          const { data: profile } = await supabase.from('profiles').select('username,role,status,presence_status').eq('id', session.user.id).single();
          if (!profile || profile.status === 'suspenso') { await supabase.auth.signOut(); router.replace('/'); return; }
          setUser({ username: profile.username || session.user.email?.split('@')[0] || 'Membro', role: profile.role || 'membro', type: 'member' });
          setPresence(profile.presence_status || 'online');
          setCred({ type: 'session', value: session.access_token });
        } else {
          const response = await fetch('/api/guest/session', { cache: 'no-store' });
          const json = await response.json();
          if (!response.ok) { router.replace('/'); return; }
          setUser({ username: json.username, role: 'convidado', type: 'guest' });
          setPresence('online');
          setCred({ type: 'guest' });
        }
      } catch { setError('Não foi possível inicializar sua sessão.'); }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [router]);

  useEffect(() => {
    if (!cred) return;
    let mounted = true;
    async function loadChannels() {
      const headers = cred.type === 'session' ? { Authorization: `Bearer ${cred.value}` } : {};
      const response = await fetch('/api/channels', { headers, cache: 'no-store' });
      const json = await response.json();
      if (!mounted) return;
      if (!response.ok) { setMaintenance(response.status === 503 || json.maintenance); setChannels([]); setError(json.error || 'Não foi possível carregar os canais.'); return; }
      setMaintenance(!!json.maintenance); setChannels(json.channels || []); setError('');
    }
    loadChannels();
    const interval = window.setInterval(loadChannels, 20000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [cred]);

  useEffect(() => {
    if (!cred || cred.type !== 'session') return;
    const send = () => fetch('/api/presence', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cred.value}` }, body: JSON.stringify({ status: presence }) }).catch(() => {});
    send();
    const interval = window.setInterval(send, 30000);
    return () => window.clearInterval(interval);
  }, [cred, presence]);

  useEffect(() => {
    const keyHandler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, []);

  async function connect(channel) {
    if (maintenance && user?.role !== 'admin') return pushToast({ type: 'error', title: 'Servidor em manutenção', message: 'Aguarde até que a manutenção seja encerrada.' });
    if (active?.id === channel.id && token) return;
    setConnecting(true); setError(''); setActive(channel); setToken(''); setMessages([]); setRightOpen(true);
    try {
      const headers = cred?.type === 'session' ? { Authorization: `Bearer ${cred.value}` } : {};
      const response = await fetch(`/api/token?room=${encodeURIComponent(channel.name)}`, { headers, cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Não foi possível entrar no canal.');
      setToken(json.token);
      await loadMessages(channel.id, true);
      pushToast({ type: 'success', title: 'Conectado', message: `Você entrou em #${channel.name}.` });
    } catch (connectError) {
      setActive(null); setToken(''); setError(connectError.message); pushToast({ type: 'error', title: 'Não foi possível entrar', message: connectError.message });
    } finally { setConnecting(false); setSidebarOpen(false); }
  }

  function disconnect() { setActive(null); setToken(''); setMessages([]); setMessageText(''); setRightOpen(false); }

  async function loadMessages(channelId, silent = false) {
    if (!channelId || !cred) return;
    const headers = cred.type === 'session' ? { Authorization: `Bearer ${cred.value}` } : {};
    try {
      const response = await fetch(`/api/messages?channel=${encodeURIComponent(channelId)}`, { headers, cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Não foi possível carregar o chat.');
      setMessages((current) => {
        const incoming = json.messages || [];
        const lastIncoming = incoming[incoming.length - 1];
        const lastCurrent = current[current.length - 1];
        if (!silent && lastIncoming && lastIncoming.id !== lastCurrent?.id && lastIncoming.sender_name !== user?.username && rightTab !== 'chat') pushToast({ type: 'info', title: 'Nova mensagem', message: `${lastIncoming.sender_name}: ${lastIncoming.content.slice(0, 70)}` });
        return incoming;
      });
    } catch (messageError) { if (!silent) pushToast({ type: 'error', title: 'Chat indisponível', message: messageError.message }); }
  }

  useEffect(() => {
    if (!active || !cred) return;
    loadMessages(active.id, true);
    const interval = window.setInterval(() => loadMessages(active.id), 3000);
    return () => window.clearInterval(interval);
  }, [active?.id, cred, rightTab, user?.username]);

  async function sendMessage(event) {
    event.preventDefault();
    if (!active || !messageText.trim() || !cred) return;
    const headers = { 'Content-Type': 'application/json' };
    if (cred.type === 'session') headers.Authorization = `Bearer ${cred.value}`;
    const response = await fetch('/api/messages', { method: 'POST', headers, body: JSON.stringify({ channelId: active.id, content: messageText.trim() }) });
    const json = await response.json();
    if (!response.ok) return pushToast({ type: 'error', title: 'Mensagem não enviada', message: json.error || 'Tente novamente.' });
    setMessageText(''); setMessages((current) => [...current, json.message]);
  }

  async function moderate(room, identity, action) {
    const response = await fetch('/api/moderation', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cred.value}` }, body: JSON.stringify({ room, identity, action }) });
    const json = await response.json();
    if (!response.ok) return pushToast({ type: 'error', title: 'Moderação', message: json.error || 'Operação não concluída.' });
    pushToast({ type: 'success', title: 'Moderação aplicada', message: action === 'disconnect' ? `${identity.replace(/^guest:/, '')} foi desconectado.` : 'Microfone silenciado.' });
  }

  async function logout() {
    try { if (user?.type === 'member') await supabase.auth.signOut(); else await fetch('/api/guest/logout', { method: 'POST' }); }
    finally { router.replace('/'); }
  }

  function handleRightTab(tab, open = true) { setRightTab(tab); setRightOpen(open); }

  const groupedChannels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return channels.filter((channel) => !q || `${channel.name} ${channel.category} ${channel.description || ''}`.toLowerCase().includes(q)).reduce((groups, channel) => { const category = channel.category || 'GERAL'; groups[category] ||= []; groups[category].push(channel); return groups; }, {});
  }, [channels, search]);

  if (loading) return <main className="login-page"><Spinner label="Preparando seu espaço no CPX..." /></main>;

  return <main className="server-shell no-right">
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="sidebar-head"><div className="sidebar-brand"><div className="mini-logo">CPX</div><div className="sidebar-title"><strong>CPX CALL</strong><span>Comunidade de voz e vídeo</span></div></div><button className="icon-btn mobile-only" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><Icon name="close" /></button></div>
      {maintenance && <div className="maintenance-banner"><b>Modo manutenção</b><br />Novos acessos estão temporariamente bloqueados.</div>}
      <div className="sidebar-scroll">
        {Object.entries(groupedChannels).map(([category, items]) => <div className="side-section" key={category}><div className="side-section-title">{category}</div>{items.map((channel) => <button key={channel.id} className={`channel-item ${active?.id === channel.id ? 'active' : ''}`} onClick={() => connect(channel)}><span className="channel-icon">{channel.icon === 'chat' ? <Icon name="chat" size={15} /> : <Icon name="phone" size={15} />}</span><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.name}</span>{active?.id === channel.id && <span className="channel-count">●</span>}</button>)}</div>)}
        {!Object.keys(groupedChannels).length && <EmptyState icon="search" title="Nenhum canal" description={maintenance ? 'O servidor está em manutenção.' : 'Nenhum canal corresponde à sua busca.'} />}
      </div>
      <div className="sidebar-user">
        {profileOpen && <div className="profile-menu"><div className="menu-label">Status</div><button onClick={() => setPresence('online')}><i className="presence-dot" /> Online</button><button onClick={() => setPresence('away')}><i className="presence-dot away" /> Ausente</button><button onClick={() => setPresence('busy')}><i className="presence-dot busy" /> Não perturbe</button><div className="menu-divider" /><button onClick={() => { setSettingsOpen(true); setProfileOpen(false); }}><Icon name="settings" size={15} /> Preferências</button>{user?.role === 'admin' && <button onClick={() => router.push('/admin')}><Icon name="shield" size={15} /> Centro de comando</button>}<button onClick={logout}><Icon name="logout" size={15} /> Encerrar sessão</button></div>}
        <div className="user-card"><Avatar name={user?.username} size="md" status={presence} /><div className="user-meta"><strong>{user?.username}</strong><span>{user?.role === 'admin' ? 'Administrador' : user?.role === 'convidado' ? 'Convidado' : 'Membro'}</span></div><div className="user-actions"><button className="icon-btn" onClick={() => setProfileOpen((value) => !value)} aria-label="Abrir perfil"><Icon name="settings" size={16} /></button></div></div>
      </div>
    </aside>

    <section className="main-area">
      <header className="topbar"><button className="icon-btn mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir canais"><Icon name="menu" /></button><div className="topbar-channel">{active ? <><span className="hash">#</span><strong>{active.name}</strong><span className="topbar-sub">{active.description || 'Canal de voz e vídeo'}</span></> : <><span className="hash">CPX</span><strong>Área principal</strong><span className="topbar-sub">Selecione um canal para começar</span></>}</div><span className="topbar-spacer" /><div className="search-box"><Icon name="search" size={16} /><input ref={searchRef} className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar canais...  Ctrl+K" aria-label="Buscar canais" /></div><button className="icon-btn mobile-only" onClick={() => handleRightTab('participants', !rightOpen)} aria-label="Participantes"><Icon name="users" /></button><button className="icon-btn" onClick={() => handleRightTab('chat')} aria-label="Chat"><Icon name="chat" /></button><button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Configurações"><Icon name="settings" /></button></header>
      {connecting && <div className="call-loading"><Spinner label="Estabelecendo conexão segura..." /></div>}
      {!active || !token ? <div className="main-content"><section className="call-area"><div className="call-empty"><div className="empty-card"><div className="empty-icon"><Icon name="phone" size={28} /></div><h2 style={{ margin: '0 0 8px' }}>Seu espaço no CPX</h2><p style={{ color: 'var(--muted)', lineHeight: 1.6, fontSize: 13 }}>{maintenance ? 'O servidor está em manutenção. Usuários sem permissão de administrador não podem iniciar novas chamadas neste momento.' : 'Escolha um canal na lateral para entrar na chamada. Você poderá conversar por texto, usar câmera, compartilhar a tela e controlar seu áudio.'}</p><div style={{ marginTop: 17, display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}><Badge tone="purple">Voz</Badge><Badge tone="purple">Vídeo</Badge><Badge tone="purple">Chat</Badge><Badge tone="green">Acesso controlado</Badge></div></div></div></section></div> : <RoomExperience token={token} serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL} channel={active} user={user} rightTab={rightTab} rightPanelOpen={rightOpen} onRightTab={handleRightTab} messages={messages} messageText={messageText} setMessageText={setMessageText} onSendMessage={sendMessage} onToast={pushToast} onDisconnect={disconnect} onModerate={moderate} participantFilter={rightTab === 'participants' ? search : ''} theme={theme === 'light' ? 'theme-light' : 'cpx'} />}
    </section>

    <button className="mobile-dim" aria-label="Fechar paineis" onClick={() => { setSidebarOpen(false); setRightOpen(false); }} style={{ display: sidebarOpen || (rightOpen && !!active) ? 'block' : 'none', position: 'fixed', inset: 0, zIndex: 50, border: 0, background: 'rgba(0,0,0,.58)' }} />

    <Modal open={settingsOpen} title="Preferências do CPX" onClose={() => setSettingsOpen(false)}>
      <div className="field"><label>Aparência</label><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><button className="secondary-btn" onClick={() => setTheme('cpx')} style={{ borderColor: theme === 'cpx' ? 'var(--purple)' : undefined }}><Icon name="moon" size={15} /> CPX Dark</button><button className="secondary-btn" onClick={() => setTheme('light')} style={{ borderColor: theme === 'light' ? 'var(--purple)' : undefined }}><Icon name="sun" size={15} /> Claro</button></div></div>
      <div className="toggle-row"><div><strong>Sons da interface</strong><span>Notificações discretas ao entrar, sair ou receber eventos.</span></div><input className="switch" type="checkbox" checked={sounds} onChange={(e) => setSounds(e.target.checked)} /></div>
      <div className="toggle-row"><div><strong>Atalhos de teclado</strong><span>M = microfone · C = câmera · S = tela · Esc = sair.</span></div><Badge tone="green">Ativo</Badge></div>
      <div className="modal-actions"><button className="primary-btn" onClick={() => setSettingsOpen(false)}>Fechar</button></div>
    </Modal>
    <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
  </main>;
}
