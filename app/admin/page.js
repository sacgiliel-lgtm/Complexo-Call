'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// Inicializa o Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
const supabase = createClient(supabaseUrl, supabaseKey);

// Paleta de cores do Complexo
const cores = { 
  bg: '#0a030d', panel: '#140a1e', text: '#ffffff', muted: '#a89db5', 
  brandPink: '#e80068', brandPurple: '#9b00e8',
  gradient: 'linear-gradient(90deg, #e80068 0%, #9b00e8 100%)'
};

export default function AdminDashboard() {
  const [abaAtiva, setAbaAtiva] = useState('usuarios');
  const [verificando, setVerificando] = useState(true);
  const router = useRouter();

  // Mocks de estado (Você conectará isso ao Supabase posteriormente)
  const [usuarios, setUsuarios] = useState([
    { id: 1, username: 'Giliel', role: 'admin' },
    { id: 2, username: 'Player2', role: 'membro' },
    { id: 3, username: 'Visitante_CPX99', role: 'convidado' }
  ]);
  
  const [canais, setCanais] = useState([
    { id: 1, name: 'Recepção (Convidados)', is_waiting_room: true },
    { id: 2, name: 'Geral', is_waiting_room: false },
  ]);

  // Efeito para checar se o usuário é Admin no banco de dados
  useEffect(() => {
    async function checarAcessoAdmin() {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        // Não está logado? Chuta pro login.
        router.push('/');
        return;
      }

      // Busca o perfil do usuário no banco para checar o cargo
      const { data: perfil, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      // Verifica se é Admin
      if (error || !perfil || perfil.role !== 'admin') {
        alert('Acesso negado. Apenas administradores podem acessar esta área.');
        router.push('/servidor');
        return;
      }

      // Se passou por tudo, libera a tela
      setVerificando(false);
    }

    checarAcessoAdmin();
  }, [router]);

  const abaStyle = (ativa) => ({
    padding: '12px 24px', cursor: 'pointer', fontWeight: 'bold', textTransform: 'uppercase',
    background: ativa ? cores.gradient : 'transparent', color: ativa ? '#fff' : cores.muted,
    border: 'none', borderRadius: '8px', transition: 'all 0.3s'
  });

  const cardStyle = {
    background: 'rgba(20, 10, 30, 0.6)', border: `1px solid rgba(155,0,232,0.3)`,
    borderRadius: '12px', padding: '20px', marginBottom: '20px'
  };

  // Tela de Loading enquanto verifica no Supabase
  if (verificando) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: cores.bg, color: cores.brandPink, fontWeight: 'bold' }}>
        VERIFICANDO CREDENCIAIS DE ACESSO...
      </div>
    );
  }

  // O Layout Principal do Admin liberado
  return (
    <div style={{ minHeight: '100vh', backgroundColor: cores.bg, color: cores.text, fontFamily: 'sans-serif', padding: '40px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: `1px solid rgba(232,0,104,0.3)`, paddingBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, textTransform: 'uppercase', color: cores.brandPink, textShadow: `2px 2px 0px ${cores.brandPurple}` }}>Painel do Complexo</h1>
          <p style={{ margin: '5px 0 0 0', color: cores.muted }}>Acesso de Nível Máximo (Administrador)</p>
        </div>
        <button onClick={() => router.push('/servidor')} style={{ background: 'transparent', border: `2px solid ${cores.brandPink}`, color: cores.brandPink, padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          Voltar ao Servidor
        </button>
      </div>

      {/* Menu de Abas */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '30px' }}>
        <button style={abaStyle(abaAtiva === 'usuarios')} onClick={() => setAbaAtiva('usuarios')}>Usuários & Permissões</button>
        <button style={abaStyle(abaAtiva === 'convites')} onClick={() => setAbaAtiva('convites')}>Gerar Convites</button>
        <button style={abaStyle(abaAtiva === 'canais')} onClick={() => setAbaAtiva('canais')}>Gerenciar Calls</button>
      </div>

      {/* Conteúdo Dinâmico */}
      <div style={cardStyle}>
        
        {/* ABA: USUÁRIOS */}
        {abaAtiva === 'usuarios' && (
          <div>
            <h2 style={{ color: cores.brandPurple, marginTop: 0 }}>Gerenciamento de Membros</h2>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${cores.muted}`, color: cores.muted }}>
                  <th style={{ padding: '10px' }}>Usuário</th>
                  <th style={{ padding: '10px' }}>Cargo Atual</th>
                  <th style={{ padding: '10px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => (
                  <tr key={u.id} style={{ borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                    <td style={{ padding: '15px 10px', fontWeight: 'bold' }}>{u.username}</td>
                    <td style={{ padding: '15px 10px' }}>
                      <select defaultValue={u.role} style={{ background: '#000', color: '#fff', border: `1px solid ${cores.brandPurple}`, padding: '5px 10px', borderRadius: '4px' }}>
                        <option value="admin">Admin</option>
                        <option value="membro">Membro</option>
                        <option value="convidado">Convidado</option>
                      </select>
                    </td>
                    <td style={{ padding: '15px 10px' }}>
                      <button style={{ background: cores.brandPink, color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Salvar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ABA: CONVITES */}
        {abaAtiva === 'convites' && (
          <div>
             <h2 style={{ color: cores.brandPurple, marginTop: 0 }}>Gerar Códigos de Acesso</h2>
             <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <select style={{ background: '#000', color: '#fff', border: `1px solid ${cores.brandPurple}`, padding: '12px', borderRadius: '6px' }}>
                  <option value="membro">Convite para Membro</option>
                  <option value="convidado">Convite para Convidado</option>
                </select>
                <button style={{ background: cores.gradient, color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Gerar Novo Código
                </button>
             </div>
             <p style={{ color: cores.muted, fontSize: '14px', marginTop: '20px' }}>* Convidados caem automaticamente na Recepção e precisam ser movidos.</p>
          </div>
        )}

        {/* ABA: CANAIS */}
        {abaAtiva === 'canais' && (
          <div>
            <h2 style={{ color: cores.brandPurple, marginTop: 0 }}>Calls do Servidor</h2>
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                <input type="text" placeholder="Nome do novo canal" style={{ background: '#000', color: '#fff', border: `1px solid ${cores.brandPink}`, padding: '12px', borderRadius: '6px', flex: 1 }} />
                <button style={{ background: cores.brandPink, color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Criar Call
                </button>
             </div>
             <ul style={{ listStyle: 'none', padding: 0 }}>
               {canais.map(c => (
                 <li key={c.id} style={{ background: 'rgba(0,0,0,0.5)', margin: '10px 0', padding: '15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                   <span><strong style={{color: cores.brandPink}}>#</strong> {c.name} {c.is_waiting_room && <span style={{fontSize: '11px', background: cores.brandPurple, padding: '2px 6px', borderRadius: '4px', marginLeft: '10px'}}>Recepção</span>}</span>
                   <button style={{ background: 'transparent', color: cores.brandPink, border: 'none', cursor: 'pointer' }}>Excluir</button>
                 </li>
               ))}
             </ul>
          </div>
        )}

      </div>
    </div>
  );
}
