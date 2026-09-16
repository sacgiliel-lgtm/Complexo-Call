'use client';
import { useState, Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { LiveKitRoom, RoomAudioRenderer, VideoConference, useParticipants, useIsSpeaking } from '@livekit/components-react';
import '@livekit/components-styles';

// --- COMPONENTE DE MEMBRO ONLINE ---
// Este componente renderiza a bolinha de usuário debaixo do canal
function MembroConectado({ participant }) {
  const isSpeaking = useIsSpeaking(participant);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px 6px 30px', 
      borderRadius: '4px', color: isSpeaking ? '#fff' : '#949ba4',
      transition: 'all 0.2s ease', cursor: 'default'
    }}>
      {/* Avatar do Usuário */}
      <div style={{
        width: '24px', height: '24px', borderRadius: '50%', 
        backgroundColor: '#5865F2', display: 'flex', justifyContent: 'center', alignItems: 'center',
        fontSize: '10px', color: '#fff', fontWeight: 'bold',
        // Borda verde pulsante se estiver falando
        border: isSpeaking ? '2px solid #23a559' : '2px solid transparent',
        boxShadow: isSpeaking ? '0 0 8px rgba(35, 165, 89, 0.4)' : 'none'
      }}>
        {participant.name ? participant.name.substring(0, 2).toUpperCase() : 'US'}
      </div>
      <span style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {participant.name || participant.identity}
      </span>
      {/* Ícone de Mutado se não estiver falando e estiver silenciado (opcional visual) */}
      {!isSpeaking && !participant.isMicrophoneEnabled && (
         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ed4245" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft: 'auto'}}><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12H3a9 9 0 0 0 11.5 8.65"></path></svg>
      )}
    </div>
  );
}

