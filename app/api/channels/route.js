import { getRequestActor, actorResponse } from '../../../lib/requestAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
    const maintenance = !!settings?.maintenance_mode;
    if (maintenance && actor.role !== 'admin') return json({ error: 'Servidor em manutenção.', maintenance: true }, { status: 503 });
    let query = actor.admin.from('channels').select('id,name,is_waiting_room,guest_access,category,description,icon,sort_order,is_active').eq('is_active', true).order('sort_order', { ascending: true });
    if (actor.role === 'convidado') {
      if (actor.guest?.room_name) {
        query = query.eq('name', actor.guest.room_name);
      } else {
        query = query.eq('guest_access', true);
      }
    }
    const { data: channels, error } = await query;
    if (error) throw error;
    return json({ channels: channels || [], maintenance, currentRoom: actor.role === 'convidado' ? (actor.guest?.room_name || null) : null, actor: { username: actor.username, role: actor.role } });
  } catch (error) {
    console.error('Channels API:', error);
    return json({ error: 'Não foi possível carregar os canais.' }, { status: 500 });
  }
}
