import { RoomServiceClient } from 'livekit-server-sdk';
import { getRequestActor, actorResponse } from '../../../../lib/requestAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function livekitService() {
  const host = process.env.NEXT_PUBLIC_LIVEKIT_URL?.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  if (!host || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return null;
  return new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
}

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      ...(init.headers || {}),
    },
  });
}

export async function GET(request) {
  const actor = await getRequestActor(request);
  if (!actor.ok) return actorResponse(actor);

  try {
    const { data: settings } = await actor.admin.from('server_settings').select('maintenance_mode').eq('id', 1).maybeSingle();
    if (settings?.maintenance_mode && actor.role !== 'admin') return json({ maintenance: true, participants: {} }, { status: 503 });

    let query = actor.admin
      .from('channels')
      .select('id,name,guest_access,is_active,sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (actor.type === 'guest') {
      if (actor.guest?.room_name) {
        query = query.eq('name', actor.guest.room_name);
      } else {
        query = query.eq('guest_access', true);
      }
    }

    const { data: channels, error } = await query;
    if (error) throw error;

    const service = livekitService();
    const participants = {};
    if (!service) return json({ participants });

    await Promise.all((channels || []).map(async (channel) => {
      try {
        const roomParticipants = await service.listParticipants(channel.name);
        participants[channel.name] = (roomParticipants || []).map((participant) => {
          let role = 'membro';
          try { role = JSON.parse(participant.metadata || '{}').role || 'membro'; } catch {}
          return {
            identity: participant.identity,
            name: participant.name || participant.identity?.replace(/^guest:/, '') || 'Participante',
            role,
            sid: participant.sid,
            isSpeaking: !!participant.isSpeaking,
          };
        });
      } catch (roomError) {
        if (roomError?.status === 404 || roomError?.code === 'not_found' || roomError?.code === 'NOT_FOUND') {
          participants[channel.name] = [];
          return;
        }
        console.error(`Channel presence (#${channel.name}):`, roomError);
        participants[channel.name] = [];
      }
    }));

    return json({ participants, channels: (channels || []).map(({ id, name }) => ({ id, name })) });
  } catch (error) {
    console.error('Channel presence API:', error);
    return json({ error: 'Não foi possível consultar a presença das calls.' }, { status: 500 });
  }
}
