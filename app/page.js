'use client';

import { supabase } from '../lib/supabaseClient';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, Spinner } from '../components/ui';


export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [guestName, setGuestName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const inviteParam = params.get('invite');
      if (inviteParam) { setCode(inviteParam.toUpperCase()); setMode('invite'); }
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session) {
        const { data: profile } = await supabase.from('profiles').select('status,must_change_password').eq('id', session.user.id).single();
        if (profile?.status === 'suspenso') {
          await supabase.auth.signOut();
          setError('Esta conta está suspensa.');
          setLoading(false);
        } else if (profile?.must_change_password) {
          setForcePasswordChange(true);
          setLoading(false);
        } else {
          router.replace('/servidor');
        }
      } else setLoading(false);
    })();
    return () => { mounted = false; };
  }, [router]);

  function changeMode(next) { setMode(next); setError(''); setNotice(''); }

  async function login(event) {
    event.preventDefault(); setSubmitting(true); setError(''); setNotice('');
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError || !data.user) { setError('E-mail ou senha inválidos. Confira os dados e tente novamente.'); setSubmitting(false); return; }
    const { data: profile } = await supabase.from('profiles').select('status,must_change_password').eq('id', data.user.id).single();
    if (!profile || profile.status === 'suspenso') { await supabase.auth.signOut(); setError('Esta conta está suspensa ou não possui um perfil ativo.'); setSubmitting(false); return; }
    if (profile.must_change_password) {
      setForcePasswordChange(true);
      setSubmitting(false);
      return;
    }
    router.push('/servidor');
  }

  async function changePassword(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (newPassword.length < 8) return setError('A nova senha deve ter pelo menos 8 caracteres.');
    if (newPassword !== confirmPassword) return setError('As senhas não conferem.');
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sua sessão expirou. Entre novamente.');
      const response = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ newPassword })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Não foi possível definir a senha.');
      setForcePasswordChange(false);
      setNewPassword('');
      setConfirmPassword('');
      router.replace('/servidor');
    } catch (changeError) {
      setError(changeError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function invite(event) {
    event.preventDefault(); if (!code.trim() || !guestName.trim()) return; setSubmitting(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/validate-invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim(), guestName: guestName.trim() }) });
      const json = await response.json(); if (!response.ok) throw new Error(json.error || 'Convite inválido.');
      setNotice('Convite validado. Entrando no CPX...');
      router.push(json.roomName ? `/servidor?call=${encodeURIComponent(json.roomName)}` : '/servidor');
    } catch (inviteError) { setError(inviteError.message); }
    finally { setSubmitting(false); }
  }

  if (loading) return <main className="login-page"><Spinner label="Preparando seu acesso..." /></main>;

  if (forcePasswordChange) return <main className="login-page">
    <section className="cpx-home-auth" style={{ width: 'min(100%, 470px)', margin: 'auto' }}>
      <div className="cpx-home-auth-inner">
        <div className="cpx-home-auth-head"><span className="cpx-home-auth-label">Primeiro acesso</span><h2>Defina sua senha</h2><p>Esta conta foi criada com uma senha temporária. Antes de continuar, escolha uma senha definitiva.</p></div>
        {error && <div className="error-box" role="alert">{error}</div>}
        <form onSubmit={changePassword} style={{ display: 'grid', gap: 13 }}>
          <div className="field"><label htmlFor="new-password">Nova senha</label><div className="input-wrap"><input id="new-password" className="input" type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Crie uma senha segura" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} autoFocus /><button type="button" className="input-action" onClick={() => setShowNewPassword((value) => !value)} aria-label={showNewPassword ? 'Ocultar senha' : 'Mostrar senha'}><Icon name={showNewPassword ? 'eyeOff' : 'eye'} size={16} /></button></div><span className="cpx-home-helper" style={{ textAlign: 'left' }}>Use pelo menos 8 caracteres e evite reutilizar senhas de outros serviços.</span></div>
          <div className="field"><label htmlFor="confirm-password">Confirmar nova senha</label><input id="confirm-password" className="input" type="password" autoComplete="new-password" placeholder="Digite a senha novamente" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} /></div>
          <button className="primary-btn cpx-home-primary" disabled={submitting}>{submitting ? <Spinner label="Salvando..." /> : 'Definir senha e continuar'}</button>
        </form>
      </div>
    </section>
  </main>;

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
              <div className="field"><label htmlFor="guest-name">Seu nome</label><input id="guest-name" className="input" type="text" autoComplete="name" maxLength={32} placeholder="Digite seu nome" value={guestName} onChange={(e) => setGuestName(e.target.value)} autoFocus={mode === 'invite'} required /><span className="cpx-home-helper" style={{ textAlign: 'left' }}>Digite o nome que será exibido para as outras pessoas na call.</span></div>
              <div className="field"><label htmlFor="invite">Código de acesso</label><input id="invite" className="input" inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="CPX-XXXXXXXXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required /><span className="cpx-home-helper" style={{ textAlign: 'left' }}>Quando você abrir um link de convite, o código será preenchido automaticamente.</span></div>
              <button className="primary-btn cpx-home-primary" disabled={submitting || !guestName.trim()}>{submitting ? <Spinner label="Conferindo..." /> : <><Icon name="shield" size={16} /> Entrar com convite</>}</button>
            </form>}
            <div className="cpx-home-footer"><span>CPX Call</span><strong>Conecte · converse · compartilhe</strong></div>
          </div>
        </section>
      </div>

      <footer className="cpx-home-footer" aria-label="Rodapé"><span>Um ponto de encontro para a comunidade CPX.</span><span>CPX Call</span></footer>
    </div>
  </main>;
}
