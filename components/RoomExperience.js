'use client';

import { useEffect, useRef, useState } from 'react';
import { Track } from 'livekit-client';
import { LiveKitRoom, MediaDeviceMenu, RoomAudioRenderer, StartMediaButton, useConnectionQualityIndicator, useConnectionState, useDisconnectButton, useLocalParticipant, useParticipants, useTrackToggle, VideoConference } from '@livekit/components-react';
import { Icon, Avatar, EmptyState, Badge } from './ui';

function displayName(participant) { return participant.name || participant.identity?.replace(/^guest:/, '') || 'Participante'; }
function participantRole(participant) { try { return JSON.parse(participant.metadata || '{}').role || 'membro'; } catch { return 'membro'; } }

export function RoomExperience({ token, serverUrl, channel, user, rightTab, rightPanelOpen = true, onRightTab, messages, messageText, setMessageText, onSendMessage, onToast, onDisconnect, onModerate, participantFilter = '', theme = 'cpx' }) {
  return <LiveKitRoom token={token} serverUrl={serverUrl} connect audio video={false} onDisconnected={onDisconnect} onError={(error) => onToast?.({ type: 'error', title: 'Falha na chamada', message: error?.message || 'A conexão foi interrompida.' })}>
    <RoomAudioRenderer />
    <RoomConnectedExperience channel={channel} user={user} rightTab={rightTab} rightPanelOpen={rightPanelOpen} onRightTab={onRightTab} onCloseRight={() => onRightTab('participants', false)} messages={messages} messageText={messageText} setMessageText={setMessageText} onSendMessage={onSendMessage} onToast={onToast} onDisconnect={onDisconnect} onModerate={onModerate} participantFilter={participantFilter} theme={theme} />
    <StartMediaButton label="Ativar áudio" className="secondary-btn start-media-button" />
  </LiveKitRoom>;
}

