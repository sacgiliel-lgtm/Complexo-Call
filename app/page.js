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
      setNotice('Convite validado. Entrando no CPX...'); router.push('/servidor');
    } catch (inviteError) { setError(inviteError.message); }
    finally { setSubmitting(false); }
  }

  if (loading) return <main className="login-page"><Spinner label="Carregando CPX..." /></main>;

  return <main className="cpx-home">
    <div className="cpx-home-shell">
      <nav className="cpx-home-nav" aria-label="CPX Call">
        <div className="cpx-home-brand"><span className="cpx-home-logo">CPX</span><span>CPX CALL</span></div>
        <div className="cpx-home-secure"><i /> Acesso protegido</div>
      </nav>

      <div className="cpx-home-main">
        <section className="cpx-home-copy">
          <span className="cpx-home-kicker">Sua sala no CPX</span>
          <h1 className="cpx-home-title">Entre. Compartilhe.<span>Converse junto.</span></h1>
          <p className="cpx-home-description">Um espaço simples para chamadas de voz e vídeo, compartilhamento de tela e conversa em tempo real — direto do navegador.</p>
          <div className="cpx-home-chips"><span className="cpx-home-chip">Sem instalação</span><span className="cpx-home-chip">Voz e vídeo</span><span className="cpx-home-chip">Tela compartilhada</span><span className="cpx-home-chip">Chat em tempo real</span></div>
          <div className="cpx-home-steps"><div className="cpx-home-step"><b>01 · Acesse</b>Entre com sua conta ou use um convite.</div><div className="cpx-home-step"><b>02 · Escolha a sala</b>Selecione o canal e prepare seus dispositivos.</div><div className="cpx-home-step"><b>03 · Fique à vontade</b>Use voz, câmera, tela e chat durante a chamada.</div></div>
        </section>

        <section className="cpx-home-auth" aria-label="Entrar no CPX">
          <div className="cpx-home-auth-inner">
            <div className="cpx-home-auth-head"><span className="cpx-home-auth-label">Acesso</span><h2>Vamos para a sala.</h2><p>Use sua conta de membro ou o código de convite recebido.</p></div>
            <div className="cpx-home-tabs"><button className={`cpx-home-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => changeMode('login')}>Membro</button><button className={`cpx-home-tab ${mode === 'invite' ? 'active' : ''}`} onClick={() => changeMode('invite')}>Convite</button></div>
            {error && <div className="error-box" role="alert">{error}</div>}{notice && <div className="success-box">{notice}</div>}
            {mode === 'login' ? <form onSubmit={login} style={{ display: 'grid', gap: 13 }}>
              <div className="field"><label htmlFor="email">E-mail</label><input id="email" className="input" type="email" autoComplete="email" placeholder="voce@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div className="field"><label htmlFor="password">Senha</label><div className="input-wrap"><input id="password" className="input" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Sua senha" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /><button type="button" className="input-action" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} /></button></div></div>
              <button className="primary-btn cpx-home-primary" disabled={submitting}>{submitting ? <Spinner label="Entrando..." /> : <><Icon name="phone" size={16} /> Entrar no CPX</>}</button><span className="cpx-home-helper">Sua sessão permanece ativa enquanto sua conta estiver autorizada.</span>
            </form> : <form onSubmit={invite} style={{ display: 'grid', gap: 13 }}>
              <div className="field"><label htmlFor="invite">Código do convite</label><input id="invite" className="input" inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="CPX-XXXXXXXXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required /><span className="cpx-home-helper" style={{ textAlign: 'left' }}>Convites recebidos por link já aparecem preenchidos automaticamente.</span></div>
              <button className="primary-btn cpx-home-primary" disabled={submitting}>{submitting ? <Spinner label="Validando..." /> : <><Icon name="shield" size={16} /> Usar convite</>}</button>
            </form>}
            <div className="cpx-home-footer"><span>CPX Call</span><strong>Voz · vídeo · tela · chat</strong></div>
          </div>
        </section>
      </div>

      <footer className="cpx-home-footer" aria-label="Rodapé"><span>Uma sala de chamada feita para ser simples.</span><span>CPX Call</span></footer>
    </div>
  </main>;
}
