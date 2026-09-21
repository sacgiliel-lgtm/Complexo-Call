'use client';

import { supabase } from '../../lib/supabaseClient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, Avatar, Badge, EmptyState, Modal, Spinner, ToastStack } from '../../components/ui';
import { useAuth, useUser } from '@clerk/nextjs';
import { RoomExperience } from '../../components/RoomExperience';
import '@livekit/components-styles';

const NOTIFICATION_KEY = 'cpx-notifications';
const PRESENCE_HEARTBEAT_MS = 45000;

function channelsEqual(current, next) {
  if (current.length !== next.length) return false;
  return current.every((channel, index) => JSON.stringify(channel) === JSON.stringify(next[index]));
}

export default function ServidorPage() {
  const router = useRouter();
  const { isLoaded: clerkLoaded, isSignedIn, signOut } = useAuth({ treatPendingAsSignedOut: false });
  const { user: clerkUser } = useUser();
  const searchRef = useRef(null);
  const [user, setUser] = useState(null);
  const [cred, setCred] = useState(null);
  const [channels, setChannels] = useState([]);
  const [channelParticipants, setChannelParticipants] = useState({});
  const [active, setActive] = useState(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [movingParticipant, setMovingParticipant] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [rightTab, setRightTab] = useState('participants');
  const [search, setSearch] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [moveParticipantOpen, setMoveParticipantOpen] = useState(false);
  const [moveSelection, setMoveSelection] = useState(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [profileName, setProfileName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [presence, setPresence] = useState('online');
  const [sounds, setSounds] = useState(true);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [toasts, setToasts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [pendingCallName, setPendingCallName] = useState('');
  const [callInviteOpen, setCallInviteOpen] = useState(false);
  const [callInviteBusy, setCallInviteBusy] = useState(false);
  const [generatedCallInvite, setGeneratedCallInvite] = useState(null);
  const rightTabRef = useRef(rightTab);
  const usernameRef = useRef(user?.username);

  function pushToast(toast) {
    const item = { id: `${Date.now()}-${Math.random()}`, type: toast.type || 'info', title: toast.title || 'CPX', message: toast.message || '', createdAt: Date.now(), unread: true };
    setToasts((current) => [...current.slice(-3), item]);
    setNotifications((current) => {
      const next = [item, ...current].slice(0, 30);
      localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(next));
      return next;
    });
    if (sounds && typeof window !== 'undefined' && window.AudioContext) {
      try { const ctx = new window.AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = toast.type === 'error' ? 180 : 520; gain.gain.value = 0.035; osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.06); } catch {}
    }
    window.setTimeout(() => setToasts((current) => current.filter((entry) => entry.id !== item.id)), 4500);
  }

  useEffect(() => {
    try {
      const savedNotifications = JSON.parse(localStorage.getItem(NOTIFICATION_KEY) || '[]');
      setNotifications(Array.isArray(savedNotifications) ? savedNotifications : []);
    } catch {}
    const savedSounds = localStorage.getItem('cpx-sounds');
    if (savedSounds !== null) setSounds(savedSounds !== 'false');
  }, []);

  useEffect(() => { localStorage.setItem('cpx-sounds', String(sounds)); }, [sounds]);
  useEffect(() => { rightTabRef.current = rightTab; }, [rightTab]);
  useEffect(() => { usernameRef.current = user?.username; }, [user?.username]);

  useEffect(() => {
    let mounted = true;
    const requestedCall = new URLSearchParams(window.location.search).get('call');
    if (requestedCall) setPendingCallName(requestedCall);

    if (!clerkLoaded || typeof isSignedIn === 'undefined') return () => { mounted = false; };

    (async () => {
      try {
        if (isSignedIn === true && clerkUser?.id) {
          const response = await fetch('/api/profile/sync', { cache: 'no-store' });
          const json = await response.json();
          if (!mounted) return;
          if (!response.ok) {
            await signOut();
            router.replace('/');
            return;
          }
          const profile = json.profile;
          const name = profile?.username || clerkUser?.username || clerkUser?.primaryEmailAddress?.emailAddress?.split('@')[0] || 'Membro';
          setUser({ username: name, role: profile?.role || 'membro', type: 'member', identity: clerkUser?.id || profile?.clerkUserId });
          setProfileName(name);
          setPresence(profile?.presence_status || 'online');
          setCred({ type: 'session', value: null });
        } else if (isSignedIn === false) {
          const response = await fetch('/api/guest/session', { cache: 'no-store' });
          const json = await response.json();
          if (!response.ok) { router.replace('/'); return; }
          setUser({ username: json.username, role: 'convidado', type: 'guest', identity: `guest:${json.jti || ''}` });
          setProfileName(json.username || 'Convidado');
          if (!requestedCall && json.currentRoom) setPendingCallName(json.currentRoom);
          setPresence('online');
          setCred({ type: 'guest' });
        }
      } catch (error) {
        pushToast({ type: 'error', title: 'Sessão', message: error.message || 'Não foi possível inicializar sua sessão.' });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [clerkLoaded, isSignedIn, clerkUser?.id, router, signOut]);


  useEffect(() => {
    if (!cred) return;
    let mounted = true;
    async function loadChannels() {
      const headers = {};
      try {
        const response = await fetch('/api/channels', { headers, cache: 'no-store' });
        const json = await response.json();
        if (!mounted) return;
        if (!response.ok) { setMaintenance(response.status === 503 || json.maintenance); setChannels([]); pushToast({ type: 'error', title: 'Servidor', message: json.error || 'Não foi possível carregar os canais.' }); return; }
        setMaintenance(!!json.maintenance);
        const nextChannels = json.channels || [];
        setChannels((current) => channelsEqual(current, nextChannels) ? current : nextChannels);
      } catch (error) { if (mounted) pushToast({ type: 'error', title: 'Servidor', message: error.message || 'Falha ao consultar os canais.' }); }
    }
    loadChannels();
    const interval = window.setInterval(loadChannels, 10000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [cred]);

  useEffect(() => {
    if (!cred || !pendingCallName || !channels.length) return;
    const target = channels.find((channel) => channel.name === pendingCallName);
    if (!target) return;
    setPendingCallName('');
    if (window.history?.replaceState) window.history.replaceState({}, '', '/servidor');
    connect(target);
  }, [cred, channels, pendingCallName]);

  function applyRealtimePresence(channelName, realtimeChannel) {
    const state = realtimeChannel.presenceState();
    const participants = Object.values(state).flatMap((entries) => (entries || []).map((entry) => ({
      identity: entry.identity,
      name: entry.name || entry.identity?.replace(/^guest:/, '') || 'Participante',
      role: entry.role || 'membro',
      isSpeaking: !!entry.isSpeaking,
      sid: entry.sid || null,
    }))).filter((participant) => participant.identity);
    const unique = Array.from(new Map(participants.map((participant) => [participant.identity, participant])).values());
    setChannelParticipants((current) => ({ ...current, [channelName]: unique }));
  }

  // A lista lateral deve vir do LiveKit, não do Supabase Presence.
  // Assim, somente pessoas realmente conectadas à chamada podem ser movidas.
  useEffect(() => {
    if (!cred) return;
    let cancelled = false;

    async function loadLiveKitPresence() {
      try {
        const headers = {};
        const response = await fetch('/api/channels/presence', {
          headers,
          cache: 'no-store',
        });
        const json = await response.json();
        if (cancelled || !response.ok) return;
        setChannelParticipants(json.participants || {});
      } catch {}
    }

    loadLiveKitPresence();
    const interval = window.setInterval(loadLiveKitPresence, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [cred]);

  useEffect(() => {
    if (!cred || cred.type !== 'session') return;

    let cancelled = false;

    async function heartbeat(status = presence, keepalive = false) {
      if (cancelled) return;
      try {
        await fetch('/api/presence', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Presence-Heartbeat': '1',
          },
          body: JSON.stringify({ status }),
          cache: 'no-store',
          keepalive,
        });
      } catch {}
    }

    heartbeat();
    const interval = window.setInterval(() => heartbeat(), PRESENCE_HEARTBEAT_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') heartbeat();
    };
    const onPageHide = () => heartbeat('offline', true);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [cred, presence]);

  useEffect(() => {
    const handler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key.toLowerCase() === 'n' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) setNotificationsOpen((value) => !value);
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, []);

  async function connect(channel) {
    if (maintenance && user?.role !== 'admin') return pushToast({ type: 'error', title: 'Servidor em manutenção', message: 'Aguarde até que a manutenção seja encerrada.' });
    if (active?.id === channel.id && token) return;
    setConnecting(true); setActive(channel); setToken(''); setMessages([]); setRightOpen(true);
    try {
      const headers = {};
      const response = await fetch(`/api/token?room=${encodeURIComponent(channel.name)}`, { headers, cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Não foi possível entrar no canal.');
      setToken(json.token); await loadMessages(channel.id, true); pushToast({ type: 'success', title: 'Conectado', message: `Você entrou em #${channel.name}.` });
    } catch (error) { setActive(null); setToken(''); pushToast({ type: 'error', title: 'Não foi possível entrar', message: error.message }); }
    finally { setConnecting(false); setSidebarOpen(false); }
  }
  function disconnect() { setActive(null); setToken(''); setMessages([]); setMessageText(''); setRightOpen(false); }

  function openMoveParticipant(participant, sourceRoom) {
    if (user?.type !== 'member') return;
    if (!participant?.identity || participant.identity === user.identity) return pushToast({ type: 'info', title: 'Movimentação', message: 'Selecione outro participante para movimentar.' });
    const destinations = channels.filter((channel) => channel.name !== sourceRoom);
    if (!destinations.length) return pushToast({ type: 'info', title: 'Movimentação', message: 'Não existe outra call ativa para este participante.' });
    setMoveSelection({ identity: participant.identity, name: participant.name || participant.identity, sourceRoom });
    setMoveTarget(destinations[0].name);
    setMoveParticipantOpen(true);
  }

  const roomMoveGuardRef = useRef({ room: '', at: 0 });

  const handleRoomMoved = useCallback(async (roomName, movedToken) => {
    const nextRoom = String(roomName || '').trim();
    if (!nextRoom) return;

    const now = Date.now();
    if (roomMoveGuardRef.current.room === nextRoom && now - roomMoveGuardRef.current.at < 2500) return;
    roomMoveGuardRef.current = { room: nextRoom, at: now };

    setConnecting(true);

    try {
      let targetChannel = channels.find((channel) => channel.name === nextRoom);
      const attempts = [0, 250, 750, 1500];

      for (const delay of attempts) {
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));

        try {
          const response = await fetch('/api/channels', { cache: 'no-store' });
          const json = await response.json();
          if (!response.ok) continue;

          const nextChannels = json.channels || [];
          setChannels((current) => channelsEqual(current, nextChannels) ? current : nextChannels);
          targetChannel = nextChannels.find((channel) => channel.name === nextRoom);

          if (targetChannel) break;
        } catch {}
      }

      if (!targetChannel) {
        await fetch('/api/audit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'room_moved_sync_failed',
            channel: nextRoom,
            target: user?.username || user?.identity || 'participante',
            details: 'LiveKit informou a nova sala, mas a API de canais não retornou o destino.',
          }),
          keepalive: true,
        }).catch(() => {});

        throw new Error('A call de destino foi recebida pelo LiveKit, mas ainda não está disponível para sincronização.');
      }

      if (user?.type === 'guest') {
        const guestSessionResponse = await fetch('/api/guest/session', { cache: 'no-store' });
        const guestSession = await guestSessionResponse.json();
        if (!guestSessionResponse.ok || guestSession.currentRoom !== nextRoom) {
          throw new Error('A sessão do convidado ainda não confirmou a nova call. Tente novamente em alguns segundos.');
        }
      }

      if (typeof movedToken === 'string' && movedToken.trim()) {
        setToken(movedToken);
      }

      setActive(targetChannel);
      setMessages([]);
      setPendingCallName('');
      if (window.history?.replaceState) window.history.replaceState({}, '', '/servidor');

      const [messagesResult, presenceResult] = await Promise.allSettled([
        fetch('/api/messages?channel=' + encodeURIComponent(targetChannel.id), { cache: 'no-store' }).then(async (response) => {
          const json = await response.json();
          if (!response.ok) throw new Error(json.error || 'Não foi possível sincronizar o chat.');
          return json.messages || [];
        }),
        fetch('/api/channels/presence', { cache: 'no-store' }).then(async (response) => {
          const json = await response.json();
          if (!response.ok) throw new Error(json.error || 'Não foi possível sincronizar a presença.');
          return json.participants || {};
        }),
      ]);

      if (messagesResult.status === 'fulfilled') {
        setMessages(messagesResult.value);
      }

      if (presenceResult.status === 'fulfilled') {
        setChannelParticipants(presenceResult.value);
      }

      const syncProblems = [messagesResult, presenceResult]
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason?.message || 'sincronização secundária indisponível');

      if (syncProblems.length) {
        pushToast({
          type: 'info',
          title: 'Call sincronizada',
          message: 'A conexão foi transferida, mas alguns dados secundários ainda estão sendo atualizados.',
        });
      } else {
        pushToast({
          type: 'success',
          title: 'Você foi transferido',
          message: 'Agora você está em #' + targetChannel.name + '.',
        });
      }

      await fetch('/api/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'room_moved_synced',
          channel: targetChannel.name,
          target: user?.username || user?.identity || 'participante',
          details: 'Interface, autorização da sala, token e dados auxiliares sincronizados após movimentação pelo LiveKit.',
        }),
        keepalive: true,
      }).catch(() => {});
    } catch (error) {
      pushToast({
        type: 'error',
        title: 'Transferência',
        message: error.message || 'Não foi possível sincronizar a nova call.',
      });
    } finally {
      setConnecting(false);
    }
  }, [channels, user?.type, user?.username, user?.identity]);

  const handleCallReconnected = useCallback(async (liveKitRoomName) => {
    if (user?.type !== 'guest') return;

    try {
      const response = await fetch('/api/guest/session', { cache: 'no-store' });
      const session = await response.json();

      if (!response.ok || !session.currentRoom) {
        throw new Error(session.error || 'A sessão do convidado não pôde ser sincronizada após a reconexão.');
      }

      const serverRoom = String(session.currentRoom).trim();
      const connectedRoom = String(liveKitRoomName || active?.name || '').trim();
      if (!serverRoom) return;

      if (serverRoom !== connectedRoom) {
        const tokenResponse = await fetch(`/api/token?room=${encodeURIComponent(serverRoom)}`, {
          cache: 'no-store',
        });
        const tokenJson = await tokenResponse.json();

        if (!tokenResponse.ok || !tokenJson.token) {
          throw new Error(tokenJson.error || 'Não foi possível obter um novo token para a call atual.');
        }

        await handleRoomMoved(serverRoom, tokenJson.token);
        return;
      }

      // Na mesma sala, não trocamos o token: alterar a prop do LiveKit aqui
      // poderia provocar uma nova reconexão e criar um ciclo de reconexões.
    } catch (error) {
      await fetch('/api/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'room_reconnect_sync_failed',
          channel: active?.name || liveKitRoomName || '',
          target: user?.username || user?.identity || 'convidado',
          details: error.message || 'Falha ao sincronizar a sala após reconexão.',
        }),
        keepalive: true,
      }).catch(() => {});

      pushToast({
        type: 'error',
        title: 'Reconexão',
        message: error.message || 'Não foi possível confirmar a call atual após a reconexão.',
      });
    }
  }, [active?.name, handleRoomMoved, pushToast, user?.identity, user?.type, user?.username]);

  async function moveSelectedParticipant() {
    if (!moveSelection || !moveTarget || movingParticipant || !cred || cred.type !== 'session') return;
    setMovingParticipant(true);
    try {
      const response = await fetch('/api/admin/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceRoom: moveSelection.sourceRoom, destinationRoom: moveTarget, identity: moveSelection.identity, name: moveSelection.name }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Não foi possível mover o participante.');
      const targetChannel = channels.find((channel) => channel.name === moveTarget);
      setMoveParticipantOpen(false);
      setMoveSelection(null);
      setMoveTarget('');
      pushToast({ type: 'success', title: 'Participante movido', message: `${moveSelection.name} foi movido de #${moveSelection.sourceRoom} para #${moveTarget}.` });
      if (targetChannel) {
        setChannelParticipants((current) => {
          const next = { ...current };
          next[moveSelection.sourceRoom] = (next[moveSelection.sourceRoom] || []).filter((participant) => participant.identity !== moveSelection.identity);
          next[moveTarget] = [...(next[moveTarget] || []).filter((participant) => participant.identity !== moveSelection.identity), { identity: moveSelection.identity, name: moveSelection.name, role: 'membro' }];
          return next;
        });
      }
    } catch (error) {
      pushToast({ type: 'error', title: 'Movimentação', message: error.message || 'Não foi possível mover o participante.' });
    } finally {
      setMovingParticipant(false);
    }
  }

  async function createCallInvite() {
    if (!active || user?.type !== 'member' || !cred || cred.type !== 'session' || callInviteBusy) return;
    setCallInviteBusy(true);
    setGeneratedCallInvite(null);
    try {
      const response = await fetch('/api/call-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: active.name }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Não foi possível criar o convite.');
      setGeneratedCallInvite(json);
      try {
        await navigator.clipboard?.writeText(json.link);
        pushToast({ type: 'success', title: 'Convite criado', message: 'O link foi copiado para a área de transferência.' });
      } catch {
        pushToast({ type: 'success', title: 'Convite criado', message: 'O convite está pronto para compartilhar.' });
      }
    } catch (error) {
      pushToast({ type: 'error', title: 'Convite', message: error.message || 'Não foi possível criar o convite.' });
    } finally {
      setCallInviteBusy(false);
    }
  }

  function openCallInvite() {
    if (user?.type !== 'member' || !active) return;
    setGeneratedCallInvite(null);
    setCallInviteOpen(true);
  }

  async function copyGeneratedCallInvite() {
    if (!generatedCallInvite?.link) return;
    try {
      await navigator.clipboard.writeText(generatedCallInvite.link);
      pushToast({ type: 'success', title: 'Convite', message: 'Link copiado.' });
    } catch {
      pushToast({ type: 'error', title: 'Convite', message: 'Não foi possível copiar o link.' });
    }
  }

  async function loadMessages(channelId, silent = false) {
    if (!channelId || !cred) return;
    const headers = {};
    try {
      const response = await fetch(`/api/messages?channel=${encodeURIComponent(channelId)}`, { headers, cache: 'no-store' });
      const json = await response.json(); if (!response.ok) throw new Error(json.error || 'Não foi possível carregar o chat.');
      setMessages((current) => {
        const incoming = json.messages || []; const lastIncoming = incoming[incoming.length - 1]; const lastCurrent = current[current.length - 1];
        if (!silent && lastIncoming && lastIncoming.id !== lastCurrent?.id && lastIncoming.sender_name !== user?.username && rightTab !== 'chat') pushToast({ type: 'info', title: 'Nova mensagem', message: `${lastIncoming.sender_name}: ${lastIncoming.content.slice(0, 70)}` });
        return incoming;
      });
    } catch (error) { if (!silent) pushToast({ type: 'error', title: 'Chat', message: error.message }); }
  }
  useEffect(() => {
    if (!active || !cred) return;
    let cancelled = false;
    loadMessages(active.id, true);
    const realtimeChannel = supabase.channel('cpx-chat:' + active.id);
    realtimeChannel
      .on('broadcast', { event: 'message_created' }, (event) => {
        const message = event?.payload?.message;
        if (!message || cancelled) return;
        setMessages((current) => {
          if (current.some((item) => item.id === message.id)) return current;
          if (message.sender_name !== usernameRef.current && rightTabRef.current !== 'chat') {
            pushToast({ type: 'info', title: 'Nova mensagem', message: message.sender_name + ': ' + message.content.slice(0, 70) });
          }
          return [...current, message].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(realtimeChannel);
    };
  }, [active?.id, cred]);

  async function sendMessage(event) {
    event.preventDefault(); if (!active || !messageText.trim() || !cred) return;
    const headers = { 'Content-Type': 'application/json' };
    const response = await fetch('/api/messages', { method: 'POST', headers, body: JSON.stringify({ channelId: active.id, content: messageText.trim() }) }); const json = await response.json();
    if (!response.ok) {
      pushToast({ type: 'error', title: 'Mensagem', message: json.error || 'Não foi possível enviar.' });
      return false;
    }
    setMessageText(''); setMessages((current) => current.some((item) => item.id === json.message.id) ? current : [...current, json.message]);
    return true;
  }
  async function moderate(room, identity, action) {
    const response = await fetch('/api/moderation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room, identity, action }) }); const json = await response.json();
    if (!response.ok) return pushToast({ type: 'error', title: 'Moderação', message: json.error || 'Operação não concluída.' });
    pushToast({ type: 'success', title: 'Moderação aplicada', message: action === 'disconnect' ? `${identity.replace(/^guest:/, '')} foi desconectado.` : 'Microfone silenciado.' });
  }

  async function updateProfile(event) {
    event.preventDefault(); if (!cred || user?.type === 'guest') return;
    const name = profileName.trim();
    const headers = { 'Content-Type': 'application/json' };
    const response = await fetch('/api/profile', { method: 'PATCH', headers, body: JSON.stringify({ username: name }) }); const json = await response.json();
    if (!response.ok) return pushToast({ type: 'error', title: 'Perfil', message: json.error || 'Não foi possível atualizar.' });
    setUser((current) => ({ ...current, username: json.profile.username })); setProfileEditorOpen(false); pushToast({ type: 'success', title: 'Perfil atualizado', message: 'Seu nome foi alterado com sucesso.' });
  }

  async function changeOwnPassword(event) {
    event.preventDefault();
    if (!cred || user?.type === 'guest') return;
    if (newPassword.length < 8) return pushToast({ type: 'error', title: 'Senha', message: 'A nova senha deve ter pelo menos 8 caracteres.' });
    if (newPassword !== confirmPassword) return pushToast({ type: 'error', title: 'Senha', message: 'As senhas não conferem.' });
    setPasswordBusy(true);
    try {
      const response = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Não foi possível alterar sua senha.');
      setNewPassword(''); setConfirmPassword('');
      pushToast({ type: 'success', title: 'Senha alterada', message: 'Sua senha foi alterada com sucesso.' });
    } catch (error) {
      pushToast({ type: 'error', title: 'Senha', message: error.message });
    } finally {
      setPasswordBusy(false);
    }
  }

  async function logout() { try { if (user?.type === 'member') await signOut(); else await fetch('/api/guest/logout', { method: 'POST' }); } finally { router.replace('/'); } }
  function handleRightTab(tab, open = true) { setRightTab(tab); setRightOpen(open); }
  function clearNotifications() { setNotifications([]); localStorage.removeItem(NOTIFICATION_KEY); }
  function markNotificationsRead() { setNotifications((current) => { const next = current.map((item) => ({ ...item, unread: false })); localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(next)); return next; }); }

  const unreadCount = notifications.filter((item) => item.unread).length;
  const groupedChannels = useMemo(() => { const q = search.trim().toLowerCase(); return channels.filter((channel) => !q || `${channel.name} ${channel.category} ${channel.description || ''}`.toLowerCase().includes(q)).reduce((groups, channel) => { const category = channel.category || 'GERAL'; groups[category] ||= []; groups[category].push(channel); return groups; }, {}); }, [channels, search]);
  const relativeTime = (timestamp) => { const seconds = Math.max(0, Math.floor((Date.now() - Number(timestamp)) / 1000)); if (seconds < 60) return 'agora'; if (seconds < 3600) return `${Math.floor(seconds / 60)} min`; return `${Math.floor(seconds / 3600)} h`; };

  if (loading) return <main className="login-page"><Spinner label="Preparando seu espaço no CPX..." /></main>;

  return <main className="server-shell no-right">
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="sidebar-head"><div className="sidebar-brand"><div className="mini-logo" role="img" aria-label="Complexo"> </div><div className="sidebar-title"><strong>CPX Call</strong><span>Comunidade de voz e vídeo</span></div></div><button className="icon-btn mobile-only" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><Icon name="close" /></button></div>
      {maintenance && <div className="maintenance-banner"><b>Modo manutenção</b><br />Novos acessos estão temporariamente bloqueados.</div>}
      <div className="sidebar-scroll">
        {Object.entries(groupedChannels).map(([category, items]) => <div className="side-section" key={category}>
          <div className="side-section-title">{category}</div>
          {items.map((channel) => {
            const liveMembers = channelParticipants[channel.name] || [];
            return <div className="channel-tree" key={channel.id}>
              <button className={`channel-item ${active?.id === channel.id ? 'active' : ''}`} title={channel.description || channel.name} onClick={() => connect(channel)}>
                <span className="channel-icon">{channel.icon === 'chat' ? <Icon name="chat" size={15} /> : <Icon name="phone" size={15} />}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.name}</span>
                {liveMembers.length > 0 && <span className="channel-count">{liveMembers.length}</span>}
              </button>
              {liveMembers.length > 0 && <div className="channel-members" aria-label={`Participantes em #${channel.name}`}>
                {liveMembers.slice(0, 30).map((participant) => <button key={participant.identity} type="button" className="channel-member" onClick={() => openMoveParticipant(participant, channel.name)} disabled={user?.type !== 'member'} title={user?.type === 'member' ? `Mover ${participant.name} para outra call` : participant.name}>
                  <span className="member-rail" />
                  <Avatar name={participant.name} size="sm" status="online" />
                  <span className="channel-member-name">{participant.name}{participant.identity === user?.identity ? ' (você)' : ''}</span>
                  {participant.isSpeaking && <span className="channel-member-speaking">falando</span>}
                </button>)}
                {liveMembers.length > 30 && <span className="channel-member-more">+ {liveMembers.length - 30} participantes</span>}
              </div>}
            </div>;
          })}
        </div>)}
        {!Object.keys(groupedChannels).length && <EmptyState icon="search" title="Nenhum canal" description={maintenance ? 'O servidor está em manutenção.' : 'Nenhum canal corresponde à sua busca.'} />}
      </div>
      <div className="sidebar-user">
        {profileOpen && <div className="profile-menu"><div className="menu-label">Status</div><button onClick={() => setPresence('online')}><i className="presence-dot" /> Online</button><button onClick={() => setPresence('away')}><i className="presence-dot away" /> Ausente</button><button onClick={() => setPresence('busy')}><i className="presence-dot busy" /> Não perturbe</button><div className="menu-divider" /><button onClick={() => { setProfileEditorOpen(true); setProfileOpen(false); }} disabled={user?.type === 'guest'}><Icon name="users" size={15} /> Meu perfil</button><button onClick={() => { setSettingsOpen(true); setProfileOpen(false); }}><Icon name="settings" size={15} /> Preferências</button>{user?.role === 'admin' && <button onClick={() => router.push('/admin')}><Icon name="shield" size={15} /> Centro de comando</button>}<button onClick={logout}><Icon name="logout" size={15} /> Encerrar sessão</button></div>}
        <div className="user-card"><Avatar name={user?.username} size="md" status={presence} /><div className="user-meta"><strong>{user?.username}</strong><span>{user?.role === 'admin' ? 'Administrador' : user?.role === 'convidado' ? 'Convidado' : 'Membro'}</span></div><div className="user-actions"><button className="icon-btn" onClick={() => setProfileOpen((value) => !value)} aria-label="Abrir menu do perfil"><Icon name="settings" size={16} /></button></div></div>
      </div>
    </aside>

    <section className="main-area">
      <header className="topbar"><button className="icon-btn mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir canais"><Icon name="menu" /></button><div className="topbar-channel">{active ? <><span className="hash">#</span><strong>{active.name}</strong><span className="topbar-sub">{active.description || 'Canal de voz e vídeo'}</span></> : <><span className="topbar-brand-mark" aria-hidden="true" /><strong>Área principal</strong><span className="topbar-sub">Selecione um canal para começar</span></>}</div><span className="topbar-spacer" /><div className="search-box"><Icon name="search" size={16} /><input ref={searchRef} className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar canais...  Ctrl+K" aria-label="Buscar canais" /></div><button className={`icon-btn topbar-alert ${unreadCount ? '' : 'empty'}`} onClick={() => { setNotificationsOpen(true); markNotificationsRead(); }} aria-label={`Notificações${unreadCount ? `, ${unreadCount} novas` : ''}`}><Icon name="bell" /></button><button className="icon-btn mobile-only" onClick={() => handleRightTab('participants', !rightOpen)} aria-label="Participantes"><Icon name="users" /></button><button className="icon-btn" onClick={() => handleRightTab('chat')} aria-label="Chat"><Icon name="chat" /></button><button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Configurações"><Icon name="settings" /></button></header>
      {connecting && <div className="call-loading"><Spinner label="Estabelecendo conexão segura..." /></div>}
      {!active || !token ? <div className="main-content"><section className="call-area"><div className="call-empty"><div className="empty-card"><div className="empty-icon"><Icon name="phone" size={28} /></div><h2 style={{ margin: '0 0 8px' }}>Seu espaço no CPX</h2><p style={{ color: 'var(--muted)', lineHeight: 1.6, fontSize: 13 }}>{maintenance ? 'O servidor está em manutenção. Usuários sem permissão de administrador não podem iniciar novas chamadas neste momento.' : 'Escolha um canal na lateral para entrar na chamada. Você poderá conversar por texto, usar câmera, compartilhar a tela e controlar seu áudio.'}</p><div style={{ marginTop: 17, display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}><Badge tone="purple">Voz</Badge><Badge tone="purple">Vídeo</Badge><Badge tone="purple">Chat</Badge><Badge tone="green">Acesso controlado</Badge></div></div></div></section></div> : <RoomExperience token={token} serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL} channel={active} user={user} rightTab={rightTab} rightPanelOpen={rightOpen} onRightTab={handleRightTab} messages={messages} messageText={messageText} setMessageText={setMessageText} onSendMessage={sendMessage} onToast={pushToast} onDisconnect={disconnect} onModerate={moderate} onCreateInvite={openCallInvite} onRoomMoved={handleRoomMoved} onCallReconnected={handleCallReconnected} participantFilter={rightTab === 'participants' ? search : ''} />}
    </section>

    <Modal open={moveParticipantOpen} title="Mover participante" onClose={() => { if (!movingParticipant) { setMoveParticipantOpen(false); setMoveSelection(null); } }} width={480}>
      <div style={{ display: 'grid', gap: 14 }}>
        {moveSelection && <div className="profile-identity"><Avatar name={moveSelection.name} size="lg" status="online" /><div><strong>{moveSelection.name}</strong><span>Atual: #{moveSelection.sourceRoom}</span></div></div>}
        <div className="field"><label>Mover para outra chamada</label><select className="input" value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)} disabled={movingParticipant}>{channels.filter((channel) => channel.name !== moveSelection?.sourceRoom).map((channel) => <option key={channel.id} value={channel.name}># {channel.name}</option>)}</select></div>
        <span className="helper">O participante será transferido da chamada atual para a chamada escolhida.</span>
        <div className="modal-actions"><button type="button" className="ghost-btn" onClick={() => { setMoveParticipantOpen(false); setMoveSelection(null); }} disabled={movingParticipant}>Cancelar</button><button type="button" className="primary-btn" onClick={moveSelectedParticipant} disabled={movingParticipant || !moveSelection || !moveTarget}>{movingParticipant ? <Spinner label="Movendo..." /> : <><Icon name="chevron" size={15} /> Mover para chamada</>}</button></div>
      </div>
    </Modal>

    <Modal open={callInviteOpen} title={generatedCallInvite ? 'Convite criado' : `Convidar para #${active?.name || 'chamada'}`} onClose={() => { if (!callInviteBusy) { setCallInviteOpen(false); setGeneratedCallInvite(null); } }}>
      {!generatedCallInvite ? <div className="call-invite-dialog">
        <div className="call-invite-target"><Icon name="phone" size={18} /><div><strong>#{active?.name}</strong><span>Convite vinculado a esta chamada.</span></div></div>
        <p className="helper">O convite usará automaticamente as regras definidas pelo administrador e só pode ser criado enquanto você estiver dentro desta chamada.</p>
        <div className="modal-actions"><button type="button" className="ghost-btn" onClick={() => setCallInviteOpen(false)} disabled={callInviteBusy}>Cancelar</button><button type="button" className="primary-btn" onClick={createCallInvite} disabled={callInviteBusy}>{callInviteBusy ? <Spinner label="Criando..." /> : <><Icon name="shield" size={15} /> Criar convite</>}</button></div>
      </div> : <div className="call-invite-dialog">
        <div className="call-invite-success"><Icon name="check" size={18} /><div><strong>Convite pronto</strong><span>#{generatedCallInvite.roomName} · expira em {new Date(generatedCallInvite.expiresAt).toLocaleString('pt-BR')}</span></div></div>
        <div className="call-invite-code"><span>Código</span><strong>{generatedCallInvite.code}</strong></div>
        <div className="call-invite-link">{generatedCallInvite.link}</div>
        <div className="modal-actions"><button type="button" className="ghost-btn" onClick={copyGeneratedCallInvite}>Copiar link</button><button type="button" className="primary-btn" onClick={() => { setCallInviteOpen(false); setGeneratedCallInvite(null); }}>Fechar</button></div>
      </div>}
    </Modal>

    <Modal open={notificationsOpen} title="Notificações" onClose={() => setNotificationsOpen(false)}>
      <div className="notification-actions"><span className="helper">{notifications.length ? `${notifications.length} eventos recentes` : 'Nenhuma notificação recente'}</span>{notifications.length > 0 && <button className="ghost-btn button-sm" onClick={clearNotifications}>Limpar histórico</button>}</div>
      {notifications.length ? <div className="notification-list">{notifications.map((item) => <div key={item.id} className={`notification-item ${item.unread ? 'unread' : ''}`}><div className="toast-icon"><Icon name={item.type === 'error' ? 'warning' : item.type === 'success' ? 'check' : 'bell'} size={16} /></div><div className="notification-copy"><strong>{item.title}</strong><span>{item.message}</span></div><span className="notification-time">{relativeTime(item.createdAt)}</span></div>)}</div> : <EmptyState icon="bell" title="Tudo tranquilo" description="Eventos de conexão, mensagens e chamadas aparecerão aqui." />}
    </Modal>

    <Modal open={profileEditorOpen} title="Meu perfil" onClose={() => setProfileEditorOpen(false)}>
      <div className="profile-identity"><Avatar name={user?.username} size="lg" status={presence} /><div><strong>{user?.username}</strong><span>{user?.role === 'admin' ? 'Administrador' : 'Membro'} • Status {presence}</span></div></div>
      <form onSubmit={updateProfile}><div className="field"><label>Nome exibido</label><input className="input" value={profileName} maxLength={32} onChange={(e) => setProfileName(e.target.value)} /><span className="helper">Este nome será usado na lista de participantes e no chat.</span></div><div className="modal-actions"><button type="button" className="ghost-btn" onClick={() => setProfileEditorOpen(false)}>Cancelar</button><button className="primary-btn">Salvar alterações</button></div></form>
      <div className="menu-divider" style={{ margin: '18px 0' }} />
      <form onSubmit={changeOwnPassword}>
        <div className="field"><label>Nova senha</label><input className="input" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /><span className="helper">Use pelo menos 8 caracteres.</span></div>
        <div className="field"><label>Confirmar nova senha</label><input className="input" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></div>
        <div className="modal-actions"><button type="submit" className="primary-btn" disabled={passwordBusy}>{passwordBusy ? <Spinner label="Alterando..." /> : 'Alterar senha'}</button></div>
      </form>
    </Modal>

    <Modal open={settingsOpen} title="Preferências do CPX" onClose={() => setSettingsOpen(false)}>
      <div className="field">
        <div className="toggle-row"><div><strong>Sons da interface</strong><span>Notificações discretas ao entrar, sair ou receber eventos.</span></div><input className="switch" type="checkbox" checked={sounds} onChange={(e) => setSounds(e.target.checked)} /></div>
        <div className="toggle-row"><div><strong>Notificações</strong><span>Pressione N para abrir o centro de notificações.</span></div><Badge tone="green">Ativo</Badge></div>
        <div className="toggle-row"><div><strong>Atalhos de chamada</strong><span>M = microfone · C = câmera · S = tela · Esc = sair.</span></div><Badge tone="green">Ativo</Badge></div>
        <div className="modal-actions"><button type="button" className="primary-btn" onClick={() => setSettingsOpen(false)}>Fechar</button></div>
      </div>
    </Modal>
    <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
  </main>;
}