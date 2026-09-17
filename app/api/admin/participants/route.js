import { RoomServiceClient } from 'livekit-server-sdk';
import { getRequestActor, actorResponse } from '../../../../lib/requestAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function livekitService() {
  const host = process.env.NEXT_PUBLIC_LIVEKIT_URL?.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  if (!host || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return null;
  return new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
}

async function requireAdmin(request) {
  const actor = await getRequestActor(request);
  if (!actor.ok) return { response: actorResponse(actor) };
  if (actor.role !== 'admin') return { response: Response.json({ error: 'Apenas administradores podem gerenciar participantes.' }, { status: 403 }) };
  return { actor };
}

async function getActiveChannel(admin, name) {
  const { data, error } = await admin.from('channels').select('id,name,is_active').eq('name', name).maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { actor } = auth;
  const room = String(new URL(request.url).searchParams.get('room') || '').trim();
  if (!room) return Response.json({ error: 'Informe a sala.' }, { status: 400 });

  try {
    const channel = await getActiveChannel(actor.admin, room);
    if (!channel?.is_active) return Response.json({ error: 'Sala indisponível.' }, { status: 404 });
    const service = livekitService();
    if (!service) return Response.json({ error: 'LiveKit não configurado.' }, { status: 500 });
    const participants = await service.listParticipants(room);
    return Response.json({
      room,
      participants: (participants || []).map((participant) => ({
        identity: participant.identity,
        name: participant.name || participant.identity,
        sid: participant.sid,
        state: participant.state,
      })),
    });
  } catch (error) {
    console.error('Admin participants GET:', error);
    return Response.json({ error: 'Não foi possível consultar os participantes.' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { actor } = auth;
  const body = await request.json().catch(() => ({}));
  const sourceRoom = String(body.sourceRoom || '').trim();
  const destinationRoom = String(body.destinationRoom || '').trim();
  const identity = String(body.identity || '').trim();
  if (!sourceRoom || !destinationRoom || !identity) return Response.json({ error: 'Sala de origem, destino e participante são obrigatórios.' }, { status: 400 });
  if (sourceRoom === destinationRoom) return Response.json({ error: 'A sala de destino precisa ser diferente da sala de origem.' }, { status: 400 });
  if (identity === actor.id) return Response.json({ error: 'Você não pode mover a própria sessão.' }, { status: 400 });

  try {
    const [sourceChannel, destinationChannel] = await Promise.all([
      getActiveChannel(actor.admin, sourceRoom),
      getActiveChannel(actor.admin, destinationRoom),
    ]);
    if (!sourceChannel?.is_active) return Response.json({ error: 'A sala de origem não está disponível.' }, { status: 404 });
    if (!destinationChannel?.is_active) return Response.json({ error: 'A sala de destino não está disponível.' }, { status: 404 });

    const service = livekitService();
    if (!service) return Response.json({ error: 'LiveKit não configurado.' }, { status: 500 });

    const participant = await service.getParticipant(sourceRoom, identity).catch(() => null);
    if (!participant) return Response.json({ error: 'Esse participante não está mais na sala de origem.' }, { status: 404 });

    await service.moveParticipant(sourceRoom, identity, destinationRoom);

    const displayName = participant.name || identity;
    try {
      await actor.admin.from('activity_logs').insert({
        actor_id: actor.id,
        actor_name: actor.username,
        action: 'participant_moved',
        target: displayName,
        details: `De #${sourceRoom} para #${destinationRoom}`,
      });
    } catch (error) {
      console.error('Participant move log:', error);
    }

    return Response.json({ ok: true, participant: { identity, name: displayName }, sourceRoom, destinationRoom });
  } catch (error) {
    console.error('Admin participants POST:', error);
    return Response.json({ error: 'Não foi possível mover o participante. A sala de destino pode estar indisponível ou o participante pode ter saído.' }, { status: 500 });
  }
}
