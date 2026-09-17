'use client';
import { useState, Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { LiveKitRoom, RoomAudioRenderer, VideoConference, useParticipants, useIsSpeaking } from '@livekit/components-react';
import { createClient } from '@supabase/supabase-js';
import '@livekit/components-styles';

// --- INICIALIZA O SUPABASE ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
const supabase = createClient(supabaseUrl, supabaseKey);

// --- PALETA DE CORES "COMPLEXO" ---
const cores = { 
  bg: '#0a030d',          // Fundo principal bem escuro
  sidebar: '#140a1e',     // Fundo da sidebar (roxo super escuro)
  servers: '#050108',     // Fundo da barra de servidores
  text: '#ffffff',        // Texto principal
  muted: '#a89db5',       // Texto secundário/apagado
  hover: 'rgba(232, 0, 104, 0.15)',  // Rosa transparente para hover
  active: 'rgba(155, 0, 232, 0.25)', // Roxo transparente para ativo
  green: '#23a559',       // Para status online
  red: '#e80068',         // Vermelho substituído pelo rosa neon para desconectar
  brandPink: '#e80068',
  brandPurple: '#9b00e8',
  gradient: 'linear-gradient(90deg, #e80068 0%, #9b00e8 100%)' // Gradiente da marca
};

// --- COMPONENTE DE MEMBRO ONLINE ---
function MembroConectado({ participant }) {
  const isSpeaking = useIsSpeaking(participant);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px 6px 30px', 
      borderRadius: '4px', color: isSpeaking ? cores.text : cores.muted,
      transition: 'all 0.2s ease', cursor: 'default'
    }}>
      <div style={{
        width: '24px', height: '24px', borderRadius: '50%', 
        background: cores.gradient, display: 'flex', justifyContent: 'center', alignItems: 'center',
        fontSize: '10px', color: '#fff', fontWeight: 'bold',
        border: isSpeaking ? `2px solid ${cores.brandPink}` : '2px solid transparent',
        boxShadow: isSpeaking ? `0 0 10px rgba(232, 0, 104, 0.6)` : 'none',
        transition: 'all 0.2s'
      }}>
        {participant.name ? participant.name.substring(0, 2).toUpperCase() : 'US'}
      </div>
      <span style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: isSpeaking ? `0 0 5px ${cores.brandPink}` : 'none' }}>
        {participant.name || participant.identity}
      </span>
      {!isSpeaking && !participant.isMicrophoneEnabled && (
         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={cores.brandPink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft: 'auto'}}><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12H3a9 9 0 0 0 11.5 8.65"></path></svg>
      )}
    </div>
  );
}

// --- COMPONENTE DE LISTA DE PRESENÇA ---
function ListaDePresenca({ canalAtual }) {
  const participants = useParticipants();
  if (!participants || participants.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px', marginBottom: '8px' }}>
      {participants.map(p => (
        <MembroConectado key={p.identity} participant={p} />
      ))}
    </div>
  );
}

