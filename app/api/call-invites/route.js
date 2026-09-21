import crypto from 'crypto';
import { RoomServiceClient } from 'livekit-server-sdk';
import { getRequestActor, actorResponse } from '../../../lib/requestAuth';
import { logDiscordEvent } from '../../../lib/discordLogger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function hashCode(value) {
  return crypto.createHash('sha256').update(String(value).trim().toUpperCase()).digest('hex');
}

function livekitService() {
  const host = process.env.NEXT_PUBLIC_LIVEKIT_URL?.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  if (!host || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return null;
  return new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
}

function createCode() {
  return `CPX-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

export async function POST(request) {
  const actor = await getRequestActor(request);
  if (!actor.ok) return actorResponse(actor);
  if (actor.type !== 'member') {
    return Response.json({ error: 'Apenas membros podem criar convites.' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const roomName = String(body.roomName || '').trim();
    if (!roomName || roomName.length > 50) {
      return Response.json({ error: 'Call inválida.' }, { status: 400 });
    }

    const settingsResult = await actor.admin
      .from('server_settings')
      .select('call_invite_enabled,call_invite_expires_minutes,call_invite_guest_name')
      .eq('id', 1)
      .maybeSingle();

    if (settingsResult.error) throw settingsResult.error;
    const settings = settingsResult.data || {};
    if (settings.call_invite_enabled === false) {
      return Response.json({ error: 'A criação de convites nas calls está desativada pelo administrador.' }, { status: 403 });
    }

    const { data: channel, error: channelError } = await actor.admin
      .from('channels')
      .select('id,name,is_active,guest_access')
      .eq('name', roomName)
      .maybeSingle();

    if (channelError) throw channelError;
    if (!channel || !channel.is_active) {
      return Response.json({ error: 'A call não está ativa.' }, { status: 404 });
    }

    const service = livekitService();
    if (!service) {
      return Response.json({ error: 'O serviço de chamadas não está configurado.' }, { status: 503 });
    }

    try {
      await service.getParticipant(roomName, actor.clerkUserId);
    } catch (error) {
      if (error?.status === 404 || error?.code === 'not_found' || error?.code === 'NOT_FOUND') {
        return Response.json({ error: 'Você precisa estar dentro desta call para criar um convite.' }, { status: 403 });
      }
      throw error;
    }

    const expiresMinutes = Math.max(5, Math.min(10080, Number(settings.call_invite_expires_minutes) || 60));
    const guestName = String(settings.call_invite_guest_name || 'Convidado').trim().slice(0, 32) || 'Convidado';

    let created = null;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      const code = createCode();
      const { data, error } = await actor.admin
        .from('invites')
        .insert({
          code_hash: hashCode(code),
          code_preview: code.slice(-4),
          guest_name: guestName,
          type: 'convidado',
          expires_at: new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString(),
          created_by: actor.id,
          room_name: channel.name,
          used_at: null,
          revoked_at: null,
        })
        .select('id,code_preview,guest_name,type,expires_at,created_at,room_name')
        .single();

      if (!error) {
        created = { data, code };
        break;
      }

      if (!String(error.code || '').includes('23505')) throw error;
    }

    if (!created) {
      return Response.json({ error: 'Não foi possível gerar um convite único. Tente novamente.' }, { status: 503 });
    }

    await logDiscordEvent({ action: 'call_invite_created', actor, target: channel.name, channel: channel.name, details: `Validade: ${expiresMinutes} min`, request });

    const origin = new URL(request.url).origin;
    const link = `${origin}/?invite=${encodeURIComponent(created.code)}&call=${encodeURIComponent(channel.name)}`;

    return Response.json({
      success: true,
      code: created.code,
      link,
      roomName: channel.name,
      guestName,
      expiresAt: created.data.expires_at,
      expiresMinutes,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('Call invite API:', error);
    return Response.json({ error: 'Não foi possível criar o convite para esta call.' }, { status: 500 });
  }
}
