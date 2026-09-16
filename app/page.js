'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function Home() {
  const [modo, setModo] = useState('login'); 
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Autenticação com Email e Senha via Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      alert('Erro ao logar: ' + error.message);
      setLoading(false);
      return;
    }

    // Pega o nome do email antes do @ para usar como username
    const username = data.user.email.split('@')[0];
    router.push(`/servidor?user=${encodeURIComponent(username)}`);
  };

  const handleConvite = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/validate-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codigo.trim() })
      });

      const result = await res.json();

      if (!res.ok) {
        alert(result.error || 'Erro ao validar o convite.');
        setLoading(false);
        return;
      }

      // Sucesso! Convite queimado. Entra como Visitante.
      const username = 'Visitante_' + codigo.trim();
      router.push(`/servidor?user=${encodeURIComponent(username)}`);
      
    } catch (err) {
      alert('Erro de conexão com o servidor.');
      setLoading(false);
    }
  };

  const inputStyle = {
    padding: '15px', borderRadius: '6px', border: '1px solid #9b00e8',
    backgroundColor: 'rgba(0, 0, 0, 0.6)', color: '#ffffff', outline: 'none',
    fontSize: '16px', textAlign: 'center'
  };

  const btnStyle = {
    padding: '15px', borderRadius: '6px', border: 'none',
    background: 'linear-gradient(90deg, #e80068 0%, #9b00e8 100%)',
    color: 'white', fontWeight: '900', fontSize: '16px', textTransform: 'uppercase',
    cursor: 'pointer', letterSpacing: '1px', boxShadow: '0 4px 15px rgba(232, 0, 104, 0.5)'
  };

  const tabStyle = (isActive) => ({
    flex: 1, padding: '10px', background: 'transparent', color: '#fff',
    border: 'none', borderBottom: isActive ? '3px solid #e80068' : '3px solid transparent',
    fontWeight: 'bold', textTransform: 'uppercase', cursor: 'pointer',
    opacity: isActive ? 1 : 0.5, transition: 'all 0.3s'
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', backgroundImage: 'url("/fundo-login.jpg")', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 5, 20, 0.65)', zIndex: 0 }}></div>

      <div style={{ backgroundColor: 'rgba(20, 10, 30, 0.75)', backdropFilter: 'blur(8px)', padding: '40px', borderRadius: '12px', boxShadow: '0 0 30px rgba(232, 0, 104, 0.4)', border: '2px solid #e80068', width: '350px', textAlign: 'center', zIndex: 1 }}>
        
        <h2 style={{ margin: '0 0 20px 0', color: '#ffffff', fontSize: '32px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '2px', textShadow: '3px 3px 0px #9b00e8' }}>
          Complexo
        </h2>

        {/* Abas */}
        <div style={{ display: 'flex', marginBottom: '30px' }}>
          <button onClick={() => setModo('login')} style={tabStyle(modo === 'login')}>Membro</button>
          <button onClick={() => setModo('convite')} style={tabStyle(modo === 'convite')}>Convite</button>
        </div>

        {/* Formulários dinâmicos */}
        {modo === 'login' ? (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <input type="email" placeholder="Seu E-mail" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />
            <input type="password" placeholder="Sua Senha" value={senha} onChange={(e) => setSenha(e.target.value)} style={inputStyle} required />
            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? 'Entrando...' : 'Logar na Call'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleConvite} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <input type="text" placeholder="Cole o código (Ex: CPX-2026)" value={codigo} onChange={(e) => setCodigo(e.target.value)} style={inputStyle} required />
            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? 'Validando...' : 'Usar Convite'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