function RoomConnectedExperience({ channel, user, rightTab, rightPanelOpen, onRightTab, onCloseRight, messages, messageText, setMessageText, onSendMessage, onToast, onDisconnect, onModerate, participantFilter, theme }) {
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator();
  const [chatSearch, setChatSearch] = useState('');
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
  const filteredMessages = chatSearch.trim() ? messages.filter((message) => `${message.sender_name} ${message.content}`.toLowerCase().includes(chatSearch.toLowerCase())) : messages;
  const stateLabel = String(connectionState || '').toLowerCase();
  const qualityValue = String(quality || '').toLowerCase();
  const connectionLabel = stateLabel.includes('reconnecting') ? 'Reconectando...' : qualityValue.includes('poor') || qualityValue.includes('lost') ? 'Conexão ruim' : qualityValue.includes('good') ? 'Conexão boa' : stateLabel.includes('connected') ? 'Conexão excelente' : 'Conectando...';
  const connectionTone = connectionLabel.includes('ruim') ? 'red' : connectionLabel.includes('boa') || connectionLabel.includes('Recon') ? 'yellow' : connectionLabel.includes('excelente') ? 'green' : 'neutral';

  return <div className={`room-experience ${theme}`}>
    <section className="call-area">
      <div className="call-stage cpx-video-conf"><VideoConference /></div>
      <div className="call-status-chip"><span className={`presence-dot ${connectionTone === 'yellow' ? 'away' : connectionTone === 'red' ? 'busy' : ''}`} />{connectionLabel}</div>
      <div className="call-room-chip"><span>#</span>{channel.name}<small>{user.username}</small></div>
      <div className="call-mini-stats"><Badge tone="purple">{participants.length} {participants.length === 1 ? 'pessoa' : 'pessoas'}</Badge>{channel.guest_access && <Badge tone="yellow">Convidados</Badge>}</div>
      <CallControls />
      <div className="call-hint">Atalhos: <b>M</b> microfone · <b>C</b> câmera · <b>S</b> tela · <b>Esc</b> sair</div>
    </section>
    <aside className={`right-panel ${rightPanelOpen ? 'open' : ''}`}>
      <div className="right-tabs"><button className={`right-tab ${rightTab === 'participants' ? 'active' : ''}`} onClick={() => onRightTab('participants', true)}>Pessoas <span className="channel-count">{participants.length}</span></button><button className={`right-tab ${rightTab === 'chat' ? 'active' : ''}`} onClick={() => onRightTab('chat', true)}>Chat</button></div>
      <button className="icon-btn mobile-only" onClick={onCloseRight} aria-label="Fechar painel" style={{ position: 'absolute', right: 5, top: 6, zIndex: 4 }}><Icon name="close" size={16} /></button>
      {rightTab === 'participants' ? <div className="panel-scroll"><div className="panel-title">NESTA CALL • {participants.length}</div>{filtered.length ? filtered.map((participant) => {
        const name = displayName(participant); const local = participant.identity === localParticipant?.identity; const role = participantRole(participant); const mic = participant.isMicrophoneEnabled; const cam = participant.isCameraEnabled;
        return <div key={participant.identity} className="participant-row"><Avatar name={name} size="sm" status="online" /><div className="participant-info"><strong>{name}{local ? ' (você)' : ''}</strong><span><i className="presence-dot" />{role === 'admin' ? 'Administrador' : role === 'convidado' ? 'Convidado' : 'Membro'}{participant.isSpeaking ? ' • falando' : ''}</span></div><div className="participant-tools"><Icon name={mic ? 'mic' : 'close'} size={13} /><Icon name={cam ? 'camera' : 'close'} size={13} />{!local && user.role === 'admin' && <><button className="icon-btn" title={mic ? 'Silenciar microfone' : 'Microfone indisponível'} disabled={!mic} onClick={() => onModerate?.(channel.name, participant.identity, 'mute')}><Icon name="mic" size={13} /></button><button className="icon-btn" title="Desconectar" onClick={() => onModerate?.(channel.name, participant.identity, 'disconnect')}><Icon name="logout" size={13} /></button></>}</div></div>;
      }) : <EmptyState icon="users" title="Ninguém encontrado" description="Tente outro nome na pesquisa." />}</div> : <div className="chat-wrap"><div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}><div className="search-box" style={{ width: '100%' }}><Icon name="search" size={15} /><input className="input" value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Pesquisar mensagens..." aria-label="Pesquisar mensagens" /></div></div><div className="chat-list">{filteredMessages.length ? filteredMessages.map((message) => <div className="chat-message" key={message.id}><Avatar name={message.sender_name} size="sm" /><div className="chat-body"><div className="chat-meta"><strong>{message.sender_name}</strong>{new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div><div className="chat-text">{message.content}</div></div></div>) : <EmptyState icon="chat" title={chatSearch ? 'Nenhuma mensagem encontrada' : 'Sem mensagens ainda'} description={chatSearch ? 'Tente outro termo.' : 'Comece a conversa com o pessoal desta call.'} />}</div><form className="chat-composer" onSubmit={onSendMessage}><input className="input" maxLength={500} value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Escreva uma mensagem..." aria-label="Mensagem" /><button className="primary-btn" disabled={!messageText.trim()} aria-label="Enviar"><Icon name="chat" size={16} /></button></form></div>}
    </aside>
  </div>;
}

function CallControls() {
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const camera = useTrackToggle({ source: Track.Source.Camera });
  const screen = useTrackToggle({ source: Track.Source.ScreenShare });
  const disconnect = useDisconnectButton({ stopTracks: true });
  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key.toLowerCase() === 'm') mic.toggle();
      if (event.key.toLowerCase() === 'c') camera.toggle();
      if (event.key.toLowerCase() === 's') screen.toggle();
      if (event.key === 'Escape') disconnect.buttonProps.onClick?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mic, camera, screen, disconnect]);
  return <div className="call-toolbar"><button {...mic.buttonProps} className={`call-control ${mic.enabled ? '' : 'is-off'}`} title={mic.enabled ? 'Desativar microfone (M)' : 'Ativar microfone (M)'}><Icon name={mic.enabled ? 'mic' : 'close'} /></button><button {...camera.buttonProps} className={`call-control ${camera.enabled ? '' : 'is-off'}`} title={camera.enabled ? 'Desativar câmera (C)' : 'Ativar câmera (C)'}><Icon name={camera.enabled ? 'camera' : 'close'} /></button><button {...screen.buttonProps} className="call-control" title="Compartilhar tela (S)"><Icon name="monitor" /></button><MediaDeviceMenu kind="audioinput" className="call-control" title="Escolher microfone"><Icon name="settings" /></MediaDeviceMenu><button {...disconnect.buttonProps} className="call-control call-exit" title="Sair da call"><Icon name="phone" /></button></div>;
}
