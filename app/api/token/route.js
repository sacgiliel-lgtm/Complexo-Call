import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { verifyGuestTicket, getGuestTicketFromCookie } from '../../../lib/guestTicket';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { getRequestClerkIdentity } from '../../../lib/clerkAuth';
import { logDiscordEvent } from '../../../lib/discordLogger';
import crypto from 'crypto';

async function rateLimit(admin, key, max = 10, seconds = 60) {
  const hashed = crypto.createHash('sha256').update(key).digest('hex');
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_key: hashed,
    p_max: max,
    p_window_seconds: seconds,
  });
  if (error) {
    console.error('Rate limit RPC:', error);
    return false;
  }
  return !!data?.[0]?.allowed;
}

async function participantCount(room) {
  try {
    const host = process.env.NEXT_PUBLIC_LIVEKIT_URL
      ?.replace(/^wss:/, 'https:')
      .replace(/^ws:/, 'http:');
    if (!host) return null;

    const service = new RoomServiceClient(
      host,
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
    );
    return (await service.listParticipants(room))?.length ?? 0;
  } catch (error) {
    console.error('LiveKit participant count:', error);
    return null;
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const room = String(searchParams.get('room') || '').trim();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';

  if (!room) return Response.json({ error: 'Faltando room.' }, { status: 400 });

  try {
    const admin = getSupabaseAdmin();

    if (!(await rateLimit(admin, `token:${ip}`))) {
      return Response.json({ error: 'Muitas tentativas. Aguarde um instante.' }, { status: 429 });
    }

    const { data: channel, error: channelError } = await admin
      .from('channels')
      .select('id,name,is_active,guest_access')
      .eq('name', room)
      .maybeSingle();

    if (channelError) throw channelError;
    if (!channel || !channel.is_active) {
      return Response.json({ error: 'Sala inexistente ou desativada.' }, { status: 404 });
    }

    const { data: settings } = await admin
      .from('server_settings')
      .select('maintenance_mode,max_users,discord_logs')
      .eq('id', 1)
      .maybeSingle();

    const guestTicket = getGuestTicketFromCookie(request)
      || request.headers.get('x-guest-ticket');

    let username;
    let role;
    let identity;
    let actor;

    // Membros e administradores usam exclusivamente o Clerk.
    const member = await getRequestClerkIdentity();

    if (member.ok) {
      username = member.username || member.email?.split('@')[0] || 'Membro';
      role = member.role || 'membro';
      identity = member.clerkUserId;
      actor = member;
    } else if (guestTicket) {
      const payload = verifyGuestTicket(guestTicket);
      if (!payload) {
        return Response.json({ error: 'Convite expirado ou inválido.' }, { status: 401 });
      }

      const { data: guest, error: guestError } = await admin
        .from('guest_sessions')
        .select('jti,invite_id,username,expires_at,revoked_at,current_room_name')
        .eq('jti', payload.jti)
        .maybeSingle();

      if (
        guestError
        || !guest
        || guest.revoked_at
        || String(guest.invite_id) !== String(payload.inviteId)
        || new Date(guest.expires_at).getTime() <= Date.now()
      ) {
        return Response.json({
          error: 'Sessão de convidado expirada ou revogada.',
        }, { status: 401 });
      }

      const { data: invite, error: inviteError } = await admin
        .from('invites')
        .select('room_name')
        .eq('id', guest.invite_id)
        .maybeSingle();

      if (inviteError || !invite) {
        return Response.json({ error: 'Convite do convidado não encontrado.' }, { status: 401 });
      }

      username = guest.username;
      role = 'convidado';
      identity = `guest:${guest.jti}`;
      actor = {
        id: identity,
        identity,
        username,
        role,
        type: 'guest',
        guest,
      };

      const allowedGuestRoom = guest.current_room_name || invite.room_name || null;
      if (allowedGuestRoom && allowedGuestRoom !== room) {
        await logDiscordEvent({
          action: 'call_access_blocked',
          actor,
          target: username,
          channel: room,
          details: `Convite autorizado somente para #${allowedGuestRoom}.`,
          status: 'warning',
          request,
        });
        return Response.json({
          error: 'Este convite dá acesso somente à call para a qual você foi convidado.',
        }, { status: 403 });
      }
    } else {
      return Response.json({
        error: member.error || 'Não autenticado. Faça login ou use um convite.',
      }, { status: member.status || 401 });
    }

    if (settings?.maintenance_mode && role !== 'admin') {
      await logDiscordEvent({
        action: 'call_access_blocked',
        actor,
        target: username,
        channel: room,
        details: 'Servidor em modo manutenção.',
        status: 'warning',
        request,
      });
      return Response.json({
        error: 'O servidor está em manutenção no momento.',
      }, { status: 503 });
    }

    if (settings?.max_users) {
      const count = await participantCount(room);
      if (count !== null && count >= settings.max_users) {
        await logDiscordEvent({
          action: 'call_access_blocked',
          actor,
          target: username,
          channel: room,
          details: `Limite de usuários atingido (${settings.max_users}).`,
          status: 'warning',
          request,
        });
        return Response.json({
          error: 'O limite de usuários desta call foi atingido.',
        }, { status: 429 });
      }
    }

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity,
        name: username,
        ttl: '10m',
        metadata: JSON.stringify({ username, role }),
      },
    );

    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    await logDiscordEvent({
      action: 'call_access_granted',
      actor,
      target: username,
      channel: room,
      details: 'Token LiveKit emitido com sucesso.',
      request,
    });

    return Response.json({ token, username, role }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Token API:', error);
    return Response.json({ error: 'Erro interno ao processar acesso.' }, { status: 500 });
  }
}
