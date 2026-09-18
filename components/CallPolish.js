'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionQuality, RoomEvent, Track } from 'livekit-client';
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
import styles from './CallPolish.module.css';

const REACTION_TOPIC = 'cpx-reaction';
const REACTIONS = ['👍', '❤️', '😂', '👏', '🔥', '🎉'];

function displayName(participant) {
  return participant?.name || participant?.identity?.replace(/^guest:/, '') || 'Participante';
}

function participantRole(participant) {
  try { return JSON.parse(participant?.metadata || '{}').role || 'membro'; } catch { return 'membro'; }
}

function roleLabel(role) {
  return role === 'admin' ? 'Administrador' : role === 'convidado' ? 'Convidado' : 'Membro';
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

function useLobbyPreview({ audio, video, audioDevice, cameraDevice, onDevices, onError }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const levelTimerRef = useRef(null);
  const [micLevel, setMicLevel] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function startPreview() {
      if (!navigator.mediaDevices?.getUserMedia) {
        onError?.('Seu navegador não oferece acesso aos dispositivos de mídia.');
        return;
      }

      try {
        const constraints = {
          audio: audio ? {
            ...(audioDevice ? { deviceId: { ideal: audioDevice } } : {}),
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          } : false,
          video: video ? {
            ...(cameraDevice ? { deviceId: { ideal: cameraDevice } } : {}),
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          } : false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        const devices = await navigator.mediaDevices.enumerateDevices();
        onDevices?.({
          audio: devices.filter((device) => device.kind === 'audioinput'),
          video: devices.filter((device) => device.kind === 'videoinput'),
        });

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack && window.AudioContext) {
          const context = new window.AudioContext();
          const analyser = context.createAnalyser();
          analyser.fftSize = 128;
          const source = context.createMediaStreamSource(stream);
          source.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          audioContextRef.current = context;
          analyserRef.current = analyser;
          levelTimerRef.current = window.setInterval(() => {
            analyser.getByteTimeDomainData(data);
            let total = 0;
            for (let i = 0; i < data.length; i += 1) {
              const delta = (data[i] - 128) / 128;
              total += delta * delta;
            }
            setMicLevel(Math.min(100, Math.round(Math.sqrt(total / data.length) * 170)));
          }, 90);
        }
      } catch (error) {
        setMicLevel(0);
        onError?.(error?.name === 'NotAllowedError' ? 'Permissão para câmera/microfone negada.' : error?.message || 'Não foi possível acessar os dispositivos.');
      }
    }

    startPreview();
    return () => {
      cancelled = true;
      if (levelTimerRef.current) window.clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
      analyserRef.current = null;
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [audio, video, audioDevice, cameraDevice, onDevices, onError]);

  return { videoRef, micLevel };
}

export function CallExperience({ token, serverUrl, channel, user, rightTab, rightPanelOpen = true, onRightTab, messages, messageText, setMessageText, onSendMessage, onToast, onDisconnect, onModerate, participantFilter = '' }) {
  const [ready, setReady] = useState(false);
  const [joinAudio, setJoinAudio] = useState(true);
  const [joinVideo, setJoinVideo] = useState(false);
  const [audioDevice, setAudioDevice] = useState('');
  const [cameraDevice, setCameraDevice] = useState('');
  const [endedSummary, setEndedSummary] = useState(null);
  const startedAtRef = useRef(null);
  const finishTimerRef = useRef(null);

  const roomOptions = useMemo(() => ({
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: audioDevice ? { deviceId: audioDevice } : undefined,
    videoCaptureDefaults: cameraDevice ? { deviceId: cameraDevice } : undefined,
  }), [audioDevice, cameraDevice]);

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
    return <CallLobby
      channel={channel}
      user={user}
      audio={joinAudio}
      video={joinVideo}
      setAudio={setJoinAudio}
      setVideo={setJoinVideo}
      audioDevice={audioDevice}
      setAudioDevice={setAudioDevice}
      cameraDevice={cameraDevice}
      setCameraDevice={setCameraDevice}
      onCancel={() => onDisconnect?.()}
      onJoin={() => setReady(true)}
    />;
  }

  return <div className={styles.root}>
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      audio={joinAudio}
      video={joinVideo}
      options={roomOptions}
      onConnected={handleConnected}
      onDisconnected={handleDisconnected}
      onError={(error) => onToast?.({ type: 'error', title: 'Falha na chamada', message: error?.message || 'A conexão foi interrompida.' })}
      onMediaDeviceFailure={(failure) => onToast?.({ type: 'error', title: 'Dispositivo indisponível', message: failure?.message || 'Verifique sua câmera ou microfone.' })}
    >
      <RoomAudioRenderer />
      <ConnectedCall
        channel={channel}
        user={user}
        rightTab={rightTab}
        rightPanelOpen={rightPanelOpen}
        onRightTab={onRightTab}
        onCloseRight={() => onRightTab('participants', false)}
        messages={messages}
        messageText={messageText}
        setMessageText={setMessageText}
        onSendMessage={onSendMessage}
        onToast={onToast}
        onModerate={onModerate}
        participantFilter={participantFilter}
        theme={theme}
      />
      <StartMediaButton label="Ativar áudio" className={styles.startMedia} />
    </LiveKitRoom>
  </div>;
}

