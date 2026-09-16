'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LiveKitRoom, RoomAudioRenderer, ControlBar, GridLayout, ParticipantTile, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';

// Sub-componente para gerenciar a renderização dos vídeos de forma inteligente
function AreaDeVideo() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  return (
    <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <GridLayout tracks={tracks} style={{ height: '100%', minHeight: '300px' }}>
        <ParticipantTile />
      </GridLayout>
    </div>
  );
}

function ServidorContent() {
  const searchParams = useSearchParams();
  const username = searchParams.get('user') || `User_${Math.floor(Math.random() * 1000)}`;

  const canaisDeVoz = ['Geral', 'Jogos', 'Reunião Dev'];
  const [canalAtual, setCanalAtual] = useState(null);
  const [token, setToken] = useState('');

  const conectarCanal = async (canal) => {
    if (canalAtual === canal) return;
    setCanalAtual(canal);
    setToken(''); // Limpa a conexão anterior
    try {
      const res = await fetch(`/api/token?room=${encodeURIComponent(canal)}&username=${encodeURIComponent(username)}`);
      const data = await res.json();
      setToken(data.token);
    } catch (e) {
      console.error(e);
    }
  };

  const desconectar = () => {
    setCanalAtual(null);
    setToken('');
  };

  // Paleta de cores do Discord
  const cores = {
    bg: '#313338',
    sidebar: '#2b2d31',
    servers: '#1e1f22',
    text: '#dbdee1',
    hover: '#3f4147',
    active: '#404249',
    green: '#23a559',
    red: '#da373c',
    brand: '#5865F2'
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: cores.bg, color: cores.text, fontFamily: 'sans-serif' }}>
      {/* Barra Esquerda - Servidores */}
      <div style={{ width: '70px', backgroundColor: cores.servers, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '15px 0', gap: '10px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: cores.brand, display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', cursor: 'pointer' }}>
          M
        </div>
      </div>

      {/* Sidebar - Canais do Servidor */}
      <div style={{ width: '240px', backgroundColor: cores.sidebar, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', fontWeight: 'bold', borderBottom: `1px solid ${cores.servers}`, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
          Meu Servidor
        </div>
        
        <div style={{ flex: 1, padding: '15px 10px' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#949ba4', marginBottom: '8px', textTransform: 'uppercase' }}>
            🔊 Canais de Voz
          </div>
          {canaisDeVoz.map(canal => (
            <div 
              key={canal}
              onClick={() => conectarCanal(canal)}
              style={{
                padding: '8px 10px', 
                marginBottom: '4px', 
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: canalAtual === canal ? cores.active : 'transparent',
                display: 'flex', alignItems: 'center', gap: '8px',
                color: canalAtual === canal ? '#fff' : '#949ba4'
              }}
              onMouseOver={(e) => { if(canalAtual !== canal) { e.currentTarget.style.backgroundColor = cores.hover; e.currentTarget.style.color = '#dbdee1'; } }}
              onMouseOut={(e) => { if(canalAtual !== canal) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#949ba4'; } }}
            >
              # {canal}
            </div>
          ))}
        </div>

        {/* Rodapé - Perfil e Controles */}
        <div style={{ padding: '10px', backgroundColor: '#232428', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: cores.green, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '12px', color: '#fff' }}>
            {username.substring(0,2).toUpperCase()}
          </div>
          <div style={{ flex: 1, fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {username}
          </div>
          {canalAtual && (
            <button onClick={desconectar} title="Desconectar" style={{ background: cores.hover, border: 'none', color: cores.red, borderRadius: '4px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3H6a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h4M16 17l5-5-5-5M19 12H9"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Área Principal - Chat e Vídeo */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: '52px', borderBottom: `1px solid ${cores.servers}`, display: 'flex', alignItems: 'center', padding: '0 15px', fontWeight: 'bold', backgroundColor: cores.bg }}>
          {canalAtual ? `Conectado no canal: ${canalAtual}` : '👋 Bem-vindo! Selecione um canal de voz à esquerda.'}
        </div>

        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {canalAtual && token ? (
            <LiveKitRoom
              video={false} 
              audio={true} // O áudio liga por padrão ao entrar, estilo Discord
              token={token}
              serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
              data-lk-theme="default"
              style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
            >
              {/* Processa o áudio em background */}
              <RoomAudioRenderer />
              
              {/* O Grid de vídeos renderiza dinamicamente apenas quem ligar a câmera/tela */}
              <AreaDeVideo />

              {/* Controles do Usuário (Microfone, Câmera, Compartilhar Tela) */}
              <div style={{ padding: '15px', backgroundColor: cores.sidebar, display: 'flex', justifyContent: 'center', borderTop: `1px solid ${cores.servers}` }}>
                {/* Desabilitamos o botão de 'leave' nativo porque criamos o nosso próprio no rodapé da Sidebar */}
                <ControlBar variation="minimal" controls={{ camera: true, microphone: true, screenShare: true, chat: true, leave: false }} />
              </div>
            </LiveKitRoom>
          ) : (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#949ba4', flexDirection: 'column', gap: '20px' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
              Nenhum canal selecionado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ServidorPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#313338', color: '#fff' }}>Carregando...</div>}>
      <ServidorContent />
    </Suspense>
  );
}
