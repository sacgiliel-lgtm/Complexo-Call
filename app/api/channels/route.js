import { getRequestActor, actorResponse } from '../../../lib/requestAuth';

export async function GET(request) {
  const actor = await getRequestActor(request);
  if (!actor.ok) return actorResponse(actor);
  try {
    const { data: settings } = await actor.admin.from('server_settings').select('maintenance_mode').eq('id', 1).maybeSingle();
    if (settings?.maintenance_mode && actor.role !== 'admin') return Response.json({ error: 'Servidor em manutenção.' }, { status: 503 });
    let query = actor.admin.from('channels').select('id,name,is_waiting_room,guest_access,category,description,icon,sort_order,is_active').eq('is_active', true).order('sort_order', { ascending: true });
    if (actor.role === 'convidado') query = query.eq('guest_access', true);
    const { data: channels, error } = await query;
    if (error) throw error;
    return Response.json({ channels: channels || [], actor: { username: actor.username, role: actor.role } });
  } catch (error) {
    console.error('Channels API:', error);
    return Response.json({ error: 'Não foi possível carregar os canais.' }, { status: 500 });
  }
}
