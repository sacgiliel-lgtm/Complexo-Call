import { getRequestActor, actorResponse } from '../../../lib/requestAuth';
import { logDiscordEvent } from '../../../lib/discordLogger';

const ALLOWED = new Set([
  'participant_joined',
  'participant_left',
  'screen_share_started',
  'screen_share_stopped',
  'error',
]);

export async function POST(request) {
  const actor = await getRequestActor(request);
  if (!actor.ok) return actorResponse(actor);
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');
    const channel = String(body.channel || '').trim().slice(0, 80);
    const target = String(body.target || '').trim().slice(0, 120);
    const details = String(body.details || '').trim().slice(0, 500);
    if (!ALLOWED.has(action) || !channel) return Response.json({ error: 'Evento de auditoria inválido.' }, { status: 400 });
    await logDiscordEvent({
      action,
      actor,
      target: target || actor.username,
      channel,
      details,
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Audit API:', error);
    return Response.json({ error: 'Não foi possível registrar o evento.' }, { status: 500 });
  }
}
