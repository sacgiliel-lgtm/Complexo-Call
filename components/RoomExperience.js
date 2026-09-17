'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionQuality, Track } from 'livekit-client';
import {
  LiveKitRoom,
  MediaDeviceMenu,
  RoomAudioRenderer,
  StartMediaButton,
  VideoTrack,
  useConnectionQualityIndicator,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTrackToggle,
  useTracks,
} from '@livekit/components-react';
import { Icon, Avatar, EmptyState, Badge } from './ui';

function displayName(participant) {
  return participant.name || participant.identity?.replace(/^guest:/, '') || 'Participante';
}

function participantRole(participant) {
  try { return JSON.parse(participant.metadata || '{}').role || 'membro'; } catch { return 'membro'; }
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function qualityLabel(quality) {
  switch (quality) {
    case ConnectionQuality.Excellent: return 'Excelente';
    case ConnectionQuality.Good: return 'Boa';
    case ConnectionQuality.Poor: return 'Instável';
    case ConnectionQuality.Lost: return 'Perdida';
    default: return 'Avaliando';
  }
}

function qualityTone(quality) {
  switch (quality) {
    case ConnectionQuality.Excellent: return 'excellent';
    case ConnectionQuality.Good: return 'good';
    case ConnectionQuality.Poor: return 'poor';
    case ConnectionQuality.Lost: return 'lost';
    default: return 'unknown';
  }
}

export function RoomExperience({ token, serverUrl, channel, user, rightTab, rightPanelOpen = true, onRightTab, messages, messageText, setMessageText, onSendMessage, onToast, onDisconnect, onModerate, participantFilter = '', theme = 'cpx' }) {
  const [ready, setReady] = useState(false);
  const [joinAudio, setJoinAudio] = useState(true);
  const [joinVideo, setJoinVideo] = useState(false);
  const [endedSummary, setEndedSummary] = useState(null);
  const startedAtRef = useRef(null);
  const finishTimerRef = useRef(null);

  useEffect(() => () => {
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
  }, []);

  function handleConnected() {
    startedAtRef.current = Date.now();
  }

  function handleDisconnected() {
    const duration = startedAtRef.current ? Math.floor((Date.now() - startedAtRef.current) / 1000) : 0;
    setEndedSummary({ duration });
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = window.setTimeout(() => onDisconnect?.({ duration }), 2600);
  }

  if (endedSummary) return <CallEndedScreen channel={channel} user={user} duration={endedSummary.duration} onBack={() => onDisconnect?.({ duration: endedSummary.duration })} />;
  if (!ready) {
    return <CallLobby channel={channel} user={user} audio={joinAudio} video={joinVideo} setAudio={setJoinAudio} setVideo={setJoinVideo} onCancel={() => onDisconnect?.()} onJoin={() => setReady(true)} />;
  }

  return <LiveKitRoom token={token} serverUrl={serverUrl} connect audio={joinAudio} video={joinVideo} onConnected={handleConnected} onDisconnected={handleDisconnected} onError={(error) => onToast?.({ type: 'error', title: 'Falha na chamada', message: error?.message || 'A conexão foi interrompida.' })}>
    <RoomAudioRenderer />
    <RoomConnectedExperience channel={channel} user={user} rightTab={rightTab} rightPanelOpen={rightPanelOpen} onRightTab={onRightTab} onCloseRight={() => onRightTab('participants', false)} messages={messages} messageText={messageText} setMessageText={setMessageText} onSendMessage={onSendMessage} onToast={onToast} onModerate={onModerate} participantFilter={participantFilter} theme={theme} />
    <StartMediaButton label="Ativar áudio" className="secondary-btn start-media-button" />
  </LiveKitRoom>;
}

function CallLobby({ channel, user, audio, video, setAudio, setVideo, onCancel, onJoin }) {
  return <div className="call-lobby-shell">
    <div className="call-lobby-glow" />
    <div className="call-lobby-card">
      <div className="call-lobby-brand"><span className="call-lobby-logo">CPX</span><span>CALL</span></div>
      <div className="call-lobby-kicker">Preparar chamada</div>
      <h2>Entrar em <span>#{channel.name}</span></h2>
      <p>Confira seus dispositivos antes de entrar. Você poderá alterar tudo durante a chamada.</p>
      <div className="call-preview-card">
        <div className="call-preview-avatar"><Avatar name={user.username} size="xl" status="online" /></div>
        <div className="call-preview-copy"><strong>{user.username}</strong><span>{user.role === 'admin' ? 'Administrador' : user.role === 'convidado' ? 'Convidado' : 'Membro'}</span></div>
        <div className="call-preview-state"><i className="presence-dot" /> Pronto para entrar</div>
      </div>
      <div className="call-device-grid">
        <button type="button" className={`call-device-choice ${audio ? 'active' : ''}`} onClick={() => setAudio(!audio)}><span className="choice-icon"><Icon name="mic" /></span><span><b>{audio ? 'Microfone ligado' : 'Microfone desligado'}</b><small>Você poderá alternar depois</small></span><span className="choice-state">{audio ? 'ON' : 'OFF'}</span></button>
        <button type="button" className={`call-device-choice ${video ? 'active' : ''}`} onClick={() => setVideo(!video)}><span className="choice-icon"><Icon name="camera" /></span><span><b>{video ? 'Câmera ligada' : 'Câmera desligada'}</b><small>Começar sem câmera é possível</small></span><span className="choice-state">{video ? 'ON' : 'OFF'}</span></button>
      </div>
      <div className="call-lobby-actions"><button className="ghost-btn" type="button" onClick={onCancel}>Voltar</button><button className="primary-btn lobby-join" type="button" onClick={onJoin}><Icon name="phone" size={17} /> Entrar na chamada</button></div>
      <div className="call-lobby-tip"><Icon name="shield" size={13} /> Conexão protegida pelo CPX Call</div>
    </div>
  </div>;
}

function RoomConnectedExperience({ channel, user, rightTab, rightPanelOpen, onRightTab, onCloseRight, messages, messageText, setMessageText, onSendMessage, onToast, onModerate, participantFilter, theme }) {
  const participants = useParticipants();
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const screenTracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const [chatSearch, setChatSearch] = useState('');
  const [focusedIdentity, setFocusedIdentity] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const previous = useRef(new Set());
  const mounted = useRef(false);
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });

  useEffect(() => {
    const interval = window.setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const current = new Set(participants.map((participant) => participant.identity));
    if (mounted.current) {
      participants.forEach((participant) => {
        if (!previous.current.has(participant.identity) && participant.identity !== localParticipant?.identity) onToast?.({ type: 'success', title: 'Alguém entrou na call', message: `${displayName(participant)} entrou em #${channel.name}.` });
      });
      previous.current.forEach((identity) => {
        if (!current.has(identity) && identity !== localParticipant?.identity) onToast?.({ type: 'info', title: 'Participante saiu', message: `${identity.replace(/^guest:/, '')} saiu de #${channel.name}.` });
      });
    }
    previous.current = current;
    mounted.current = true;
  }, [participants, channel.name, localParticipant?.identity, onToast]);

  const sorted = useMemo(() => [...participants].sort((a, b) => {
    if (a.isSpeaking !== b.isSpeaking) return a.isSpeaking ? -1 : 1;
    if (a.identity === localParticipant?.identity) return -1;
    if (b.identity === localParticipant?.identity) return 1;
    return displayName(a).localeCompare(displayName(b));
  }), [participants, localParticipant?.identity]);

  const filtered = participantFilter.trim() ? sorted.filter((participant) => displayName(participant).toLowerCase().includes(participantFilter.toLowerCase())) : sorted;
  const filteredMessages = chatSearch.trim() ? messages.filter((message) => `${message.sender_name} ${message.content}`.toLowerCase().includes(chatSearch.toLowerCase())) : messages;
  const speakingParticipant = participants.find((participant) => participant.isSpeaking) || localParticipant;
  const activeFocus = focusedIdentity || speakingParticipant?.identity;
  const stateLabel = String(connectionState || '').toLowerCase();
  const connectionLabel = stateLabel.includes('reconnecting') ? 'Reconectando...' : stateLabel.includes('connected') ? 'Conectado' : 'Conectando...';
  const connectionTone = connectionLabel.includes('Recon') ? 'yellow' : connectionLabel === 'Conectado' ? 'green' : 'neutral';
  const cameraRefFor = (participant) => cameraTracks.find((trackRef) => trackRef.participant.identity === participant.identity);

  return <div className={`room-experience ${theme} ${focusMode ? 'focus-mode' : ''}`}>
    <section className="call-area">
      <div className="call-topbar">
        <div className="call-topbar-left"><div className="call-channel-avatar"><Icon name="phone" size={17} /></div><div><strong>#{channel.name}</strong><span>{participants.length} {participants.length === 1 ? 'pessoa' : 'pessoas'} na chamada</span></div></div>
        <div className="call-topbar-center"><span className="call-live-pill"><i /> Ao vivo</span><span className="call-duration">{formatDuration(elapsed)}</span></div>
        <div className="call-topbar-right">
          <div className="quality-wrap"><button className={`quality-pill quality-${qualityTone(quality)}`} onClick={() => setQualityOpen((value) => !value)}><span className="quality-bars"><i /><i /><i /><i /></span><span>{qualityLabel(quality)}</span></button>{qualityOpen && <div className="quality-popover"><div className="popover-title">Conexão</div><div className="quality-popover-main"><span className={`quality-orb quality-${qualityTone(quality)}`}><Icon name="wifi" size={18} /></span><div><strong>{qualityLabel(quality)}</strong><span>Qualidade da sua conexão</span></div></div><div className="quality-row"><span>Participantes</span><b>{participants.length}</b></div><div className="quality-row"><span>Servidor</span><b>LiveKit</b></div></div>}</div>
          <button className="icon-btn topbar-btn" onClick={() => onRightTab('chat', true)} title="Abrir chat"><Icon name="chat" size={17} /></button>
        </div>
      </div>
      <div className="call-stage custom-call-stage">
        {screenTracks.length > 0 && <div className="screen-share-stage">{screenTracks.map((trackRef) => <div className="screen-share-card" key={trackRef.publication?.trackSid || trackRef.participant.identity}><VideoTrack trackRef={trackRef} /><div className="screen-share-label"><Icon name="monitor" size={12} /> {displayName(trackRef.participant)} está compartilhando a tela</div></div>)}</div>}
        {!screenTracks.length && filtered.length > 0 && <div className={`participant-grid count-${Math.min(filtered.length, 9)}`}>{filtered.map((participant) => {
          const name = displayName(participant);
          const local = participant.identity === localParticipant?.identity;
          const cameraRef = cameraRefFor(participant);
          const role = participantRole(participant);
          const focused = focusMode && participant.identity === activeFocus;
          return <ParticipantCard key={participant.identity} participant={participant} name={name} local={local} role={role} cameraRef={cameraRef} focused={focused} onFocus={() => setFocusedIdentity(participant.identity)} />;
        })}</div>}
        {!filtered.length && <EmptyState icon="users" title="Ninguém nesta chamada" description="Quando alguém entrar, o participante aparecerá aqui." />}
        <div className="stage-vignette" />
        <div className="stage-shortcuts"><span><kbd>M</kbd> microfone</span><span><kbd>C</kbd> câmera</span><span><kbd>S</kbd> tela</span><span><kbd>F</kbd> foco</span><span><kbd>Esc</kbd> sair</span></div>
      </div>
      <div className="call-floating-controls"><CallControls focusMode={focusMode} setFocusMode={setFocusMode} moreOpen={moreOpen} setMoreOpen={setMoreOpen} /></div>
    </section>
    <aside className={`right-panel ${rightPanelOpen ? 'open' : ''}`}>
      <div className="right-tabs"><button className={`right-tab ${rightTab === 'participants' ? 'active' : ''}`} onClick={() => onRightTab('participants', true)}>Pessoas <span className="channel-count">{participants.length}</span></button><button className={`right-tab ${rightTab === 'chat' ? 'active' : ''}`} onClick={() => onRightTab('chat', true)}>Chat{messages.length > 0 && <span className="chat-tab-dot" />}</button></div>
      <button className="icon-btn mobile-only" onClick={onCloseRight} aria-label="Fechar painel" style={{ position: 'absolute', right: 5, top: 6, zIndex: 4 }}><Icon name="close" size={16} /></button>
      {rightTab === 'participants' ? <div className="panel-scroll"><div className="panel-title">NESTA CALL</div>{filtered.length ? filtered.map((participant) => {
        const name = displayName(participant); const local = participant.identity === localParticipant?.identity; const role = participantRole(participant); const mic = participant.isMicrophoneEnabled; const cam = participant.isCameraEnabled;
        return <div key={participant.identity} className={`participant-row ${participant.isSpeaking ? 'speaking-row' : ''}`}><Avatar name={name} size="sm" status="online" /><div className="participant-info"><strong>{name}{local ? ' (você)' : ''}</strong><span><i className="presence-dot" />{role === 'admin' ? 'Administrador' : role === 'convidado' ? 'Convidado' : 'Membro'}{participant.isSpeaking ? ' • falando agora' : ''}</span></div><div className="participant-tools"><span className={mic ? 'media-mini on' : 'media-mini'}><Icon name={mic ? 'mic' : 'close'} size={12} /></span><span className={cam ? 'media-mini on' : 'media-mini'}><Icon name={cam ? 'camera' : 'close'} size={12} /></span>{!local && user.role === 'admin' && <><button className="icon-btn" title={mic ? 'Silenciar microfone' : 'Microfone indisponível'} disabled={!mic} onClick={() => onModerate?.(channel.name, participant.identity, 'mute')}><Icon name="mic" size={13} /></button><button className="icon-btn" title="Desconectar" onClick={() => onModerate?.(channel.name, participant.identity, 'disconnect')}><Icon name="logout" size={13} /></button></>}</div></div>;
      }) : <EmptyState icon="users" title="Ninguém encontrado" description="Tente outro nome na pesquisa." />}</div> : <div className="chat-wrap"><div className="chat-search-head"><div className="search-box" style={{ width: '100%' }}><Icon name="search" size={15} /><input className="input" value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Pesquisar mensagens..." aria-label="Pesquisar mensagens" /></div></div><div className="chat-list">{filteredMessages.length ? filteredMessages.map((message) => <div className="chat-message" key={message.id}><Avatar name={message.sender_name} size="sm" /><div className="chat-body"><div className="chat-meta"><strong>{message.sender_name}</strong><span>{new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div><div className="chat-text">{message.content}</div></div></div>) : <EmptyState icon="chat" title={chatSearch ? 'Nenhuma mensagem encontrada' : 'Sem mensagens ainda'} description={chatSearch ? 'Tente outro termo.' : 'Comece a conversa com o pessoal desta call.'} />}</div><form className="chat-composer" onSubmit={onSendMessage}><input className="input" maxLength={500} value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Escreva uma mensagem..." aria-label="Mensagem" /><button className="primary-btn" disabled={!messageText.trim()} aria-label="Enviar"><Icon name="chat" size={16} /></button></form></div>}
    </aside>
  </div>;
}

