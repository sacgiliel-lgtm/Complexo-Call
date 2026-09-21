import { RoomServiceClient } from 'livekit-server-sdk';
import { getRequestActor, actorResponse } from '../../../../lib/requestAuth';
import { logDiscordEvent } from '../../../../lib/discordLogger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function livekitService() {
  const host = process.env.NEXT_PUBLIC_LIVEKIT_URL?.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  if (!host || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return null;
  return new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
}

async function requireMember(request) {
  const actor = await getRequestActor(request);
  if (!actor.ok) return { response: actorResponse(actor) };
  if (actor.role === 'convidado') {
    return { response: Response.json({ error: 'Apenas membros podem gerenciar participantes.' }, { status: 403 }) };
  }
  return { actor };
}

async function getActiveChannel(admin, name) {
  const { data, error } = await admin
    .from('channels')
    .select('id,name,is_active')
    .eq('name', name)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function livekitError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  const code = String(error?.code ?? error?.reason ?? '').toLowerCase();

  if (status === 404 || code.includes('not_found') || code.includes('not found')) {
    return {
      status: 404,
      error: 'O participante não está mais conectado à sala de origem.',
      code: 'PARTICIPANT_NOT_FOUND',
    };
  }

  if (status === 401 || status === 403 || code.includes('permission') || code.includes('unauthorized')) {
    return {
      status: 502,
      error: 'O LiveKit recusou a operação. Verifique as credenciais e as permissões do projeto LiveKit.',
      code: 'LIVEKIT_AUTH_ERROR',
    };
  }

  if (status === 409 || code.includes('conflict')) {
    return {
      status: 409,
      error: 'O participante não pôde ser movido porque a operação entrou em conflito. Atualize a lista e tente novamente.',
      code: 'LIVEKIT_CONFLICT',
    };
  }

  return {
    status: 502,
    error: 'O LiveKit não conseguiu concluir a movimentação.',
    code: 'LIVEKIT_MOVE_ERROR',
  };
}