// --- COMPONENTE PRINCIPAL ---
function ServidorContent() {
  const searchParams = useSearchParams();
  const usernameUrl = searchParams.get('user') || `User_${Math.floor(Math.random() * 1000)}`;
  const router = useRouter();

  // Estados do Usuário
  const [username, setUsername] = useState(usernameUrl);
  const [cargo, setCargo] = useState('carregando'); // admin, membro ou convidado
  // Credencial real que vai autorizar a entrada na sala no servidor:
  // { tipo: 'sessao', valor: access_token do Supabase } para membro/admin, ou
  // { tipo: 'convidado', valor: ticket assinado } para quem entrou via convite.
  const [credencial, setCredencial] = useState(null);

  // Estados da Call
  const canaisDeVoz = ['Geral', 'Jogos', 'Reunião Dev']; // No futuro, puxar do banco
  const [canalAtual, setCanalAtual] = useState(null);
  const [token, setToken] = useState('');
  const [conectando, setConectando] = useState(false);

  // Busca a credencial e o cargo do usuário assim que ele entra.
  // Se não houver nem sessão nem convite validado, não tem por que estar aqui.
  useEffect(() => {
    async function carregarPerfil() {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        const { data: perfil } = await supabase
          .from('profiles')
          .select('username, role')
          .eq('id', session.user.id)
          .single();

        setUsername(perfil?.username || session.user.email.split('@')[0]);
        setCargo(perfil?.role || 'membro');
        setCredencial({ tipo: 'sessao', valor: session.access_token });
        return;
      }

      // Sem sessão: só é legítimo estar aqui com um passe de convidado válido
      const ticket = sessionStorage.getItem('convidadoTicket');
      const nomeConvidado = sessionStorage.getItem('convidadoUsername');

      if (ticket) {
        setUsername(nomeConvidado || usernameUrl);
        setCargo('convidado');
        setCredencial({ tipo: 'convidado', valor: ticket });
      } else {
        // Ninguém logou e nenhum convite foi validado — de volta pra tela de entrada
        router.push('/');
      }
    }
    carregarPerfil();
  }, [router, usernameUrl]);

  const conectarCanal = async (canal) => {
    if (!credencial || canalAtual === canal) return;
    setConectando(true);
    setCanalAtual(canal);
    setToken('');
    try {
      const headers = credencial.tipo === 'sessao'
        ? { Authorization: `Bearer ${credencial.valor}` }
        : { 'x-guest-ticket': credencial.valor };

      const res = await fetch(`/api/token?room=${encodeURIComponent(canal)}`, { headers });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Não foi possível entrar nesta sala.');
        setCanalAtual(null);
        return;
      }

      setToken(data.token);
    } catch (e) {
      console.error(e);
      setCanalAtual(null);
    } finally {
      setConectando(false);
    }
  };

  const desconectar = () => {
    setCanalAtual(null);
    setToken('');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: cores.bg, color: cores.text, fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      {/* Barra Esquerda - Servidores */}
      <div style={{ width: '70px', backgroundColor: cores.servers, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '15px 0', gap: '10px', flexShrink: 0, borderRight: `1px solid rgba(155, 0, 232, 0.2)` }}>
        <div style={{ 
          width: '48px', height: '48px', borderRadius: '16px', background: cores.gradient, 
          display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: '900', cursor: 'pointer',
          transition: 'all 0.3s', boxShadow: `0 0 15px rgba(232, 0, 104, 0.4)`
        }} 
        onMouseOver={e => {e.currentTarget.style.borderRadius = '10px'; e.currentTarget.style.boxShadow = `0 0 20px rgba(155, 0, 232, 0.8)`}}
        onMouseOut={e => {e.currentTarget.style.borderRadius = '16px'; e.currentTarget.style.boxShadow = `0 0 15px rgba(232, 0, 104, 0.4)`}}
        >
          CPX
        </div>
      </div>

      {/* Sidebar - Canais do Servidor */}
      <div style={{ width: '250px', backgroundColor: cores.sidebar, display: 'flex', flexDirection: 'column', flexShrink: 0, borderRight: `1px solid rgba(232, 0, 104, 0.1)` }}>
        
        {/* Cabeçalho do Servidor */}
        <div style={{ padding: '20px 16px', fontWeight: '900', borderBottom: `1px solid rgba(232, 0, 104, 0.2)`, color: '#ffffff', fontSize: '20px', textTransform: 'uppercase', letterSpacing: '2px', textShadow: `2px 2px 0px ${cores.brandPurple}` }}>
          Complexo
        </div>
        
        {/* Lista de Canais */}
        <div style={{ flex: 1, padding: '15px 10px', overflowY: 'auto' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: cores.brandPink, marginBottom: '12px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px', letterSpacing: '1px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"></path></svg>
            Canais de Voz
          </div>
          
          {canaisDeVoz.map(canal => (
            <div key={canal} style={{display: 'flex', flexDirection: 'column'}}>
              {/* Nome do Canal */}
              <div 
                onClick={() => conectarCanal(canal)} 
                style={{ 
                  padding: '10px 12px', borderRadius: '6px', cursor: 'pointer', 
                  backgroundColor: canalAtual === canal ? cores.active : 'transparent', 
                  borderLeft: canalAtual === canal ? `3px solid ${cores.brandPink}` : '3px solid transparent',
                  display: 'flex', alignItems: 'center', gap: '8px', 
                  color: canalAtual === canal ? cores.text : cores.muted,
                  transition: 'all 0.2s ease', fontWeight: canalAtual === canal ? '600' : '500',
                  marginBottom: '2px'
                }} 
                onMouseOver={(e) => { if(canalAtual !== canal) { e.currentTarget.style.backgroundColor = cores.hover; e.currentTarget.style.color = cores.text; } }} 
                onMouseOut={(e) => { if(canalAtual !== canal) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = cores.muted; } }}
              >
                <span style={{color: canalAtual === canal ? cores.brandPink : cores.brandPurple, fontSize: '18px'}}>#</span> {canal}
              </div>
              
              {canalAtual === canal && token && (
                <LiveKitRoom token={token} serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL} connect={true}>
                  <ListaDePresenca canalAtual={canal} />
                </LiveKitRoom>
              )}
            </div>
          ))}
        </div>

        {/* Rodapé - Perfil do Usuário Logado e Controles */}
        <div style={{ padding: '12px', backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: '10px', borderTop: `1px solid rgba(155, 0, 232, 0.2)` }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: cores.gradient, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '14px', color: '#fff', flexShrink: 0, fontWeight: 'bold', boxShadow: `0 0 10px rgba(232, 0, 104, 0.3)` }}>
            {username.substring(0,2).toUpperCase()}
          </div>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span style={{ fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' }}>
              {username}
              {cargo === 'admin' && <span style={{fontSize: '9px', background: cores.brandPink, color: '#fff', padding: '2px 4px', borderRadius: '4px', marginLeft: '6px', verticalAlign: 'middle'}}>ADMIN</span>}
            </span>
            <span style={{ fontSize: '11px', color: cores.green, fontWeight: 'bold' }}>{canalAtual ? 'Online na Call' : 'Online'}</span>
          </div>
          
          {/* Botão Painel Admin */}
          {cargo === 'admin' && (
            <button 
              onClick={() => router.push('/admin')} 
              title="Acessar Painel Admin" 
              style={{ background: 'transparent', border: `1px solid ${cores.brandPurple}`, color: cores.brandPurple, borderRadius: '6px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
              onMouseOver={e => {e.currentTarget.style.backgroundColor = cores.brandPurple; e.currentTarget.style.color = '#fff'}}
              onMouseOut={e => {e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = cores.brandPurple}}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
          )}

          {/* Botão Desconectar Call */}
          {canalAtual && (
            <button 
              onClick={desconectar} 
              title="Desconectar" 
              style={{ background: 'transparent', border: `1px solid ${cores.red}`, color: cores.red, borderRadius: '6px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
              onMouseOver={e => {e.currentTarget.style.backgroundColor = cores.red; e.currentTarget.style.color = '#fff'}}
              onMouseOut={e => {e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = cores.red}}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3H6a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h4M16 17l5-5-5-5M19 12H9"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Área Principal - Chat e Vídeo */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundImage: 'radial-gradient(circle at center, #1a0822 0%, #0a030d 100%)' }}>
        
        {/* Topbar da Área de Vídeo */}
        <div style={{ height: '64px', borderBottom: `1px solid rgba(232, 0, 104, 0.1)`, display: 'flex', alignItems: 'center', padding: '0 20px', fontWeight: 'bold', flexShrink: 0, gap: '10px' }}>
          <span style={{color: cores.brandPurple, fontSize: '24px'}}>#</span>
          {canalAtual ? (
            <span style={{color: '#fff', fontSize: '18px'}}>{canalAtual} 
              <span style={{background: cores.gradient, color: '#fff', marginLeft: '12px', fontSize: '11px', fontWeight: 'bold', padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '1px'}}>
                Call Ativa
              </span>
            </span>
          ) : (
             <span style={{color: cores.muted}}>Nenhum canal selecionado</span>
          )}
        </div>

        {/* Palco do Vídeo */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', padding: canalAtual ? '0' : '20px' }}>
          
          {conectando && (
            <div style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10, backgroundColor: 'rgba(10, 3, 13, 0.85)', backdropFilter: 'blur(5px)'}}>
              <span style={{color: cores.brandPink, fontWeight: 'bold', animation: 'pulse 1.5s infinite', fontSize: '18px', textTransform: 'uppercase', letterSpacing: '2px'}}>Estabelecendo Conexão...</span>
            </div>
          )}

          {canalAtual && token ? (
            <LiveKitRoom 
              video={false} audio={true} token={token} serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL} 
              data-lk-theme="default" 
              style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100%', overflow: 'hidden' }}
            >
              <RoomAudioRenderer />
              <VideoConference />
            </LiveKitRoom>
          ) : (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: cores.muted, flexDirection: 'column', gap: '20px', backgroundColor: 'rgba(20, 10, 30, 0.4)', borderRadius: '12px', border: `1px dashed ${cores.brandPurple}`, margin: '20px' }}>
              <div style={{width: '90px', height: '90px', borderRadius: '50%', background: `linear-gradient(135deg, rgba(232,0,104,0.2) 0%, rgba(155,0,232,0.2) 100%)`, display: 'flex', justifyContent: 'center', alignItems: 'center', border: `1px solid ${cores.brandPink}`}}>
                 <svg width="45" height="45" viewBox="0 0 24 24" fill="none" stroke={cores.brandPink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
              </div>
              <h3 style={{color: '#fff', margin: 0, fontSize: '24px', letterSpacing: '1px'}}>Pronto para a ação?</h3>
              <p style={{margin: 0, fontSize: '15px', maxWidth: '350px', textAlign: 'center', color: cores.muted}}>Selecione um canal de voz no menu à esquerda para entrar na call com o Complexo.</p>
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
}

export default function ServidorPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0a030d', color: '#e80068', fontWeight: 'bold' }}>CARREGANDO COMPLEXO...</div>}>
      <ServidorContent />
    </Suspense>
  );
}
