'use client';

import { useEffect, useRef } from 'react';
import { Track } from 'livekit-client';
import { DisconnectButton, LiveKitRoom, MediaDeviceMenu, StartMediaButton, TrackToggle, useConnectionState, useLocalParticipant, useParticipants } from '@livekit/components-react';
import { Icon, Avatar, Badge, EmptyState } from './ui';

function displayName(participant) {
  return participant.name || participant.identity?.replace(/^guest:/, '') || 'Participante';
}

function participantRole(participant) {
  try { return JSON.parse(participant.metadata || '{}').role || 'membro'; } catch { return 'membro'; }
}

export function RoomExperience({ token, serverUrl, channel, user, rightTab, onRightTab, messages, messageText, setMessageText, onSendMessage, onToast, onDisconnect, onModerate, participantFilter = '', theme = 'cpx' }) {
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const previous = useRef(new Set());
  const mounted = useRef(false);

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

  const sorted = [...participants].sort((a, b) => (a.identity === localParticipant?.identity ? -1 : b.identity === localParticipant?.identity ? 1 : displayName(a).localeCompare(displayName(b))));
  const filtered = participantFilter.trim() ? sorted.filter((participant) => displayName(participant).toLowerCase().includes(participantFilter.toLowerCase())) : sorted;
  const stateLabel = String(connectionState || '').toLowerCase();
  const connectionLabel = stateLabel.includes('connected') ? 'Conexão excelente' : stateLabel.includes('reconnecting') ? 'Reconectando...' : 'Conectando...';
  const connectionTone = stateLabel.includes('connected') ? 'green' : stateLabel.includes('reconnecting') ? 'yellow' : 'neutral';

  return (
    <div className="main-content">
      <section className="call-area">
        <div className={`call-stage cpx-video-conf ${theme}`}>
          <LiveKitRoom token={token} serverUrl={serverUrl} connect audio video={false} onDisconnected={onDisconnect} onError={(error) => onToast?.({ type: 'error', title: 'Falha na chamada', message: error?.message || 'A conexão foi interrompida.' })}>
            <VideoSurface channel={channel} user={user} connectionLabel={connectionLabel} connectionTone={connectionTone} onToast={onToast} onDisconnect={onDisconnect} />
            <StartMediaButton label="Ativar áudio" className="secondary-btn" />
          </LiveKitRoom>
        </div>
      </section>

      <aside className="right-panel open">
        <div className="right-tabs">
          <button className={`right-tab ${rightTab === 'participants' ? 'active' : ''}`} onClick={() => onRightTab('participants')}>Pessoas <span className="channel-count">{participants.length}</span></button>
          <button className={`right-tab ${rightTab === 'chat' ? 'active' : ''}`} onClick={() => onRightTab('chat')}>Chat</button>
        </div>
        {rightTab === 'participants' ? (
          <div className="panel-scroll">
            <div className="panel-title">NESTA CALL • {participants.length}</div>
            {filtered.length ? filtered.map((participant) => {
              const name = displayName(participant);
              const local = participant.identity === localParticipant?.identity;
              const role = participantRole(participant);
              const mic = participant.isMicrophoneEnabled;
              const cam = participant.isCameraEnabled;
              return <div key={participant.identity} className="participant-row">
                <Avatar name={name} size="sm" status="online" />
                <div className="participant-info"><strong>{name}{local ? ' (você)' : ''}</strong><span><i className="presence-dot" />{role === 'admin' ? 'Administrador' : role === 'convidado' ? 'Convidado' : 'Membro'}{participant.isSpeaking ? ' • falando' : ''}</span></div>
                <div className="participant-tools"><Icon name={mic ? 'mic' : 'close'} size={13} /><span style={{ width: 2 }} /><Icon name={cam ? 'camera' : 'close'} size={13} />{!local && user.role === 'admin' && <button className="icon-btn" title="Desconectar" onClick={() => onModerate?.(channel.name, participant.identity, 'disconnect')}><Icon name="logout" size={13} /></button>}</div>
              </div>;
            }) : <EmptyState icon="users" title="Ninguém encontrado" description="Tente outro nome na pesquisa." />}
          </div>
        ) : (
          <div className="chat-wrap">
            <div className="chat-list">{messages.length ? messages.map((message) => <div className="chat-message" key={message.id}><Avatar name={message.sender_name} size="sm" /><div className="chat-body"><div className="chat-meta"><strong>{message.sender_name}</strong>{new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div><div className="chat-text">{message.content}</div></div></div>) : <EmptyState icon="chat" title="Sem mensagens ainda" description="Comece a conversa com o pessoal desta call." />}</div>
            <form className="chat-composer" onSubmit={onSendMessage}><input className="input" maxLength={500} value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Escreva uma mensagem..." aria-label="Mensagem" /><button className="primary-btn" disabled={!messageText.trim()} aria-label="Enviar"><Icon name="chat" size={16} /></button></form>
          </div>
        )}
      </aside>
    </div>
  );
}

function VideoSurface({ channel, user, connectionLabel, connectionTone, onToast, onDisconnect }) {
  const mic = useTrack(Track.Source.Microphone);
  const camera = useTrack(Track.Source.Camera);
  const screen = useTrack(Track.Source.ScreenShare);
  const { localParticipant } = useLocalParticipant();
  const disconnect = useDisconnect();
  useKeyboardShortcuts(mic, camera, screen, disconnect);

  return <>
    <div style={{ position: 'absolute', inset: 0 }}><VideoConference /></div>
    <div className="call-status-chip"><span className={`presence-dot ${connectionTone === 'yellow' ? 'away' : ''}`} />{connectionLabel}</div>
    <div className="call-room-chip"><span>#</span>{channel.name}<small>{user.username}</small></div>
    <div className="call-toolbar">
      <TrackToggle source={Track.Source.Microphone} showIcon={false} {...mic.buttonProps} className={`call-control ${mic.enabled ? '' : 'is-off'}`} title={mic.enabled ? 'Desativar microfone (M)' : 'Ativar microfone (M)'}><Icon name={mic.enabled ? 'mic' : 'close'} /></TrackToggle>
      <TrackToggle source={Track.Source.Camera} showIcon={false} {...camera.buttonProps} className={`call-control ${camera.enabled ? '' : 'is-off'}`} title={camera.enabled ? 'Desativar câmera (C)' : 'Ativar câmera (C)'}><Icon name={camera.enabled ? 'camera' : 'close'} /></TrackToggle>
      <TrackToggle source={Track.Source.ScreenShare} showIcon={false} {...screen.buttonProps} className={`call-control ${screen.enabled ? '' : ''}`} title="Compartilhar tela (S)"><Icon name="monitor" /></TrackToggle>
      <MediaDeviceMenu kind="audioinput" className="call-control" title="Escolher microfone"><Icon name="settings" /></MediaDeviceMenu>
      <DisconnectButton className="call-control call-exit" stopTracks onClick={() => onDisconnect?.()} title="Sair da call"><Icon name="phone" /></DisconnectButton>
    </div>
    <div className="call-hint">Atalhos: <b>M</b> microfone · <b>C</b> câmera · <b>S</b> tela · <b>Esc</b> sair</div>
  </>;
}

function useTrack(source) {
  const { useTrackToggle } = require('@livekit/components-react');
  return useTrackToggle({ source });
}
function useDisconnect() {
  const { useDisconnectButton } = require('@livekit/components-react');
  return useDisconnectButton({ stopTracks: true });
}
function useKeyboardShortcuts(mic, camera, screen, disconnect) {
  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === 'm') mic.toggle();
      if (event.key === 'c') camera.toggle();
      if (event.key === 's') screen.toggle();
      if (event.key === 'Escape') disconnect.buttonProps.onClick?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mic, camera, screen, disconnect]);
}