export async function GET(request) {
  const auth = await requireMember(request);
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
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Participants GET:', error);
    return Response.json({ error: 'Não foi possível consultar os participantes.' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireMember(request);
  if (auth.response) return auth.response;

  const { actor } = auth;
  const body = await request.json().catch(() => ({}));
  const sourceRoom = String(body.sourceRoom || '').trim();
  const destinationRoom = String(body.destinationRoom || '').trim();
  const identity = String(body.identity || '').trim();
  const requestedName = String(body.name || '').trim().slice(0, 200);

  if (!sourceRoom || !destinationRoom || !identity) {
    return Response.json({
      error: 'Sala de origem, destino e participante são obrigatórios.',
    }, { status: 400 });
  }

  if (sourceRoom === destinationRoom) {
    return Response.json({
      error: 'A sala de destino precisa ser diferente da sala de origem.',
    }, { status: 400 });
  }

  const ownIdentity = actor.type === 'member' ? actor.clerkUserId : actor.id;
  if (identity === ownIdentity) {
    return Response.json({
      error: 'Você não pode mover a própria sessão.',
    }, { status: 400 });
  }

  try {
    const [sourceChannel, destinationChannel] = await Promise.all([
      getActiveChannel(actor.admin, sourceRoom),
      getActiveChannel(actor.admin, destinationRoom),
    ]);

    if (!sourceChannel?.is_active) {
      return Response.json({ error: 'A sala de origem não está disponível.' }, { status: 404 });
    }

    if (!destinationChannel?.is_active) {
      return Response.json({ error: 'A sala de destino não está disponível.' }, { status: 404 });
    }

    const { data: settings } = await actor.admin
      .from('server_settings')
      .select('max_users')
      .eq('id', 1)
      .maybeSingle();

    const service = livekitService();
    if (!service) return Response.json({ error: 'LiveKit não configurado.' }, { status: 500 });

    // Idempotência: se a mesma identidade já chegou ao destino (por exemplo,
    // por duplo clique, retry do navegador ou reenvio após uma resposta perdida),
    // a operação já foi concluída. Não tentamos mover novamente nem aplicamos
    // limite de capacidade a uma operação que não precisa mais ser executada.
    const destinationParticipants = await service.listParticipants(destinationRoom).catch((countError) => {
      const status = Number(countError?.status ?? countError?.statusCode ?? 0);
      const code = String(countError?.code ?? '').toLowerCase();
      if (status === 404 || code.includes('not_found') || code.includes('not found')) return [];
      throw countError;
    });
    const alreadyAtDestination = (destinationParticipants || []).find(
      (participant) => participant.identity === identity,
    );

    if (alreadyAtDestination) {
      await logDiscordEvent({
        action: 'participant_move_idempotent',
        actor,
        target: alreadyAtDestination.name || identity,
        channel: sourceRoom,
        details: `Destino #${destinationRoom} já continha o participante; nenhuma segunda movimentação foi executada.`,
        request,
      });

      return Response.json({
        ok: true,
        idempotent: true,
        mode: 'already_at_destination',
        participant: { identity, name: alreadyAtDestination.name || requestedName || identity },
        sourceRoom,
        destinationRoom,
      });
    }

    if (settings?.max_users && (destinationParticipants?.length || 0) >= Number(settings.max_users)) {
      return Response.json({
        error: 'A call de destino atingiu o limite máximo de participantes.',
        code: 'DESTINATION_FULL',
      }, { status: 409 });
    }

    // A lista usada pela interface precisa representar participantes realmente
    // conectados ao LiveKit. Validamos isso no backend antes da operação.
    const sourceParticipants = await service.listParticipants(sourceRoom);
    const liveParticipant = (sourceParticipants || []).find(
      (participant) => participant.identity === identity,
    );

    if (!liveParticipant) {
      return Response.json({
        error: 'O participante não está conectado ao LiveKit nessa call. Atualize a lista e tente novamente.',
        code: 'PARTICIPANT_NOT_CONNECTED',
      }, { status: 409 });
    }

    let guestTransfer = null;
    if (identity.startsWith('guest:')) {
      const guestJti = identity.slice('guest:'.length);
      if (!guestJti) {
        return Response.json({ error: 'Identidade do convidado inválida.' }, { status: 400 });
      }

      const { data: guestSession, error: guestSessionError } = await actor.admin
        .from('guest_sessions')
        .select('jti,current_room_name')
        .eq('jti', guestJti)
        .maybeSingle();

      if (guestSessionError) throw guestSessionError;
      if (!guestSession) {
        return Response.json({
          error: 'Sessão do convidado não foi encontrada.',
          code: 'GUEST_SESSION_NOT_FOUND',
        }, { status: 409 });
      }

      const currentGuestRoom = guestSession.current_room_name || sourceRoom;
      if (currentGuestRoom === destinationRoom) {
        await logDiscordEvent({
          action: 'participant_move_idempotent',
          actor,
          target: identity,
          channel: sourceRoom,
          details: `Sessão do convidado já está vinculada a #${destinationRoom}; nenhuma segunda movimentação foi executada.`,
          request,
        });

        return Response.json({
          ok: true,
          idempotent: true,
          mode: 'already_at_destination',
          participant: { identity, name: requestedName || identity },
          sourceRoom,
          destinationRoom,
        });
      }
      if (currentGuestRoom !== sourceRoom) {
        return Response.json({
          error: 'A sessão do convidado já está vinculada a outra call. Atualize a lista e tente novamente.',
          code: 'GUEST_ROOM_STALE',
        }, { status: 409 });
      }

      // Atualizamos a autorização da sessão ANTES do MoveParticipant. Assim,
      // quando o LiveKit emitir RoomEvent.Moved, o cliente já consegue consultar
      // a nova call, o novo chat e demais dados protegidos do destino.
      const { error: guestUpdateError } = await actor.admin
        .from('guest_sessions')
        .update({ current_room_name: destinationRoom })
        .eq('jti', guestJti);

      if (guestUpdateError) throw guestUpdateError;
      guestTransfer = { jti: guestJti, previousRoom: currentGuestRoom };
    }

    try {
      await service.moveParticipant(sourceRoom, identity, destinationRoom);
    } catch (moveError) {
      if (guestTransfer) {
        await actor.admin
          .from('guest_sessions')
          .update({ current_room_name: guestTransfer.previousRoom })
          .eq('jti', guestTransfer.jti);
      }
      throw moveError;
    }

    const displayName = requestedName || identity;

    await logDiscordEvent({
      action: 'participant_moved',
      actor,
      target: displayName,
      channel: sourceRoom,
      details: `Destino: #${destinationRoom}`,
      request,
    });

    return Response.json({
      ok: true,
      mode: 'reconnect',
      participant: { identity, name: displayName },
      sourceRoom,
      destinationRoom,
    });
  } catch (error) {
    console.error('Participants POST:', error);
    const mapped = livekitError(error);
    return Response.json(mapped, { status: mapped.status });
  }
}
