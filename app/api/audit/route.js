import { getRequestActor, actorResponse } from '../../../lib/requestAuth';
import { logDiscordEvent } from '../../../lib/discordLogger';

const ALLOWED = new Set([
  'participant_joined',
  'participant_left',
  'screen_share_started',
  'screen_share_stopped',
  'call_reconnecting',
  'call_reconnected',
  'call_disconnected',
  'room_moved_synced',
  'room_moved_sync_failed',
  'error',
]);

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request) {
  const actor = await getRequestActor(request);
  if (!actor.ok) return actorResponse(actor);

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');
    const channel = String(body.channel || '').trim().slice(0, 80);
    const target = String(body.target || '').trim().slice(0, 120);
    const details = String(body.details || '').trim().slice(0, 500);

    if (!ALLOWED.has(action) || !channel) {
      return Response.json({ error: 'Evento de auditoria inválido.' }, { status: 400 });
    }

    const { data: channelRow, error: channelError } = await actor.admin
      .from('channels')
      .select('name,is_active')
      .eq('name', channel)
      .maybeSingle();

    if (channelError) throw channelError;
    if (!channelRow?.is_active) {
      return Response.json({ error: 'Canal indisponível.' }, { status: 404 });
    }

    if (actor.type === 'guest' && actor.guest?.room_name !== channel) {
      return Response.json({
        error: 'O convidado só pode registrar eventos da call atualmente autorizada.',
      }, { status: 403 });
    }

    await logDiscordEvent({
      action,
      actor,
      target: target || actor.username,
      channel,
      details,
      request,
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Audit API:', error);
    return Response.json({ error: 'Não foi possível registrar o evento.' }, { status: 500 });
  }
}
