'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, Spinner } from '../components/ui';
import { useAuth, useSignIn, useSignUp } from '@clerk/nextjs';


export default function Home() {
  const router = useRouter();
  const { isLoaded: clerkLoaded, isSignedIn, signOut } = useAuth();
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secondFactorCode, setSecondFactorCode] = useState('');
  const [secondFactorStrategy, setSecondFactorStrategy] = useState('');
  const [secondFactorDestination, setSecondFactorDestination] = useState('');
  const [secondFactorRequired, setSecondFactorRequired] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [activationMode, setActivationMode] = useState(false);
  const [activationUsername, setActivationUsername] = useState('');
  const [activationPassword, setActivationPassword] = useState('');
  const [activationConfirmPassword, setActivationConfirmPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!clerkLoaded) return () => { mounted = false; };

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const activateParam = params.get('activate') === '1';
      const invitationTicket = params.get('__clerk_ticket');
      const invitationStatus = params.get('__clerk_status');
      const inviteParam = params.get('invite');
      if (inviteParam) { setCode(inviteParam.toUpperCase()); setMode('invite'); }

      // Clerk adiciona __clerk_ticket e __clerk_status aos convites.
      // sign_up: usamos nossa própria tela para escolher username e senha.
      // sign_in: o e-mail já possui conta Clerk; autenticamos silenciosamente
      // com o ticket e seguimos para o servidor.
      if (invitationTicket && !isSignedIn) {
        if (invitationStatus === 'sign_in') {
          try {
            if (!signInLoaded || !signIn || !setActiveSignIn) throw new Error('A autenticação ainda está carregando.');
            const signInAttempt = await signIn.create({
              strategy: 'ticket',
              ticket: invitationTicket,
            });
            if (signInAttempt?.error) throw new Error(signInAttempt.error.message || 'Não foi possível aceitar o convite.');
            if (signInAttempt?.status !== 'complete') throw new Error('O convite exige uma etapa de autenticação adicional.');
            await setActiveSignIn({ session: signInAttempt.createdSessionId });
            window.history.replaceState({}, '', '/');
            router.replace('/servidor');
            return;
          } catch (invitationError) {
            if (mounted) setError(invitationError.message || 'Não foi possível aceitar o convite.');
            if (mounted) setLoading(false);
            return;
          }
        }

        if (invitationStatus === 'sign_up' || !invitationStatus) {
          if (mounted) {
            setActivationUsername('');
            setActivationMode(true);
            setLoading(false);
          }
          return;
        }
      }

      if (!isSignedIn) {
        setLoading(false);
        return;
      }

      // O destino normal após o login é /servidor.
      if (!activateParam) {
        router.replace('/servidor');
        return;
      }

      try {
        const response = await fetch('/api/profile/sync', { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok) {
          if (response.status === 403) {
            await signOut();
            setError(json.error || 'Esta conta está suspensa.');
            return;
          }
          throw new Error(json.error || 'Não foi possível carregar seu perfil.');
        }
        if (!mounted) return;
        setActivationUsername(json.profile?.username?.startsWith('Pendente-') ? '' : (json.profile?.username || ''));
        setActivationMode(true);
      } catch (error) {
        if (mounted) setError(error.message || 'Não foi possível inicializar sua conta.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [clerkLoaded, signInLoaded, signUpLoaded, isSignedIn, router, signOut, signIn]);


  function changeMode(next) { setMode(next); setError(''); setNotice(''); }

  async function login(event) {
    event.preventDefault();
    setError('');
    setNotice('');

    const identifier = email.trim();
    if (!identifier) return setError('Informe seu e-mail.');
    if (!password) return setError('Informe sua senha.');
    if (!signInLoaded || !signIn || !setActiveSignIn) return setError('A autenticação ainda está carregando. Tente novamente.');

    setSubmitting(true);
    try {
      const signInAttempt = await signIn.create({
        identifier,
        password,
      });

      if (signInAttempt?.error) {
        console.error('Clerk sign-in error:', signInAttempt.error);
        throw new Error(signInAttempt.error.message || 'E-mail ou senha incorretos.');
      }

      if (signInAttempt?.status === 'complete') {
        await setActiveSignIn({ session: signInAttempt.createdSessionId });
        router.replace('/servidor');
        return;
      }

      if (signInAttempt?.status === 'needs_new_password') {
        setForcePasswordChange(true);
        return;
      }

      if (signInAttempt?.status === 'needs_second_factor') {
        const factors = signInAttempt.supportedSecondFactors || [];
        const emailFactor = factors.find((factor) => factor.strategy === 'email_code');
        const phoneFactor = factors.find((factor) => factor.strategy === 'phone_code');
        const totpFactor = factors.find((factor) => factor.strategy === 'totp');
        const backupFactor = factors.find((factor) => factor.strategy === 'backup_code');

        if (emailFactor) {
          const prepared = await signIn.prepareSecondFactor({
            strategy: 'email_code',
            emailAddressId: emailFactor.emailAddressId,
          });
          if (prepared?.error) throw new Error(prepared.error.message || 'Não foi possível enviar o código de verificação.');
          setSecondFactorStrategy('email_code');
          setSecondFactorDestination(emailFactor.safeIdentifier || 'seu e-mail');
          setSecondFactorRequired(true);
          return;
        }

        if (phoneFactor) {
          const prepared = await signIn.prepareSecondFactor({
            strategy: 'phone_code',
            phoneNumberId: phoneFactor.phoneNumberId,
          });
          if (prepared?.error) throw new Error(prepared.error.message || 'Não foi possível enviar o código de verificação.');
          setSecondFactorStrategy('phone_code');
          setSecondFactorDestination(phoneFactor.safeIdentifier || 'seu telefone');
          setSecondFactorRequired(true);
          return;
        }

        if (totpFactor) {
          setSecondFactorStrategy('totp');
          setSecondFactorDestination('seu aplicativo autenticador');
          setSecondFactorRequired(true);
          return;
        }

        if (backupFactor) {
          setSecondFactorStrategy('backup_code');
          setSecondFactorDestination('seu código de recuperação');
          setSecondFactorRequired(true);
          return;
        }

        console.error('Clerk second factors:', factors);
        throw new Error('Sua conta exige uma segunda etapa, mas nenhum método compatível está disponível nesta interface.');
      }

      throw new Error('Não foi possível concluir o login. Verifique seus dados e tente novamente.');
    } catch (loginError) {
      setError(loginError.message || 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  }


  async function verifySecondFactor(event) {
    event.preventDefault();
    setError('');
    setNotice('');

    const verificationCode = secondFactorCode.trim();
    if (!verificationCode) return setError('Informe o código de verificação.');
    if (!signInLoaded || !signIn || !setActiveSignIn) return setError('A autenticação ainda está carregando. Tente novamente.');

    setSubmitting(true);
    try {
      const attempt = await signIn.attemptSecondFactor({
        strategy: secondFactorStrategy,
        code: verificationCode,
      });

      if (attempt?.error) throw new Error(attempt.error.message || 'Código de verificação inválido.');

      if (attempt?.status !== 'complete') {
        throw new Error('Não foi possível concluir a verificação. Confira o código e tente novamente.');
      }

      await setActiveSignIn({ session: attempt.createdSessionId });
      setSecondFactorRequired(false);
      setSecondFactorCode('');
      setSecondFactorStrategy('');
      setSecondFactorDestination('');
      router.replace('/servidor');
    } catch (verificationError) {
      console.error('Clerk second-factor error:', verificationError);
      setError(verificationError.message || 'Não foi possível verificar o código.');
    } finally {
      setSubmitting(false);
    }
  }

  async function activateAccount(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    const username = activationUsername.trim();
    const params = new URLSearchParams(window.location.search);
    const invitationTicket = params.get('__clerk_ticket');
    const invitationStatus = params.get('__clerk_status');

    if (username.length < 2 || username.length > 32) return setError('O username deve ter entre 2 e 32 caracteres.');
    if (activationPassword.length < 8) return setError('A senha deve ter pelo menos 8 caracteres.');
    if (activationPassword !== activationConfirmPassword) return setError('As senhas não conferem.');
    setSubmitting(true);

    try {
      if (invitationTicket && !isSignedIn && invitationStatus !== 'sign_in') {
        if (!signUp) throw new Error('A autenticação ainda está carregando. Tente novamente em alguns segundos.');

        if (!signUpLoaded || !signUp || !setActiveSignUp) throw new Error('A autenticação ainda está carregando. Tente novamente em alguns segundos.');

        const signUpAttempt = await signUp.create({
          strategy: 'ticket',
          ticket: invitationTicket,
          password: activationPassword,
        });

        if (signUpAttempt?.error) {
          console.error('Clerk invitation sign-up error:', signUpAttempt.error);
          throw new Error(signUpAttempt.error.message || 'Não foi possível aceitar o convite.');
        }

        if (signUpAttempt?.status !== 'complete') {
          console.error('Clerk invitation sign-up not complete:', signUpAttempt?.status, signUpAttempt?.missingFields);
          throw new Error('O convite foi aceito, mas ainda faltam dados para concluir a conta.');
        }

        await setActiveSignUp({ session: signUpAttempt.createdSessionId });
      }

      if (!isSignedIn && !invitationTicket) {
        throw new Error('Sua sessão do Clerk não foi estabelecida. Abra novamente o convite recebido por e-mail.');
      }

      const response = await fetch('/api/profile/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: invitationTicket ? undefined : activationPassword }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Não foi possível ativar sua conta.');

      setActivationMode(false);
      setActivationPassword('');
      setActivationConfirmPassword('');
      setActivationUsername('');
      window.history.replaceState({}, '', '/');
      router.replace('/servidor');
    } catch (activationError) {
      console.error('Account activation:', activationError);
      setError(activationError.message || 'Não foi possível ativar sua conta.');
    } finally {
      setSubmitting(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (newPassword.length < 8) return setError('A nova senha deve ter pelo menos 8 caracteres.');
    if (newPassword !== confirmPassword) return setError('As senhas não conferem.');
    setSubmitting(true);
    try {
      if (!isSignedIn) throw new Error('Sua sessão expirou. Entre novamente.');
      const response = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  if (loading || !clerkLoaded) return <main className="login-page"><Spinner label="Preparando seu acesso..." /></main>;

  if (secondFactorRequired) {
    const destinationText = secondFactorStrategy === 'email_code'
      ? `Enviamos um código de verificação para ${secondFactorDestination}.`
      : secondFactorStrategy === 'phone_code'
        ? `Enviamos um código de verificação para ${secondFactorDestination}.`
        : secondFactorStrategy === 'totp'
          ? 'Abra seu aplicativo autenticador e informe o código de 6 dígitos.'
          : 'Informe um código de recuperação da sua conta.';

    return <main className="login-page">
      <section className="cpx-home-auth" style={{ width: 'min(100%, 470px)', margin: 'auto' }}>
        <div className="cpx-home-auth-inner">
          <div className="cpx-home-auth-head"><span className="cpx-home-auth-label">Verificação de segurança</span><h2>Confirme seu acesso</h2><p>{destinationText}</p></div>
          {error && <div className="error-box" role="alert">{error}</div>}
          {notice && <div className="success-box">{notice}</div>}
          <form onSubmit={verifySecondFactor} style={{ display: 'grid', gap: 13 }}>
            <div className="field"><label htmlFor="second-factor-code">Código de verificação</label><input id="second-factor-code" className="input" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={32} placeholder={secondFactorStrategy === 'backup_code' ? 'Código de recuperação' : '000000'} value={secondFactorCode} onChange={(e) => setSecondFactorCode(e.target.value)} required /></div>
            <button className="primary-btn cpx-home-primary" disabled={submitting}>{submitting ? <Spinner label="Verificando..." /> : <><Icon name="shield" size={16} /> Confirmar acesso</>}</button>
            <button type="button" className="ghost-btn" disabled={submitting} onClick={() => { setSecondFactorRequired(false); setSecondFactorCode(''); setSecondFactorStrategy(''); setSecondFactorDestination(''); }}>Voltar</button>
          </form>
        </div>
      </section>
    </main>;
  }

  if (activationMode) return <main className="login-page">
    <section className="cpx-home-auth" style={{ width: 'min(100%, 470px)', margin: 'auto' }}>
      <div className="cpx-home-auth-inner">
        <div className="cpx-home-auth-head"><span className="cpx-home-auth-label">Ative sua conta</span><h2>Configure seu acesso</h2><p>Escolha o username que será exibido nas chamadas e crie sua senha para acessar o Complexo Call.</p></div>
        {error && <div className="error-box" role="alert">{error}</div>}
        <form onSubmit={activateAccount} style={{ display: 'grid', gap: 13 }}>
          <div className="field"><label htmlFor="activation-username">Username</label><input id="activation-username" className="input" type="text" autoComplete="nickname" maxLength={32} placeholder="Como você quer ser chamado?" value={activationUsername} onChange={(e) => setActivationUsername(e.target.value)} required autoFocus /><span className="cpx-home-helper" style={{ textAlign: 'left' }}>Este nome aparecerá para as outras pessoas nas chamadas e no chat.</span></div>
          <div className="field"><label htmlFor="activation-password">Senha</label><div className="input-wrap"><input id="activation-password" className="input" type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Crie uma senha segura" value={activationPassword} onChange={(e) => setActivationPassword(e.target.value)} required minLength={8} /><button type="button" className="input-action" onClick={() => setShowNewPassword((value) => !value)} aria-label={showNewPassword ? 'Ocultar senha' : 'Mostrar senha'}><Icon name={showNewPassword ? 'eyeOff' : 'eye'} size={16} /></button></div></div>
          <div className="field"><label htmlFor="activation-confirm-password">Confirmar senha</label><input id="activation-confirm-password" className="input" type="password" autoComplete="new-password" placeholder="Digite a senha novamente" value={activationConfirmPassword} onChange={(e) => setActivationConfirmPassword(e.target.value)} required minLength={8} /></div>
          <div id="clerk-captcha" />
          <button className="primary-btn cpx-home-primary" disabled={submitting}>{submitting ? <Spinner label="Ativando..." /> : 'Ativar conta e continuar'}</button>
        </form>
      </div>
    </section>
  </main>;

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
          <span className="cpx-home-kicker">Complexo</span>
          <h1 className="cpx-home-title">Sua equipe está aqui.<span>É só entrar.</span></h1>
          <p className="cpx-home-description">Acesse suas salas e participe das conversas do CPX com voz, câmera, compartilhamento de tela e chat, tudo em um único lugar.</p>
          <div className="cpx-home-chips"><span className="cpx-home-chip">Acesso pelo navegador</span><span className="cpx-home-chip">Chamadas ao vivo</span><span className="cpx-home-chip">Compartilhamento de tela</span><span className="cpx-home-chip">Chat da sala</span></div>
          <div className="cpx-home-steps"><div className="cpx-home-step"><b>01 · Identifique-se</b>Entre com sua conta ou informe um convite válido.</div><div className="cpx-home-step"><b>02 · Vá para o seu canal</b>Escolha a sala disponível e confira câmera e microfone.</div><div className="cpx-home-step"><b>03 · Participe</b>Compartilhe sua tela e realize nossas entrevistas.</div></div>
        </section>

        <section className="cpx-home-auth" aria-label="Acesso ao CPX">
          <div className="cpx-home-auth-inner">
            <div className="cpx-home-auth-head"><span className="cpx-home-auth-label">Portal CPX</span><h2>Pronto para conectar?</h2><p>Entre com os dados da sua conta ou utilize o código de convite.</p></div>
            <div className="cpx-home-tabs"><button className={`cpx-home-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => changeMode('login')}>Minha conta</button><button className={`cpx-home-tab ${mode === 'invite' ? 'active' : ''}`} onClick={() => changeMode('invite')}>Tenho um convite</button></div>
            {error && <div className="error-box" role="alert">{error}</div>}{notice && <div className="success-box">{notice}</div>}
            {mode === 'login' ? <form onSubmit={login} style={{ display: 'grid', gap: 13 }}>
              <div className="field"><label htmlFor="email">E-mail</label><input id="email" className="input" type="email" autoComplete="email" inputMode="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></div>
              <div className="field"><label htmlFor="password">Senha</label><div className="input-wrap"><input id="password" className="input" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Digite sua senha" value={password} onChange={(e) => setPassword(e.target.value)} required /><button type="button" className="input-action" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} /></button></div></div>
              <button className="primary-btn cpx-home-primary" disabled={submitting}>{submitting ? <Spinner label="Entrando..." /> : <><Icon name="shield" size={16} /> Entrar</>}</button>
              <span className="cpx-home-helper">Sua autenticação é protegida pelo Clerk, mas a interface permanece no CPX.</span>
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
