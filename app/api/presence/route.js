import { getRequestActor, actorResponse } from '../../../lib/requestAuth';

export async function POST(request) {
  const actor = await getRequestActor(request);
  if (!actor.ok) return actorResponse(actor);
  if (actor.type !== 'member') return Response.json({ ok: true, presence: 'online' });
  const body = await request.json().catch(() => ({}));
  const status = ['online', 'away', 'busy', 'offline'].includes(body.status) ? body.status : 'online';
  const { error } = await actor.admin.from('profiles').update({ presence_status: status, last_seen_at: new Date().toISOString() }).eq('id', actor.id);
  if (error) return Response.json({ error: 'Não foi possível atualizar seu status.' }, { status: 500 });
  return Response.json({ ok: true, presence: status });
}
