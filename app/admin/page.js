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
  brandPink: '#e80068', brandPurple: '#9b00e8', red: '#da373c', green: '#23a559',
  gradient: 'linear-gradient(90deg, #e80068 0%, #9b00e8 100%)'
};

export default function AdminDashboard() {
  const [abaAtiva, setAbaAtiva] = useState('usuarios');
  const [verificando, setVerificando] = useState(true);
  const [mostrarCriarUsuario, setMostrarCriarUsuario] = useState(false);
  const router = useRouter();

  // Mocks de estado para a Interface (No futuro você conectará ao Supabase)
  const [usuarios, setUsuarios] = useState([
    { id: 1, username: 'Giliel', role: 'admin', status: 'ativo' },
    { id: 2, username: 'Player2', role: 'membro', status: 'ativo' },
    { id: 3, username: 'Visitante_CPX99', role: 'convidado', status: 'suspenso' }
  ]);
  
  const [canais, setCanais] = useState([
    { id: 1, name: 'Recepção (Convidados)', is_waiting_room: true },
    { id: 2, name: 'Geral', is_waiting_room: false },
    { id: 3, name: 'Reunião Dev', is_waiting_room: false },
  ]);

  useEffect(() => {
    async function checarAcessoAdmin() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/');

      const { data: perfil, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (error || !perfil || perfil.role !== 'admin') {
        alert('Acesso negado. Apenas administradores.');
        return router.push('/servidor');
      }
      setVerificando(false);
    }
    checarAcessoAdmin();
  }, [router]);

  // Estilizações base
  const abaStyle = (ativa) => ({
    padding: '12px 24px', cursor: 'pointer', fontWeight: 'bold', textTransform: 'uppercase',
    background: ativa ? cores.gradient : 'transparent', color: ativa ? '#fff' : cores.muted,
    border: ativa ? 'none' : `1px solid ${cores.brandPurple}`, borderRadius: '8px', transition: 'all 0.3s'
  });

  const cardStyle = {
    background: 'rgba(20, 10, 30, 0.6)', border: `1px solid rgba(155,0,232,0.3)`,
    borderRadius: '12px', padding: '25px', marginBottom: '20px', boxShadow: `0 0 20px rgba(155,0,232,0.1)`
  };

  const inputStyle = {
    background: '#050108', color: '#fff', border: `1px solid ${cores.brandPurple}`, 
    padding: '12px', borderRadius: '6px', width: '100%', outline: 'none'
  };

  if (verificando) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: cores.bg, color: cores.brandPink, fontWeight: 'bold' }}>
        AUTENTICANDO COMANDO DO COMPLEXO...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: cores.bg, color: cores.text, fontFamily: 'sans-serif', padding: '40px' }}>
      
      {/* HEADER DO PAINEL */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: `1px solid rgba(232,0,104,0.3)`, paddingBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, textTransform: 'uppercase', color: cores.brandPink, textShadow: `2px 2px 0px ${cores.brandPurple}` }}>Centro de Comando</h1>
          <p style={{ margin: '5px 0 0 0', color: cores.muted }}>Complexo Engine v1.0 • Nível de Acesso: Máximo</p>
        </div>
        <button onClick={() => router.push('/servidor')} style={{ background: 'transparent', border: `2px solid ${cores.brandPink}`, color: cores.brandPink, padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }} onMouseOver={(e) => {e.target.style.background = cores.brandPink; e.target.style.color = '#fff'}} onMouseOut={(e) => {e.target.style.background = 'transparent'; e.target.style.color = cores.brandPink}}>
          Voltar ao Servidor
        </button>
      </div>

      {/* MENU DE NAVEGAÇÃO */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '30px', flexWrap: 'wrap' }}>
        <button style={abaStyle(abaAtiva === 'usuarios')} onClick={() => setAbaAtiva('usuarios')}>👥 Usuários</button>
        <button style={abaStyle(abaAtiva === 'convites')} onClick={() => setAbaAtiva('convites')}>🎟️ Convites</button>
        <button style={abaStyle(abaAtiva === 'canais')} onClick={() => setAbaAtiva('canais')}>🎙️ Calls</button>
        <button style={abaStyle(abaAtiva === 'config')} onClick={() => setAbaAtiva('config')}>⚙️ Configurações</button>
      </div>

      <div style={cardStyle}>
        
        {/* ================= ABA: USUÁRIOS ================= */}
        {abaAtiva === 'usuarios' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: cores.brandPurple, margin: 0 }}>Gerenciamento de Membros</h2>
              <button onClick={() => setMostrarCriarUsuario(!mostrarCriarUsuario)} style={{ background: cores.gradient, color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                {mostrarCriarUsuario ? 'Cancelar' : '+ Novo Usuário'}
              </button>
            </div>

            {/* FORMULÁRIO DE CRIAR USUÁRIO */}
            {mostrarCriarUsuario && (
              <div style={{ background: 'rgba(0,0,0,0.4)', padding: '20px', borderRadius: '8px', border: `1px dashed ${cores.brandPink}`, marginBottom: '20px' }}>
                <h3 style={{ marginTop: 0, color: cores.brandPink }}>Cadastrar Novo Acesso</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                  <input type="email" placeholder="E-mail" style={inputStyle} />
                  <input type="text" placeholder="Nome de Usuário (Ex: Player3)" style={inputStyle} />
                  <input type="password" placeholder="Senha Provisória" style={inputStyle} />
                  <select style={inputStyle}>
                    <option value="membro">Cargo: Membro Comum</option>
                    <option value="admin">Cargo: Administrador</option>
                    <option value="convidado">Cargo: Convidado (Temporário)</option>
                  </select>
                </div>
                <button style={{ background: cores.green, color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}>
                  Criar Conta e Enviar Credenciais
                </button>
              </div>
            )}

            {/* LISTA DE USUÁRIOS */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${cores.muted}`, color: cores.muted, textTransform: 'uppercase', fontSize: '12px' }}>
                    <th style={{ padding: '10px' }}>Usuário</th>
                    <th style={{ padding: '10px' }}>Status</th>
                    <th style={{ padding: '10px' }}>Cargo / Permissão</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Ações Administrativas</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map(u => (
                    <tr key={u.id} style={{ borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                      <td style={{ padding: '15px 10px', fontWeight: 'bold' }}>{u.username}</td>
                      <td style={{ padding: '15px 10px' }}>
                        <span style={{ background: u.status === 'ativo' ? 'rgba(35,165,89,0.2)' : 'rgba(218,55,60,0.2)', color: u.status === 'ativo' ? cores.green : cores.red, padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                          {u.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '15px 10px' }}>
                        <select defaultValue={u.role} style={{ background: '#000', color: '#fff', border: `1px solid ${cores.brandPurple}`, padding: '6px 10px', borderRadius: '4px' }}>
                          <option value="admin">Admin</option>
                          <option value="membro">Membro</option>
                          <option value="convidado">Convidado</option>
                        </select>
                      </td>
                      <td style={{ padding: '15px 10px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button style={{ background: 'transparent', border: `1px solid ${cores.brandPurple}`, color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Salvar</button>
                        <button style={{ background: 'transparent', border: `1px solid ${cores.muted}`, color: cores.muted, padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Suspender</button>
                        <button style={{ background: 'transparent', border: `1px solid ${cores.red}`, color: cores.red, padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>X</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= ABA: CONVITES ================= */}
        {abaAtiva === 'convites' && (
          <div>
             <h2 style={{ color: cores.brandPurple, marginTop: 0 }}>Códigos de Acesso (Vouchers)</h2>
             <p style={{color: cores.muted, marginBottom: '20px'}}>Gere códigos temporários para convidados ou passes diretos para novos membros.</p>
             <div style={{ display: 'flex', gap: '15px', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '8px' }}>
                <select style={inputStyle}>
                  <option value="convidado">Tipo: Acesso de Convidado (1 Uso)</option>
                  <option value="membro">Tipo: Passe de Membro Permamente</option>
                </select>
                <button style={{ background: cores.gradient, color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  ⚡ Gerar Código
                </button>
             </div>
          </div>
        )}

        {/* ================= ABA: CANAIS / CALLS ================= */}
        {abaAtiva === 'canais' && (
          <div>
            <h2 style={{ color: cores.brandPurple, marginTop: 0 }}>Gerenciamento de Calls</h2>
            <div style={{ display: 'flex', gap: '15px', marginBottom: '25px', background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '8px' }}>
                <input type="text" placeholder="Nome da nova call (Ex: Sala de Reunião B)" style={inputStyle} />
                <button style={{ background: cores.brandPink, color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  + Criar Call
                </button>
             </div>
             
             <h3 style={{ color: cores.muted, fontSize: '14px', textTransform: 'uppercase' }}>Canais Ativos</h3>
             <ul style={{ listStyle: 'none', padding: 0 }}>
               {canais.map(c => (
                 <li key={c.id} style={{ background: '#050108', border: `1px solid rgba(155,0,232,0.2)`, margin: '10px 0', padding: '15px 20px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <div>
                     <strong style={{color: cores.brandPink, marginRight: '8px', fontSize: '18px'}}>#</strong> 
                     <span style={{fontSize: '16px'}}>{c.name}</span>
                     {c.is_waiting_room && <span style={{fontSize: '11px', background: cores.brandPurple, padding: '2px 8px', borderRadius: '4px', marginLeft: '12px', fontWeight: 'bold'}}>SALA DE RECEPÇÃO</span>}
                   </div>
                   <div style={{display: 'flex', gap: '10px'}}>
                     <button style={{ background: 'transparent', color: cores.muted, border: `1px solid ${cores.muted}`, padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Editar</button>
                     <button style={{ background: cores.red, color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Apagar</button>
                   </div>
                 </li>
               ))}
             </ul>
          </div>
        )}

        {/* ================= ABA: CONFIGURAÇÕES ================= */}
        {abaAtiva === 'config' && (
          <div>
             <h2 style={{ color: cores.brandPurple, marginTop: 0 }}>Configurações do Servidor</h2>
             
             <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Opção 1 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#050108', padding: '20px', borderRadius: '8px', border: `1px solid rgba(232,0,104,0.2)` }}>
                  <div>
                    <h4 style={{ margin: '0 0 5px 0', color: '#fff' }}>Modo de Manutenção</h4>
                    <p style={{ margin: 0, color: cores.muted, fontSize: '13px' }}>Bloqueia a entrada de qualquer usuário que não seja Admin.</p>
                  </div>
                  <input type="checkbox" style={{ width: '20px', height: '20px', accentColor: cores.brandPink }} />
                </div>

                {/* Opção 2 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#050108', padding: '20px', borderRadius: '8px', border: `1px solid rgba(232,0,104,0.2)` }}>
                  <div>
                    <h4 style={{ margin: '0 0 5px 0', color: '#fff' }}>Logs no Discord</h4>
                    <p style={{ margin: 0, color: cores.muted, fontSize: '13px' }}>Envia notificações de entrada, saída e criação de usuários para o Webhook.</p>
                  </div>
                  <input type="checkbox" defaultChecked style={{ width: '20px', height: '20px', accentColor: cores.brandPink }} />
                </div>

                {/* Opção 3 */}
                <div style={{ background: '#050108', padding: '20px', borderRadius: '8px', border: `1px solid rgba(232,0,104,0.2)` }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#fff' }}>Limite Global de Usuários em Call</h4>
                  <p style={{ margin: '0 0 15px 0', color: cores.muted, fontSize: '13px' }}>Defina um limite de conexões simultâneas para poupar banda do LiveKit.</p>
                  <select style={{...inputStyle, maxWidth: '200px'}}>
                    <option value="50">Máximo: 50 usuários</option>
                    <option value="100">Máximo: 100 usuários</option>
                    <option value="ilimitado">Ilimitado</option>
                  </select>
                </div>
             </div>
             
             <div style={{ marginTop: '30px', textAlign: 'right' }}>
               <button style={{ background: cores.gradient, color: '#fff', border: 'none', padding: '12px 30px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}>
                 💾 Salvar Alterações Globais
               </button>
             </div>
          </div>
        )}

      </div>
    </div>
  );
}