// --- COMPONENTE DE LISTA DE PRESENÇA ---
function ListaDePresenca({ canalAtual }) {
  // Puxa todos os participantes da sala atual via LiveKit
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
  const username = searchParams.get('user') || `User_${Math.floor(Math.random() * 1000)}`;

  const canaisDeVoz = ['Geral', 'Jogos', 'Reunião Dev'];
  const [canalAtual, setCanalAtual] = useState(null);
  const [token, setToken] = useState('');
  const [conectando, setConectando] = useState(false);

  const conectarCanal = async (canal) => {
    if (canalAtual === canal) return;
    setConectando(true);
    setCanalAtual(canal);
    setToken(''); 
    try {
      const res = await fetch(`/api/token?room=${encodeURIComponent(canal)}&username=${encodeURIComponent(username)}`);
      const data = await res.json();
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

  const cores = { bg: '#313338', sidebar: '#2b2d31', servers: '#1e1f22', text: '#dbdee1', hover: '#3f4147', active: '#404249', green: '#23a559', red: '#da373c', brand: '#5865F2' };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: cores.bg, color: cores.text, fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      {/* Barra Esquerda - Servidores (Opcional, estilo Discord) */}
      <div style={{ width: '70px', backgroundColor: cores.servers, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '15px 0', gap: '10px', flexShrink: 0 }}>
        <div style={{ 
          width: '48px', height: '48px', borderRadius: '24px', backgroundColor: cores.brand, 
          display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', cursor: 'pointer',
          transition: 'all 0.2s', boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
        }} 
        onMouseOver={e => e.currentTarget.style.borderRadius = '12px'}
        onMouseOut={e => e.currentTarget.style.borderRadius = '24px'}
        >
          CPX
        </div>
      </div>

      {/* Sidebar - Canais do Servidor */}
      <div style={{ width: '250px', backgroundColor: cores.sidebar, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        
        {/* Cabeçalho do Servidor */}
        <div style={{ padding: '16px', fontWeight: '900', borderBottom: `1px solid ${cores.servers}`, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', color: '#fff', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Complexo
        </div>
        
        {/* Lista de Canais */}
        <div style={{ flex: 1, padding: '15px 10px', overflowY: 'auto' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#949ba4', marginBottom: '8px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"></path></svg>
            Canais de Voz
          </div>
          
          {canaisDeVoz.map(canal => (
            <div key={canal} style={{display: 'flex', flexDirection: 'column'}}>
              {/* Nome do Canal */}
              <div 
                onClick={() => conectarCanal(canal)} 
                style={{ 
                  padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', 
                  backgroundColor: canalAtual === canal ? cores.active : 'transparent', 
                  display: 'flex', alignItems: 'center', gap: '8px', 
                  color: canalAtual === canal ? '#fff' : '#949ba4',
                  transition: 'all 0.1s ease', fontWeight: canalAtual === canal ? '600' : '500'
                }} 
                onMouseOver={(e) => { if(canalAtual !== canal) { e.currentTarget.style.backgroundColor = cores.hover; e.currentTarget.style.color = '#dbdee1'; } }} 
                onMouseOut={(e) => { if(canalAtual !== canal) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#949ba4'; } }}
              >
                <span style={{color: '#80848e', fontSize: '18px'}}>#</span> {canal}
              </div>
              
              {/* Se o canal atual for este, exibe quem está dentro dele */}
              {canalAtual === canal && token && (
                <LiveKitRoom token={token} serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL} connect={true}>
                  <ListaDePresenca canalAtual={canal} />
                </LiveKitRoom>
              )}
            </div>
          ))}
        </div>

        {/* Rodapé - Perfil do Usuário Logado */}
        <div style={{ padding: '10px', backgroundColor: '#232428', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: cores.green, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '12px', color: '#fff', flexShrink: 0, fontWeight: 'bold' }}>
            {username.substring(0,2).toUpperCase()}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span style={{ fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' }}>{username}</span>
            <span style={{ fontSize: '11px', color: '#949ba4' }}>{canalAtual ? 'Online' : 'Invisível'}</span>
          </div>
          
          {canalAtual && (
            <button 
              onClick={desconectar} 
              title="Desconectar" 
              style={{ background: cores.hover, border: 'none', color: cores.red, borderRadius: '6px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
              onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(218, 55, 60, 0.2)'}
              onMouseOut={e => e.currentTarget.style.backgroundColor = cores.hover}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3H6a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h4M16 17l5-5-5-5M19 12H9"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Área Principal - Chat e Vídeo com Design Moderno */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: cores.bg }}>
        
        {/* Topbar da Área de Vídeo */}
        <div style={{ height: '52px', borderBottom: `1px solid ${cores.servers}`, display: 'flex', alignItems: 'center', padding: '0 20px', fontWeight: 'bold', backgroundColor: cores.bg, flexShrink: 0, gap: '10px' }}>
          <span style={{color: '#80848e', fontSize: '20px'}}>#</span>
          {canalAtual ? (
            <span style={{color: '#fff'}}>{canalAtual} <span style={{color: cores.brand, marginLeft: '10px', fontSize: '12px', fontWeight: 'normal', backgroundColor: 'rgba(88, 101, 242, 0.2)', padding: '2px 6px', borderRadius: '4px'}}>Call Ativa</span></span>
          ) : (
             <span style={{color: '#949ba4'}}>Nenhum canal selecionado</span>
          )}
        </div>

        {/* Palco do Vídeo */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', padding: canalAtual ? '0' : '20px' }}>
          
          {conectando && (
            <div style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10, backgroundColor: 'rgba(49, 51, 56, 0.8)'}}>
              <span style={{color: '#fff', fontWeight: 'bold', animation: 'pulse 1.5s infinite'}}>Conectando ao servidor...</span>
            </div>
          )}

          {canalAtual && token ? (
            <LiveKitRoom 
              video={false} audio={true} token={token} serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL} 
              data-lk-theme="default" 
              style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100%', overflow: 'hidden' }}
            >
              <RoomAudioRenderer />
              {/* O VideoConference agora renderiza lindamente no centro */}
              <VideoConference />
            </LiveKitRoom>
          ) : (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#949ba4', flexDirection: 'column', gap: '20px', backgroundColor: cores.sidebar, borderRadius: '8px', border: `1px dashed ${cores.servers}` }}>
              <div style={{width: '80px', height: '80px', borderRadius: '50%', backgroundColor: cores.servers, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                 <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#5865F2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
              </div>
              <h3 style={{color: '#fff', margin: 0}}>Pronto para jogar?</h3>
              <p style={{margin: 0, fontSize: '14px', maxWidth: '300px', textAlign: 'center'}}>Selecione um canal de voz à esquerda para entrar na call e conversar com a galera.</p>
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
}

export default function ServidorPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#313338', color: '#fff' }}>Carregando Base...</div>}>
      <ServidorContent />
    </Suspense>
  );
}
