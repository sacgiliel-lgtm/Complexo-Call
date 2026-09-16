'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// Inicializa o Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
const supabase = createClient(supabaseUrl, supabaseKey);

const cores = { 
  bg: '#0a030d', panel: '#140a1e', text: '#ffffff', muted: '#a89db5', 
  brandPink: '#e80068', brandPurple: '#9b00e8',
  gradient: 'linear-gradient(90deg, #e80068 0%, #9b00e8 100%)'
};

export default function AdminDashboard() {
  const [abaAtiva, setAbaAtiva] = useState('usuarios');
  const [verificando, setVerificando] = useState(true);
  const router = useRouter();

  // Estados dos dados
  const [usuarios, setUsuarios] = useState([]);
  const [canais, setCanais] = useState([]);

  useEffect(() => {
    async function checarAcessoAdmin() {
      // 1. Pega o usuário logado
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        // Não está logado? Chuta pro login.
        router.push('/');
        return;
      }

      // 2. Busca o perfil do usuário no banco para checar o cargo
      const { data: perfil, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      // 3. Verifica se é Admin
      if (error || !perfil || perfil.role !== 'admin') {
        // Se não for admin, chuta de volta pro servidor.
        alert('Acesso negado. Apenas administradores podem acessar esta área.');
        router.push('/servidor');
        return;
      }

      // Se passou por tudo, libera a tela
      setVerificando(false);
      // Aqui você poderia carregar setUsuarios e setCanais do banco real
    }

    checarAcessoAdmin();
  }, [router]);

  if (verificando) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: cores.bg, color: cores.brandPink, fontWeight: 'bold' }}>
        VERIFICANDO CREDENCIAIS DE ACESSO...
      </div>
    );
  }

  // ... (Cole aqui o restante do layout do Admin Dashboard da resposta anterior)
  // return ( <div style={{ minHeight: '100vh', ...
