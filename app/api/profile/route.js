import { getRequestActor, actorResponse } from '../../../lib/requestAuth';
import { RoomServiceClient } from 'livekit-server-sdk';
import { logDiscordEvent } from '../../../lib/discordLogger';

export async function GET(request) {
  const actor = await getRequestActor(request);
  if (!actor.ok) return actorResponse(actor);
  return Response.json({ profile: { username: actor.username, role: actor.role, presence_status: actor.profile?.presence_status || 'online' } });
}

export async function PATCH(request) {
  const actor = await getRequestActor(request);
  if (!actor.ok) return actorResponse(actor);
  if (actor.type !== 'member') return Response.json({ error: 'Convidados não possuem perfil editável.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const username = String(body.username ?? '').trim();
  if (username.length < 2 || username.length > 32) return Response.json({ error: 'Nome deve ter entre 2 e 32 caracteres.' }, { status: 400 });
  if (!/^[\p{L}\p{N} _.-]+$/u.test(username)) return Response.json({ error: 'Nome contém caracteres não permitidos.' }, { status: 400 });
  const { data: existing } = await actor.admin.from('profiles').select('id').ilike('username', username).neq('id', actor.id).maybeSingle();
  if (existing) return Response.json({ error: 'Esse nome já está em uso.' }, { status: 409 });
  const { data, error } = await actor.admin.from('profiles').update({ username }).eq('id', actor.id).select('username').single();
  if (error) return Response.json({ error: 'Não foi possível atualizar seu perfil.' }, { status: 500 });

  // Atualiza também o nome armazenado nas mensagens antigas desse usuário,
  // mantendo o histórico consistente com o nome exibido atual.
  await actor.admin.from('channel_messages')
    .update({ sender_name: data.username })
    .eq('sender_id', actor.id);

  const roomName = String(body.roomName ?? '').trim();
  let livekitUpdated = false;

  if (roomName && actor.clerkUserId && process.env.NEXT_PUBLIC_LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
    const channelLookup = await actor.admin.from('channels')
      .select('name,is_active')
      .eq('name', roomName)
      .maybeSingle();

    if (!channelLookup.error && channelLookup.data?.is_active) {
      try {
        const livekitHost = process.env.NEXT_PUBLIC_LIVEKIT_URL
          .replace(/^wss:/, 'https:')
          .replace(/^ws:/, 'http:');
        const service = new RoomServiceClient(
          livekitHost,
          process.env.LIVEKIT_API_KEY,
          process.env.LIVEKIT_API_SECRET,
        );
        await service.updateParticipant(roomName, actor.clerkUserId, { name: data.username });
        livekitUpdated = true;
      } catch (livekitError) {
        console.warn('Profile update: LiveKit participant name could not be updated immediately.', livekitError);
      }
    }
  }

  await logDiscordEvent({
    action: 'profile_updated',
    actor: { ...actor, username: data.username },
    target: data.username,
    details: livekitUpdated ? 'Nome exibido atualizado no perfil, chat e participante conectado.' : 'Nome exibido atualizado no perfil e histórico do chat.',
    request,
  });

  return Response.json({
    profile: {
      username: data.username,
      role: actor.role,
    },
    livekitUpdated,
  });
}