function ParticipantCard({ participant, name, local, role, cameraRef, focused, onFocus }) {
  const { quality } = useConnectionQualityIndicator({ participant });
  const qualityClass = qualityTone(quality);
  const hasVideo = Boolean(participant.isCameraEnabled && cameraRef);
  return <button type="button" className={`participant-card ${participant.isSpeaking ? 'is-speaking' : ''} ${local ? 'is-local' : ''} ${focused ? 'is-focused' : ''}`} onClick={onFocus} title={focused ? 'Participante em foco' : `Focar em ${name}`}>
    <div className="participant-media">{hasVideo ? <VideoTrack trackRef={cameraRef} /> : <div className="participant-avatar-stage"><div className="avatar-halo" /><Avatar name={name} size="xl" status="online" /></div>}<div className="participant-gradient" /></div>
    <div className="participant-card-top"><span className={`connection-dot ${qualityClass}`} title={`Conexão: ${qualityLabel(quality)}`}><span /><span /><span /><span /></span>{focused && <Badge tone="purple">Foco</Badge>}</div>
    <div className="participant-card-bottom"><div className="participant-name-wrap"><span className="participant-name">{name}{local ? ' • você' : ''}</span><span className="participant-role">{role === 'admin' ? 'Administrador' : role === 'convidado' ? 'Convidado' : 'Membro'}</span></div><div className="participant-actions"><span className={participant.isMicrophoneEnabled ? 'card-action enabled' : 'card-action muted'}><Icon name={participant.isMicrophoneEnabled ? 'mic' : 'close'} size={13} /></span>{participant.isSpeaking && <span className="speaking-label">Falando agora</span>}</div></div>
  </button>;
}

