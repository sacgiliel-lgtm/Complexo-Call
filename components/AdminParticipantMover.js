'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Avatar, Badge, Icon, Modal, Spinner } from './ui';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export default function AdminParticipantMover() {
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);
  const [session, setSession] = useState(null);
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState([]);
  const [sourceRoom, setSourceRoom] = useState('');
  const [destinationRoom, setDestinationRoom] = useState('');
  const [participants, setParticipants] = useState([]);
  const [selectedIdentity, setSelectedIdentity] = useState('');
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const activeDestinations = useMemo(
    () => channels.filter((channel) => channel.name !== sourceRoom),
    [channels, sourceRoom],
  );

  useEffect(() => {
    if (pathname !== '/admin') return undefined;
    let cancelled = false;
    (async () => {
      const { data: { session: current } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!current) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('role,status')
        .eq('id', current.user.id)
        .single();
      if (cancelled) return;
      setSession(current);
      setAuthorized(profile?.role === 'admin' && profile?.status !== 'suspenso');
    })();
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    if (!open || !session) return undefined;
    let cancelled = false;
    async function loadChannels() {
      setLoadingChannels(true);
      setError('');
      try {
        const response = await fetch('/api/channels', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Não foi possível carregar as salas.');
        if (cancelled) return;
        const nextChannels = json.channels || [];
        setChannels(nextChannels);
        setSourceRoom((current) => current && nextChannels.some((channel) => channel.name === current) ? current : (nextChannels[0]?.name || ''));
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoadingChannels(false);
      }
    }
    loadChannels();
    return () => { cancelled = true; };
  }, [open, session]);

  async function loadParticipants(room = sourceRoom) {
    if (!room || !session) return;
    setLoadingParticipants(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/participants?room=${encodeURIComponent(room)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Não foi possível consultar os participantes.');
      const nextParticipants = json.participants || [];
      setParticipants(nextParticipants);
      setSelectedIdentity((current) => nextParticipants.some((participant) => participant.identity === current) ? current : (nextParticipants[0]?.identity || ''));
      setDestinationRoom((current) => current && current !== room && channels.some((channel) => channel.name === current) ? current : (channels.find((channel) => channel.name !== room)?.name || ''));
    } catch (loadError) {
      setParticipants([]);
      setSelectedIdentity('');
      setError(loadError.message);
    } finally {
      setLoadingParticipants(false);
    }
  }

  useEffect(() => {
    if (!open || !sourceRoom || !channels.length) return;
    loadParticipants(sourceRoom);
  }, [open, sourceRoom, channels.length]);

  function openManager() {
    setError('');
    setNotice('');
    setOpen(true);
  }

  function closeManager() {
    if (moving) return;
    setOpen(false);
    setError('');
    setNotice('');
  }

  async function moveSelected() {
    if (!selectedIdentity || !sourceRoom || !destinationRoom || sourceRoom === destinationRoom || !session) return;
    const participant = participants.find((entry) => entry.identity === selectedIdentity);
    const displayName = participant?.name || selectedIdentity;
    if (!window.confirm(`Mover ${displayName} de #${sourceRoom} para #${destinationRoom}?`)) return;

    setMoving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/participants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ sourceRoom, destinationRoom, identity: selectedIdentity }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Não foi possível mover o participante.');
      setNotice(`${displayName} foi movido para #${destinationRoom}.`);
      await loadParticipants(sourceRoom);
    } catch (moveError) {
      setError(moveError.message);
    } finally {
      setMoving(false);
    }
  }

  if (pathname !== '/admin' || !authorized) return null;

  return <>
    <button
      className="secondary-btn"
      onClick={openManager}
      style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 90, boxShadow: '0 14px 40px rgba(0,0,0,.35)' }}
      title="Mover participantes entre salas"
    >
      <Icon name="users" size={15} /> Mover participantes
    </button>

    <Modal open={open} title="Mover participantes entre salas" onClose={closeManager} width={620}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(155,92,255,.08)', border: '1px solid rgba(155,92,255,.18)' }}>
          <strong style={{ display: 'block', fontSize: 13 }}>Transferência de sala</strong>
          <span className="helper">Escolha onde o participante está, selecione quem deve ser movido e indique a nova sala.</span>
        </div>

        <div className="form-grid two">
          <div className="field">
            <label>Sala de origem</label>
            <select className="input" value={sourceRoom} onChange={(event) => setSourceRoom(event.target.value)} disabled={loadingChannels || moving}>
              {!channels.length && <option value="">Nenhuma sala disponível</option>}
              {channels.map((channel) => <option key={channel.id} value={channel.name}># {channel.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Sala de destino</label>
            <select className="input" value={destinationRoom} onChange={(event) => setDestinationRoom(event.target.value)} disabled={loadingChannels || moving || !activeDestinations.length}>
              {!activeDestinations.length && <option value="">Sem outra sala disponível</option>}
              {activeDestinations.map((channel) => <option key={channel.id} value={channel.name}># {channel.name}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Participante conectado</label>
          {loadingParticipants ? <div style={{ padding: 18, textAlign: 'center' }}><Spinner label="Consultando participantes..." /></div> : participants.length ? <div style={{ display: 'grid', gap: 7, maxHeight: 260, overflowY: 'auto' }}>
            {participants.map((participant) => {
              const selected = selectedIdentity === participant.identity;
              return <button
                key={participant.identity}
                type="button"
                onClick={() => setSelectedIdentity(participant.identity)}
                disabled={moving}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 9, borderRadius: 11, border: `1px solid ${selected ? 'rgba(155,92,255,.5)' : 'var(--border)'}`, background: selected ? 'rgba(155,92,255,.11)' : 'transparent', color: '#fff', textAlign: 'left' }}
              >
                <Avatar name={participant.name} size="sm" status="online" />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: 12 }}>{participant.name || participant.identity}</strong>
                  <span className="helper" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{participant.identity}</span>
                </span>
                {selected && <Badge tone="purple">Selecionado</Badge>}
              </button>;
            })}
          </div> : <div style={{ padding: 16, borderRadius: 11, border: '1px dashed var(--border)', color: 'var(--muted)', textAlign: 'center', fontSize: 12 }}>Nenhum participante conectado nessa sala.</div>}
        </div>

        {error && <div className="error-box" role="alert">{error}</div>}
        {notice && <div className="success-box">{notice}</div>}

        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={closeManager} disabled={moving}>Fechar</button>
          <button className="primary-btn" type="button" onClick={moveSelected} disabled={moving || loadingParticipants || !selectedIdentity || !destinationRoom || !sourceRoom || sourceRoom === destinationRoom}>
            {moving ? <Spinner label="Movendo..." /> : <><Icon name="chevron" size={15} /> Mover participante</>}
          </button>
        </div>
      </div>
    </Modal>
  </>;
}