function CallLobby({ channel, user, audio, video, setAudio, setVideo, audioDevice, setAudioDevice, cameraDevice, setCameraDevice, onCancel, onJoin }) {
  const [devices, setDevices] = useState({ audio: [], video: [] });
  const [previewError, setPreviewError] = useState('');
  const { videoRef, micLevel } = useLobbyPreview({
    audio,
    video,
    audioDevice,
    cameraDevice,
    onDevices: setDevices,
    onError: setPreviewError,
  });

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then((items) => {
      setDevices({
        audio: items.filter((device) => device.kind === 'audioinput'),
        video: items.filter((device) => device.kind === 'videoinput'),
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!audioDevice && devices.audio[0]?.deviceId) setAudioDevice(devices.audio[0].deviceId);
  }, [audioDevice, devices.audio, setAudioDevice]);

  useEffect(() => {
    if (!cameraDevice && devices.video[0]?.deviceId) setCameraDevice(devices.video[0].deviceId);
  }, [cameraDevice, devices.video, setCameraDevice]);

  return <div className={styles.lobbyShell}>
    <div className={styles.lobbyGlow} />
    <div className={styles.lobbyCard}>
      <div className={styles.brand}><span className={styles.logo} aria-hidden="true" /><span>CALL</span></div>
      <div className={styles.kicker}>Preparar chamada</div>
      <h2>Entrar em <span>#{channel.name}</span></h2>
      <p>Confira câmera e microfone antes de entrar. Você poderá alterar os dispositivos durante a chamada.</p>

      <div className={styles.previewBox}>
        {video ? <>
          <video ref={videoRef} autoPlay muted playsInline className={styles.previewVideo} />
          <div className={styles.previewGradient} />
          <div className={styles.previewName}><Avatar name={user.username} size="sm" status="online" /><div><strong>{user.username}</strong><span>{roleLabel(user.role)}</span></div></div>
          <span className={styles.previewLive}>PRÉVIA</span>
        </> : <div className={styles.avatarPreview}><div className={styles.avatarGlow} /><Avatar name={user.username} size="xl" status="online" /><strong>{user.username}</strong><span>{roleLabel(user.role)}</span></div>}
      </div>

      <div className={styles.deviceGrid}>
        <button type="button" className={`${styles.deviceChoice} ${audio ? styles.active : ''}`} onClick={() => setAudio(!audio)}>
          <span className={styles.choiceIcon}><Icon name="mic" /></span>
          <span className={styles.choiceCopy}><b>{audio ? 'Microfone ligado' : 'Microfone desligado'}</b><small>{devices.audio.length || 'Nenhum'} dispositivo{devices.audio.length === 1 ? '' : 's'}</small></span>
          <span className={styles.choiceState}>{audio ? 'ON' : 'OFF'}</span>
        </button>
        <button type="button" className={`${styles.deviceChoice} ${video ? styles.active : ''}`} onClick={() => setVideo(!video)}>
          <span className={styles.choiceIcon}><Icon name="camera" /></span>
          <span className={styles.choiceCopy}><b>{video ? 'Câmera ligada' : 'Câmera desligada'}</b><small>{devices.video.length || 'Nenhum'} dispositivo{devices.video.length === 1 ? '' : 's'}</small></span>
          <span className={styles.choiceState}>{video ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      <div className={styles.deviceSelectGrid}>
        <label><span>Microfone</span><select value={audioDevice} onChange={(event) => setAudioDevice(event.target.value)} disabled={!devices.audio.length}><option value="">Automático</option>{devices.audio.map((device, index) => <option key={device.deviceId || `audio-${index}`} value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>)}</select></label>
        <label><span>Câmera</span><select value={cameraDevice} onChange={(event) => setCameraDevice(event.target.value)} disabled={!devices.video.length}><option value="">Automática</option>{devices.video.map((device, index) => <option key={device.deviceId || `video-${index}`} value={device.deviceId}>{device.label || `Câmera ${index + 1}`}</option>)}</select></label>
      </div>

      {audio && <div className={styles.micMeter}><div><span>Teste do microfone</span><b>{micLevel > 8 ? 'Detectando áudio' : 'Fale para testar'}</b></div><div className={styles.meterTrack}>{Array.from({ length: 16 }, (_, index) => <i key={index} className={index < Math.ceil(micLevel / 7) ? styles.meterActive : ''} />)}</div></div>}
      {previewError && <div className={styles.previewError}><Icon name="warning" size={14} /> {previewError}</div>}

      <div className={styles.lobbyActions}><button className="ghost-btn" type="button" onClick={onCancel}>Voltar</button><button className="primary-btn" type="button" onClick={onJoin}><Icon name="phone" size={17} /> Entrar na chamada</button></div>
      <div className={styles.lobbyTip}><Icon name="shield" size={13} /> Conexão protegida pelo CPX Call</div>
    </div>
  </div>;
}

function ConnectedCall({ channel, user, rightTab, rightPanelOpen, onRightTab, onCloseRight, messages, messageText, setMessageText, onSendMessage, onToast, onModerate, participantFilter, theme }) {
  const participants = useParticipants();
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const screenTracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const { quality } = useConnectionQualityIndicator();
  const [chatSearch, setChatSearch] = useState('');
  const [focusedIdentity, setFocusedIdentity] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [reactions, setReactions] = useState([]);
  const previous = useRef(new Set());
  const mounted = useRef(false);
  const wasReconnecting = useRef(false);

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

  useEffect(() => {
    if (focusedIdentity && !participants.some((participant) => participant.identity === focusedIdentity)) setFocusedIdentity(null);
  }, [focusedIdentity, participants]);

  useEffect(() => {
    const state = String(connectionState || '').toLowerCase();
    if (state.includes('reconnecting')) {
      wasReconnecting.current = true;
    } else if (wasReconnecting.current && state.includes('connected')) {
      wasReconnecting.current = false;
      onToast?.({ type: 'success', title: 'Conexão restaurada', message: 'A chamada voltou a ficar estável.' });
    }
  }, [connectionState, onToast]);

  useEffect(() => {
    function onData(payload, participant, kind, topic) {
      if (topic !== REACTION_TOPIC || !participant) return;
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (!REACTIONS.includes(data.emoji)) return;
        addReaction(data.emoji, participant);
      } catch {}
    }
    room.on(RoomEvent.DataReceived, onData);
    return () => room.off(RoomEvent.DataReceived, onData);
  }, [room]);

  function addReaction(emoji, participant) {
    const item = { id: `${Date.now()}-${Math.random()}`, emoji, identity: participant?.identity || localParticipant?.identity || 'local' };
    setReactions((current) => [...current.slice(-12), item]);
    window.setTimeout(() => setReactions((current) => current.filter((entry) => entry.id !== item.id)), 2500);
  }

  async function sendReaction(emoji) {
    addReaction(emoji, localParticipant);
    try {
      const payload = new TextEncoder().encode(JSON.stringify({ emoji }));
      await localParticipant.publishData(payload, { reliable: false, topic: REACTION_TOPIC });
    } catch (error) {
      onToast?.({ type: 'error', title: 'Reação', message: error?.message || 'Não foi possível enviar a reação.' });
    }
  }

  const sorted = useMemo(() => [...participants].sort((a, b) => {
    if (a.isSpeaking !== b.isSpeaking) return a.isSpeaking ? -1 : 1;
    if (a.identity === localParticipant?.identity) return -1;
    if (b.identity === localParticipant?.identity) return 1;
    return displayName(a).localeCompare(displayName(b));
  }), [participants, localParticipant?.identity]);

  const filtered = participantFilter.trim() ? sorted.filter((participant) => displayName(participant).toLowerCase().includes(participantFilter.toLowerCase())) : sorted;
  const filteredMessages = chatSearch.trim() ? messages.filter((message) => `${message.sender_name} ${message.content}`.toLowerCase().includes(chatSearch.toLowerCase())) : messages;
  const speakingParticipant = participants.find((participant) => participant.isSpeaking) || localParticipant;
  const spotlight = filtered.find((participant) => participant.identity === focusedIdentity) || filtered.find((participant) => participant.identity === speakingParticipant?.identity) || filtered[0];
  const railParticipants = spotlight ? filtered.filter((participant) => participant.identity !== spotlight.identity) : [];
  const connectionText = String(connectionState || '').toLowerCase().includes('reconnecting') ? 'Reconectando...' : String(connectionState || '').toLowerCase().includes('connected') ? 'Conectado' : 'Conectando...';
  const connectionTone = connectionText.includes('Recon') ? 'poor' : connectionText === 'Conectado' ? 'excellent' : 'unknown';
  const cameraRefFor = (participant) => cameraTracks.find((trackRef) => trackRef.participant.identity === participant.identity && trackRef.publication?.track);
  const screenAvailable = screenTracks.filter((trackRef) => trackRef.publication?.track);

  function focusParticipant(participant) {
    setFocusedIdentity((current) => current === participant.identity ? null : participant.identity);
  }

  return <div className={styles.connected}>
    <section className={styles.callArea}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}><div className={styles.channelIcon}><Icon name="phone" size={17} /></div><div><strong>#{channel.name}</strong><span>{participants.length} {participants.length === 1 ? 'pessoa' : 'pessoas'} na chamada</span></div></div>
        <div className={styles.topbarCenter}><span className={styles.livePill}><i /> Ao vivo</span><span className={styles.duration}>{formatDuration(elapsed)}</span></div>
        <div className={styles.topbarRight}>
          <div className={styles.qualityWrap}><button className={`${styles.qualityPill} ${styles[`quality_${qualityTone(quality)}`]}`} onClick={() => setQualityOpen((value) => !value)}><span className={styles.qualityBars}><i /><i /><i /><i /></span><span>{qualityLabel(quality)}</span></button>{qualityOpen && <div className={styles.popover}><div className={styles.popoverTitle}>Conexão</div><div className={styles.qualityMain}><span className={`${styles.qualityOrb} ${styles[`quality_${qualityTone(quality)}`]}`}><Icon name="wifi" size={18} /></span><div><strong>{qualityLabel(quality)}</strong><span>Qualidade da sua conexão</span></div></div><div className={styles.qualityRow}><span>Status</span><b>{connectionText}</b></div><div className={styles.qualityRow}><span>Participantes</span><b>{participants.length}</b></div><div className={styles.qualityRow}><span>Transporte</span><b>LiveKit</b></div></div>}</div>
          <button className="icon-btn" onClick={() => onRightTab('chat', true)} title="Abrir chat"><Icon name="chat" size={17} /></button>
        </div>
      </header>

      <div className={styles.stage}>
        {screenAvailable.length > 0 ? <div className={styles.screenStage}>{screenAvailable.map((trackRef) => <div className={styles.screenCard} key={trackRef.publication?.trackSid || trackRef.participant.identity}><VideoTrack trackRef={trackRef} /><div className={styles.screenLabel}><Icon name="monitor" size={12} /> {displayName(trackRef.participant)} está compartilhando a tela</div></div>)}</div> : spotlight ? <div className={`${styles.smartStage} ${focusMode ? styles.focusEnabled : ''}`}>
          <div className={styles.spotlight}><ParticipantCard participant={spotlight} name={displayName(spotlight)} local={spotlight.identity === localParticipant?.identity} role={participantRole(spotlight)} cameraRef={cameraRefFor(spotlight)} focused={focusMode} onFocus={() => focusParticipant(spotlight)} /></div>
          <div className={styles.rail}>{railParticipants.map((participant) => <ParticipantCard key={participant.identity} compact participant={participant} name={displayName(participant)} local={participant.identity === localParticipant?.identity} role={participantRole(participant)} cameraRef={cameraRefFor(participant)} focused={false} onFocus={() => focusParticipant(participant)} />)}</div>
        </div> : <EmptyState icon="users" title="Você está sozinho" description="Aguarde alguém entrar ou compartilhe o convite da sala." />}

        <div className={styles.stageInfo}><span className={`${styles.connectionDot} ${styles[`quality_${connectionTone}`]}`}><i /><i /><i /><i /></span><span>{connectionText}</span></div>
        <div className={styles.reactionLayer}>{reactions.map((reaction, index) => <div key={reaction.id} className={styles.reactionBubble} style={{ left: `${10 + ((index * 17) % 78)}%`, animationDelay: `${(index % 3) * 90}ms` }}>{reaction.emoji}<small>{displayName(participants.find((participant) => participant.identity === reaction.identity) || (reaction.identity === localParticipant?.identity ? localParticipant : null))}</small></div>)}</div>
        <div className={styles.shortcuts}><span><kbd>M</kbd> microfone</span><span><kbd>C</kbd> câmera</span><span><kbd>S</kbd> tela</span><span><kbd>F</kbd> foco</span><span><kbd>Esc</kbd> sair</span></div>
      </div>

      {String(connectionState || '').toLowerCase().includes('reconnecting') && <div className={styles.reconnectOverlay}><div className={styles.reconnectCard}><div className={styles.reconnectIcon}><Icon name="wifi" size={20} /></div><strong>Reconectando...</strong><span>Estamos tentando restaurar sua conexão.</span><div className={styles.loaderLine}><i /></div></div></div>}

      <div className={styles.toolbarWrap}><CallControls focusMode={focusMode} setFocusMode={setFocusMode} moreOpen={moreOpen} setMoreOpen={setMoreOpen} reactionsOpen={reactionsOpen} setReactionsOpen={setReactionsOpen} onReaction={sendReaction} /></div>
    </section>

    <aside className={`${styles.panel} ${rightPanelOpen ? styles.panelOpen : ''}`}>
      <div className={styles.panelTabs}><button className={rightTab === 'participants' ? styles.activeTab : ''} onClick={() => onRightTab('participants', true)}>Pessoas <span>{participants.length}</span></button><button className={rightTab === 'chat' ? styles.activeTab : ''} onClick={() => onRightTab('chat', true)}>Chat{messages.length > 0 && <i />}</button><button className="icon-btn mobile-only" onClick={onCloseRight} aria-label="Fechar painel"><Icon name="close" size={16} /></button></div>
      {rightTab === 'participants' ? <div className={styles.panelScroll}><div className={styles.panelTitle}>NESTA CALL</div>{filtered.length ? filtered.map((participant) => {
        const name = displayName(participant); const local = participant.identity === localParticipant?.identity; const role = participantRole(participant);
        return <div key={participant.identity} className={`${styles.participantRow} ${participant.isSpeaking ? styles.speakingRow : ''}`}><Avatar name={name} size="sm" status="online" /><div className={styles.participantInfo}><strong>{name}{local ? ' (você)' : ''}</strong><span><i />{roleLabel(role)}{participant.isSpeaking ? ' • falando agora' : ''}</span></div><div className={styles.participantTools}><span title="Microfone" className={participant.isMicrophoneEnabled ? styles.mediaOn : styles.mediaOff}><Icon name={participant.isMicrophoneEnabled ? 'mic' : 'close'} size={12} /></span><span title="Câmera" className={participant.isCameraEnabled ? styles.mediaOn : styles.mediaOff}><Icon name={participant.isCameraEnabled ? 'camera' : 'close'} size={12} /></span>{!local && user.role === 'admin' && <><button className="icon-btn" title={participant.isMicrophoneEnabled ? 'Silenciar microfone' : 'Microfone indisponível'} disabled={!participant.isMicrophoneEnabled} onClick={() => onModerate?.(channel.name, participant.identity, 'mute')}><Icon name="mic" size={13} /></button><button className="icon-btn" title="Desconectar" onClick={() => onModerate?.(channel.name, participant.identity, 'disconnect')}><Icon name="logout" size={13} /></button></>}</div></div>;
      }) : <EmptyState icon="users" title="Ninguém encontrado" description="Tente outro nome na pesquisa." />}</div> : <div className={styles.chatWrap}><div className={styles.chatSearch}><div className="search-box" style={{ width: '100%' }}><Icon name="search" size={15} /><input className="input" value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Pesquisar mensagens..." /></div></div><div className={styles.chatList}>{filteredMessages.length ? filteredMessages.map((message) => <div className={styles.chatMessage} key={message.id}><Avatar name={message.sender_name} size="sm" /><div className={styles.chatBody}><div><strong>{message.sender_name}</strong><span>{new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div><p>{message.content}</p></div></div>) : <EmptyState icon="chat" title={chatSearch ? 'Nenhuma mensagem encontrada' : 'Sem mensagens ainda'} description={chatSearch ? 'Tente outro termo.' : 'Comece a conversa com o pessoal desta call.'} />}</div><form className={styles.composer} onSubmit={onSendMessage}><input className="input" maxLength={500} value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Escreva uma mensagem..." aria-label="Mensagem" /><button className="primary-btn" disabled={!messageText.trim()} aria-label="Enviar"><Icon name="chat" size={16} /></button></form></div>}
    </aside>
  </div>;
}

