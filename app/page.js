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

  return <main className="login-page cpx-grid"><div className="login-orb one" /><div className="login-orb two" /><section className="login-card">
    <div className="brand-mark"><div className="brand-logo">CPX</div><div className="brand-copy"><strong>CPX CALL</strong><span>Comunidade • voz • vídeo • equipe</span></div></div>
    <h1 className="login-title">Entre na chamada.</h1><p className="login-subtitle">Acesse seu espaço no CPX ou use o convite recebido para entrar como convidado.</p>
    <div className="auth-tabs"><button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => changeMode('login')}>Membro</button><button className={`auth-tab ${mode === 'invite' ? 'active' : ''}`} onClick={() => changeMode('invite')}>Convite</button></div>
    {error && <div className="error-box" role="alert">{error}</div>}{notice && <div className="success-box">{notice}</div>}
    {mode === 'login' ? <form onSubmit={login} style={{ display: 'grid', gap: 15 }}>
      <div className="field"><label htmlFor="email">E-mail</label><input id="email" className="input" type="email" autoComplete="email" placeholder="voce@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="field"><label htmlFor="password">Senha</label><div className="input-wrap"><input id="password" className="input" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Sua senha" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /><button type="button" className="input-action" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} /></button></div></div>
      <button className="primary-btn button-full" disabled={submitting}>{submitting ? <Spinner label="Entrando..." /> : <><Icon name="phone" size={17} /> Entrar no CPX</>}</button>
      <span className="helper">Sua sessão permanece ativa enquanto sua conta estiver autorizada.</span>
    </form> : <form onSubmit={invite} style={{ display: 'grid', gap: 15 }}>
      <div className="field"><label htmlFor="invite">Código do convite</label><input id="invite" className="input" inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="CPX-XXXXXXXXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required /><span className="helper">O convite é temporário e pode ter prazo de validade definido pelo administrador.</span></div>
      <button className="primary-btn button-full" disabled={submitting}>{submitting ? <Spinner label="Validando..." /> : <><Icon name="shield" size={17} /> Usar convite</>}</button>
    </form>}
    <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}><span className="helper">CPX Call</span><span className="helper">Segurança • acesso controlado</span></div>
  </section></main>;
}
