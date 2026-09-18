import { getRequestActor, actorResponse } from '../../../lib/requestAuth';

async function getChannel(admin, id, role, guestRoomName = null) {
  const { data: channel, error } = await admin.from('channels').select('id,name,is_active,guest_access').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!channel || !channel.is_active) return { error: Response.json({ error: 'Canal indisponível.' }, { status: 404 }) };
  if (role === 'convidado' && guestRoomName && channel.name !== guestRoomName) {
    return { error: Response.json({ error: 'Este convite dá acesso somente à call para a qual você foi convidado.' }, { status: 403 }) };
  }
  return { channel };
}

export async function GET(request) {
  const actor = await getRequestActor(request);
  if (!actor.ok) return actorResponse(actor);
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get('channel');
  if (!channelId) return Response.json({ error: 'Canal não informado.' }, { status: 400 });
  try {
    const access = await getChannel(actor.admin, channelId, actor.role, actor.guest?.room_name);
    if (access.error) return access.error;
    const { data, error } = await actor.admin.from('channel_messages').select('id,sender_id,sender_name,content,created_at').eq('channel_id', channelId).is('deleted_at', null).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return Response.json({ messages: (data || []).reverse() });
  } catch (error) {
    console.error('Messages GET:', error);
    return Response.json({ error: 'Não foi possível carregar o chat.' }, { status: 500 });
  }
}

export async function POST(request) {
  const actor = await getRequestActor(request);
  if (!actor.ok) return actorResponse(actor);
  const body = await request.json().catch(() => ({}));
  const channelId = String(body.channelId || '');
  const content = String(body.content || '').trim();
  if (!channelId || !content || content.length > 500) return Response.json({ error: 'Mensagem inválida. Use entre 1 e 500 caracteres.' }, { status: 400 });
  try {
    const access = await getChannel(actor.admin, channelId, actor.role, actor.guest?.room_name);
    if (access.error) return access.error;
    const { data, error } = await actor.admin.from('channel_messages').insert({ channel_id: channelId, sender_id: actor.id, sender_name: actor.username, content }).select('id,sender_id,sender_name,content,created_at').single();
    if (error) throw error;
    return Response.json({ message: data });
  } catch (error) {
    console.error('Messages POST:', error);
    return Response.json({ error: 'Não foi possível enviar a mensagem.' }, { status: 500 });
  }
}
