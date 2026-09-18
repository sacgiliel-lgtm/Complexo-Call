import { RoomServiceClient } from 'livekit-server-sdk';
import { getRequestActor, actorResponse } from '../../../lib/requestAuth';

function livekitHost() {
  return process.env.NEXT_PUBLIC_LIVEKIT_URL?.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

export async function POST(request) {
  const actor = await getRequestActor(request);
  if (!actor.ok) return actorResponse(actor);
  if (!['admin', 'membro'].includes(actor.role)) return Response.json({ error: 'Apenas membros e administradores podem moderar chamadas.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const room = String(body.room || '');
  const identity = String(body.identity || '');
  const action = String(body.action || '');
  if (!room || !identity || !['disconnect', 'mute'].includes(action)) return Response.json({ error: 'Dados de moderação inválidos.' }, { status: 400 });
  if (identity === actor.id) return Response.json({ error: 'Você não pode moderar a própria sessão.' }, { status: 400 });
  try {
    const { data: channel } = await actor.admin.from('channels').select('id,name,is_active').eq('name', room).maybeSingle();
    if (!channel || !channel.is_active) return Response.json({ error: 'Canal indisponível.' }, { status: 404 });
    const host = livekitHost();
    if (!host) return Response.json({ error: 'LiveKit não configurado.' }, { status: 500 });
    const service = new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
    if (action === 'disconnect') {
      await service.removeParticipant(room, identity);
      await actor.admin.from('activity_logs').insert({ actor_id: actor.id, actor_name: actor.username, action: 'participant_disconnected', target: identity, details: `Canal #${room}` });
      return Response.json({ ok: true });
    }
    const participant = await service.getParticipant(room, identity);
    const audio = participant?.tracks?.find((track) => track.source === 'MICROPHONE' || track.source === 1 || String(track.source).toLowerCase().includes('microphone'));
    if (!audio?.sid) return Response.json({ error: 'O participante não possui microfone publicado.' }, { status: 409 });
    await service.mutePublishedTrack(room, identity, audio.sid, true);
    await actor.admin.from('activity_logs').insert({ actor_id: actor.id, actor_name: actor.username, action: 'participant_muted', target: identity, details: `Canal #${room}` });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Moderation API:', error);
    return Response.json({ error: 'Não foi possível executar a moderação.' }, { status: 500 });
  }
}
