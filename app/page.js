'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Icon, Spinner } from '../components/ui';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const inviteParam = params.get('invite');
      if (inviteParam) { setCode(inviteParam.toUpperCase()); setMode('invite'); }
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session) router.replace('/servidor');
      else setLoading(false);
    })();
    return () => { mounted = false; };
  }, [router]);

  function changeMode(next) { setMode(next); setError(''); setNotice(''); }

  async function login(event) {
    event.preventDefault(); setSubmitting(true); setError(''); setNotice('');
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError || !data.user) { setError('E-mail ou senha inválidos. Confira os dados e tente novamente.'); setSubmitting(false); return; }
    const { data: profile } = await supabase.from('profiles').select('status').eq('id', data.user.id).single();
    if (!profile || profile.status === 'suspenso') { await supabase.auth.signOut(); setError('Esta conta está suspensa ou não possui um perfil ativo.'); setSubmitting(false); return; }
    router.push('/servidor');
  }

  async function invite(event) {
    event.preventDefault(); if (!code.trim()) return; setSubmitting(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/validate-invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim() }) });
      const json = await response.json(); if (!response.ok) throw new Error(json.error || 'Convite inválido.');
      setNotice('Convite validado. Entrando no CPX...');
      router.push(json.roomName ? `/servidor?call=${encodeURIComponent(json.roomName)}` : '/servidor');
    } catch (inviteError) { setError(inviteError.message); }
    finally { setSubmitting(false); }
  }

  if (loading) return <main className="login-page"><Spinner label="Preparando seu acesso..." /></main>;

  return <main className="cpx-home">
    <div className="cpx-home-shell">
      <nav className="cpx-home-nav" aria-label="CPX Call">
        <div className="cpx-home-brand"><span className="cpx-home-logo">CPX</span></div>
        <div className="cpx-home-secure"><i /> Conexão protegida</div>
      </nav>

      <div className="cpx-home-main">
        <section className="cpx-home-copy">
          <span className="cpx-home-kicker">Central de encontros CPX</span>
          <h1 className="cpx-home-title">Sua equipe está aqui.<span>É só entrar.</span></h1>
          <p className="cpx-home-description">Acesse suas salas e participe das conversas do CPX com voz, câmera, compartilhamento de tela e chat, tudo em um único lugar.</p>
          <div className="cpx-home-chips"><span className="cpx-home-chip">Acesso pelo navegador</span><span className="cpx-home-chip">Chamadas ao vivo</span><span className="cpx-home-chip">Compartilhamento de tela</span><span className="cpx-home-chip">Chat da sala</span></div>
          <div className="cpx-home-steps"><div className="cpx-home-step"><b>01 · Identifique-se</b>Entre com sua conta ou informe um convite válido.</div><div className="cpx-home-step"><b>02 · Vá para o seu canal</b>Escolha a sala disponível e confira câmera e microfone.</div><div className="cpx-home-step"><b>03 · Participe</b>Converse, compartilhe sua tela e acompanhe o chat em tempo real.</div></div>
        </section>

        <section className="cpx-home-auth" aria-label="Acesso ao CPX">
          <div className="cpx-home-auth-inner">
            <div className="cpx-home-auth-head"><span className="cpx-home-auth-label">Portal CPX</span><h2>Pronto para conectar?</h2><p>Entre com os dados da sua conta ou utilize o código de convite.</p></div>
            <div className="cpx-home-tabs"><button className={`cpx-home-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => changeMode('login')}>Minha conta</button><button className={`cpx-home-tab ${mode === 'invite' ? 'active' : ''}`} onClick={() => changeMode('invite')}>Tenho um convite</button></div>
            {error && <div className="error-box" role="alert">{error}</div>}{notice && <div className="success-box">{notice}</div>}
            {mode === 'login' ? <form onSubmit={login} style={{ display: 'grid', gap: 13 }}>
              <div className="field"><label htmlFor="email">E-mail</label><input id="email" className="input" type="email" autoComplete="email" placeholder="voce@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div className="field"><label htmlFor="password">Senha</label><div className="input-wrap"><input id="password" className="input" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Sua senha" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /><button type="button" className="input-action" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} /></button></div></div>
              <button className="primary-btn cpx-home-primary" disabled={submitting}>{submitting ? <Spinner label="Entrando..." /> : <><Icon name="phone" size={16} /> Acessar minha sala</>}</button><span className="cpx-home-helper">A sessão fica disponível enquanto sua conta estiver autorizada.</span>
            </form> : <form onSubmit={invite} style={{ display: 'grid', gap: 13 }}>
              <div className="field"><label htmlFor="invite">Código de acesso</label><input id="invite" className="input" inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="CPX-XXXXXXXXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required /><span className="cpx-home-helper" style={{ textAlign: 'left' }}>Quando você abrir um link de convite, o código será preenchido automaticamente.</span></div>
              <button className="primary-btn cpx-home-primary" disabled={submitting}>{submitting ? <Spinner label="Conferindo..." /> : <><Icon name="shield" size={16} /> Entrar com convite</>}</button>
            </form>}
            <div className="cpx-home-footer"><span>CPX Call</span><strong>Conecte · converse · compartilhe</strong></div>
          </div>
        </section>
      </div>

      <footer className="cpx-home-footer" aria-label="Rodapé"><span>Um ponto de encontro para a comunidade CPX.</span><span>CPX Call</span></footer>
    </div>
  </main>;
}
