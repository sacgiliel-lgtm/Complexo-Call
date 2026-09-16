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
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh', 
      fontFamily: 'sans-serif', 
      backgroundImage: 'url("/fundo-login.jpg")', 
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      position: 'relative'
    }}>
      
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 5, 20, 0.65)', 
        zIndex: 0
      }}></div>

      <div style={{ 
        backgroundColor: 'rgba(20, 10, 30, 0.75)', 
        backdropFilter: 'blur(8px)', 
        padding: '50px 40px', 
        borderRadius: '12px', 
        boxShadow: '0 0 30px rgba(232, 0, 104, 0.4)', 
        border: '2px solid #e80068', 
        width: '320px', 
        textAlign: 'center',
        zIndex: 1
      }}>
        <h2 style={{ 
          margin: '0 0 30px 0', 
          color: '#ffffff',
          fontSize: '32px',
          fontWeight: '900',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          textShadow: '3px 3px 0px #9b00e8'
        }}>
          Complexo
        </h2>

        <form onSubmit={entrar} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <input 
            type="text" 
            placeholder="Nome do Personagem" 
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            style={{ 
              padding: '15px', 
              borderRadius: '6px', 
              border: '1px solid #9b00e8', 
              backgroundColor: 'rgba(0, 0, 0, 0.6)', 
              color: '#ffffff', 
              outline: 'none',
              fontSize: '16px',
              textAlign: 'center'
            }}
            required
          />
          <button type="submit" style={{ 
            padding: '15px', 
            borderRadius: '6px', 
            border: 'none', 
            background: 'linear-gradient(90deg, #e80068 0%, #9b00e8 100%)', 
            color: 'white', 
            fontWeight: '900', 
            fontSize: '16px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            letterSpacing: '1px',
            boxShadow: '0 4px 15px rgba(232, 0, 104, 0.5)' 
          }}>
            Entrar na Call
          </button>
        </form>
      </div>
    </div>
  );
}
