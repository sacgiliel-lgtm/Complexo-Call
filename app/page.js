'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [sala, setSala] = useState('');
  const router = useRouter();

  const entrarNaSala = (e) => {
    e.preventDefault();
    if (sala.trim()) {
      router.push(`/sala/${sala.trim()}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <h1>Bem-vindo ao Sistema de Call</h1>
      <form onSubmit={entrarNaSala} style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        <input 
          type="text" 
          placeholder="Digite o nome da sala..." 
          value={sala}
          onChange={(e) => setSala(e.target.value)}
          style={{ padding: '10px', borderRadius: '5px', border: '1px solid #333', color: '#000' }}
        />
        <button type="submit" style={{ padding: '10px 20px', borderRadius: '5px', border: 'none', backgroundColor: '#0070f3', color: 'white', cursor: 'pointer' }}>
          Entrar / Criar
        </button>
      </form>
    </div>
  );
}
