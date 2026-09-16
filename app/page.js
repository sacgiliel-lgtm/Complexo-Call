'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [nome, setNome] = useState('');
  const router = useRouter();

  const entrar = (e) => {
    e.preventDefault();
    if (nome.trim()) {
      router.push(`/servidor?user=${encodeURIComponent(nome.trim())}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', backgroundColor: '#313338' }}>
      <div style={{ backgroundColor: '#2b2d31', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)', width: '300px', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 20px 0', color: '#f2f3f5' }}>Bem-vindo</h2>
        <form onSubmit={entrar} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input 
            type="text" 
            placeholder="Como quer ser chamado?" 
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            style={{ padding: '12px', borderRadius: '4px', border: 'none', backgroundColor: '#1e1f22', color: '#dbdee1', outline: 'none' }}
            required
          />
          <button type="submit" style={{ padding: '12px', borderRadius: '4px', border: 'none', backgroundColor: '#5865F2', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>
            Entrar no Servidor
          </button>
        </form>
      </div>
    </div>
  );
}