function CallControls({ focusMode, setFocusMode, moreOpen, setMoreOpen }) {
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const camera = useTrackToggle({ source: Track.Source.Camera });
  const screen = useTrackToggle({ source: Track.Source.ScreenShare });
  const room = useRoomContext();

  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key.toLowerCase() === 'm') document.querySelector('[data-call-action="mic"]')?.click();
      if (event.key.toLowerCase() === 'c') document.querySelector('[data-call-action="camera"]')?.click();
      if (event.key.toLowerCase() === 's') document.querySelector('[data-call-action="screen"]')?.click();
      if (event.key.toLowerCase() === 'f') setFocusMode((value) => !value);
      if (event.key === 'Escape') room?.disconnect();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [room, setFocusMode]);

  const action = (control, label, icon, key) => <button type="button" data-call-action={key} {...control.buttonProps} className={`call-control ${control.enabled ? 'enabled' : 'is-off'} ${control.pending ? 'pending' : ''}`} title={label}>{control.enabled ? <Icon name={icon} size={19} /> : <span className="control-off-mark"><Icon name="close" size={17} /></span>}<span className="control-label">{label}</span></button>;

  return <>
    <div className="call-toolbar">
      {action(mic, mic.enabled ? 'Microfone' : 'Ativar microfone', 'mic', 'mic')}
      {action(camera, camera.enabled ? 'Câmera' : 'Ativar câmera', 'camera', 'camera')}
      {action(screen, screen.enabled ? 'Parar tela' : 'Compartilhar tela', 'monitor', 'screen')}
      <button type="button" className={`call-control focus-control ${focusMode ? 'selected' : ''}`} onClick={() => setFocusMode((value) => !value)} title={focusMode ? 'Sair do modo foco' : 'Modo foco (F)'}><Icon name="maximize" size={18} /><span className="control-label">Foco</span></button>
      <div className="device-menu-wrap"><button type="button" className={`call-control ${moreOpen ? 'selected' : ''}`} onClick={() => setMoreOpen((value) => !value)} title="Mais opções"><Icon name="settings" size={18} /><span className="control-label">Mais</span></button>{moreOpen && <div className="call-more-menu"><div className="more-menu-title">Dispositivos</div><MediaDeviceMenu kind="audioinput" className="device-menu-item"><Icon name="mic" size={15} /> Microfone</MediaDeviceMenu><MediaDeviceMenu kind="videoinput" className="device-menu-item"><Icon name="camera" size={15} /> Câmera</MediaDeviceMenu><div className="more-menu-divider" /><div className="more-menu-status">Selecione outro microfone ou câmera sem sair da chamada.</div></div>}</div>
      <button type="button" className="call-control call-exit" title="Sair da call" onClick={() => room?.disconnect()}><Icon name="phone" size={19} /><span className="control-label">Sair</span></button>
    </div>
  </>;
}

function CallEndedScreen({ channel, user, duration, onBack }) {
  return <div className="call-ended-shell"><div className="call-ended-card"><div className="call-ended-icon"><Icon name="phone" size={24} /></div><span className="call-lobby-kicker">Chamada encerrada</span><h2>Você saiu de <span>#{channel.name}</span></h2><p>Obrigado por usar o CPX Call, {user.username}.</p><div className="call-summary-grid"><div><strong>{formatDuration(duration)}</strong><span>Duração</span></div><div><strong>CPX</strong><span>Servidor de voz</span></div><div><strong>✓</strong><span>Sessão finalizada</span></div></div><button className="primary-btn lobby-join" onClick={onBack}><Icon name="phone" size={17} /> Voltar ao servidor</button></div></div>;
}