function ParticipantCard({ participant, name, local, role, cameraRef, focused, onFocus, compact = false }) {
  const { quality } = useConnectionQualityIndicator({ participant });
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [volume, setVolume] = useState(() => Math.round((participant.getVolume?.() ?? 1) * 100));
  const hasVideo = Boolean(participant.isCameraEnabled && cameraRef?.publication?.track);

  function changeVolume(event) {
    const next = Number(event.target.value);
    setVolume(next);
    participant.setVolume?.(next / 100);
  }

  function onCardKeyDown(event) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onFocus?.();
    }
  }

  return <div className={`${styles.card} ${participant.isSpeaking ? styles.speaking : ''} ${local ? styles.local : ''} ${focused ? styles.focused : ''} ${compact ? styles.compact : ''}`} role="button" tabIndex={0} onClick={onFocus} onKeyDown={onCardKeyDown} title={focused ? 'Participante em foco' : `Focar em ${name}`}>
    <div className={styles.cardMedia}>{hasVideo ? <VideoTrack trackRef={cameraRef} /> : <div className={styles.cardAvatar}><div className={styles.avatarHalo} /><Avatar name={name} size={compact ? 'md' : 'xl'} status="online" /></div>}<div className={styles.cardGradient} /></div>
    <div className={styles.cardTop}><span className={`${styles.signal} ${styles[`quality_${qualityTone(quality)}`]}`}><i /><i /><i /><i /></span>{focused && <Badge tone="purple">Foco</Badge>}</div>
    <div className={styles.cardBottom}><div className={styles.nameWrap}><span>{name}{local ? ' • você' : ''}</span><small>{roleLabel(role)}</small></div><div className={styles.cardActions}><span className={participant.isMicrophoneEnabled ? styles.micOn : styles.micOff}><Icon name={participant.isMicrophoneEnabled ? 'mic' : 'close'} size={13} /></span>{participant.isSpeaking && <span className={styles.speakingLabel}>Falando</span>}<button type="button" className={styles.cardTool} title="Volume individual" onClick={(event) => { event.stopPropagation(); setVolumeOpen((value) => !value); }}>🔊</button></div></div>
    {volumeOpen && <div className={styles.volumePopup} onClick={(event) => event.stopPropagation()}><div><span>Volume de {name}</span><b>{volume}%</b></div><input type="range" min="0" max="150" step="1" value={volume} onChange={changeVolume} aria-label={`Volume de ${name}`} /><div className={styles.volumeScale}><span>0%</span><span>100%</span><span>150%</span></div></div>}
  </div>;
}

