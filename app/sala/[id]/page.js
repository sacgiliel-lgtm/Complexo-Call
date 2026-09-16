'use client';
import { useEffect, useState } from 'react'; // <-- Removido o 'use' daqui
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';

export default function SalaDeChamada({ params }) {
  // Correção: No Next.js 14, acessamos o params.id diretamente
  const roomName = params.id;
  const [token, setToken] = useState('');

  useEffect(() => {
    const pegarToken = async () => {
      const username = 'User_' + Math.floor(Math.random() * 1000); 
      try {
        const res = await fetch(`/api/token?room=${roomName}&username=${username}`);
        const data = await res.json();
        if (data.token) {
          setToken(data.token);
        } else {
          console.error("Erro ao obter token:", data);
        }
      } catch (err) {
        console.error("Falha na requisição do token", err);
      }
    };
    pegarToken();
  }, [roomName]);

  if (token === '') {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Conectando ao servidor de vídeo...</div>;
  }

  return (
    <LiveKitRoom
      video={true}
      audio={true}
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      data-lk-theme="default"
      style={{ height: '100vh', width: '100vw' }}
    >
      <VideoConference />
    </LiveKitRoom>
  );
}