function CallControls({ focusMode, setFocusMode, moreOpen, setMoreOpen, reactionsOpen, setReactionsOpen, onReaction }) {
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const camera = useTrackToggle({ source: Track.Source.Camera });
  const screen = useTrackToggle({ source: Track.Source.ScreenShare });
  const room = useRoomContext();

  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key.toLowerCase() === 'm') mic.buttonProps.onClick?.(event);
      if (event.key.toLowerCase() === 'c') camera.buttonProps.onClick?.(event);
      if (event.key.toLowerCase() === 's') screen.buttonProps.onClick?.(event);
      if (event.key.toLowerCase() === 'f') setFocusMode((value) => !value);
      if (event.key === 'Escape') room?.disconnect();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mic.buttonProps, camera.buttonProps, screen.buttonProps, room, setFocusMode]);

  function action(control, label, icon, key) {
    const props = { ...control.buttonProps };
    return <button type="button" data-call-action={key} {...props} className={`${styles.control} ${control.enabled ? styles.controlEnabled : styles.controlOff} ${control.pending ? styles.controlPending : ''}`} title={label}>{control.enabled ? <Icon name={icon} size={19} /> : <Icon name="close" size={17} />}<span>{label}</span></button>;
  }

  return <div className={styles.toolbar}>
    {action(mic, mic.enabled ? 'Microfone' : 'Ativar mic', 'mic', 'mic')}
    {action(camera, camera.enabled ? 'Câmera' : 'Ativar câmera', 'camera', 'camera')}
    {action(screen, screen.enabled ? 'Parar tela' : 'Compartilhar', 'monitor', 'screen')}
    <div className={styles.menuWrap}><button type="button" className={`${styles.control} ${moreOpen ? styles.controlSelected : ''}`} onClick={() => setMoreOpen((value) => !value)} title="Dispositivos"><Icon name="settings" size={18} /><span>Mais</span></button>{moreOpen && <div className={styles.moreMenu}><div className={styles.menuTitle}>Dispositivos e opções</div><MediaDeviceMenu kind="audioinput" className={styles.deviceItem}><Icon name="mic" size={15} /> Microfone</MediaDeviceMenu><MediaDeviceMenu kind="videoinput" className={styles.deviceItem}><Icon name="camera" size={15} /> Câmera</MediaDeviceMenu><div className={styles.menuDivider} /><div className={styles.menuHint}>Você pode trocar os dispositivos sem sair da chamada.</div></div>}</div>
    <div className={styles.menuWrap}><button type="button" className={`${styles.control} ${reactionsOpen ? styles.controlSelected : ''}`} onClick={() => setReactionsOpen((value) => !value)} title="Reações">☺<span>Reagir</span></button>{reactionsOpen && <div className={styles.reactionMenu}>{REACTIONS.map((emoji) => <button key={emoji} type="button" onClick={() => { onReaction(emoji); setReactionsOpen(false); }}>{emoji}</button>)}</div>}</div>
    <button type="button" className={`${styles.control} ${focusMode ? styles.controlSelected : ''}`} onClick={() => setFocusMode((value) => !value)} title="Modo foco"><Icon name="maximize" size={18} /><span>Foco</span></button>
    <button type="button" className={`${styles.control} ${styles.exit}`} title="Sair da call" onClick={() => room?.disconnect()}><Icon name="phone" size={19} /><span>Sair</span></button>
  </div>;
}

function CallEndedScreen({ channel, user, duration, onBack }) {
  return <div className={styles.endedShell}><div className={styles.endedCard}><div className={styles.endedIcon}><Icon name="phone" size={23} /></div><span className={styles.kicker}>Chamada encerrada</span><h2>Você saiu de <span>#{channel.name}</span></h2><p>Até a próxima, {user.username}.</p><div className={styles.summary}><div><strong>{formatDuration(duration)}</strong><span>Duração</span></div><div><strong>{user.username}</strong><span>Participante</span></div><div><strong>✓</strong><span>Sessão finalizada</span></div></div><button className="primary-btn" onClick={onBack}><Icon name="phone" size={17} /> Voltar ao servidor</button></div></div>;
}
