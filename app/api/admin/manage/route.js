import crypto from 'crypto';
import { RoomServiceClient } from 'livekit-server-sdk';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

function hashCode(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function getClient(request) {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}
async function requireAdmin(request) {
  const token = getClient(request);
  if (!token) return { error: Response.json({ error: 'Não autenticado.' }, { status: 401 }) };
  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return { error: Response.json({ error: 'Sessão inválida.' }, { status: 401 }) };
  const { data: profile } = await admin.from('profiles').select('role,status,username').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin' || profile.status === 'suspenso') return { error: Response.json({ error: 'Apenas administradores ativos.' }, { status: 403 }) };
  return { admin, user, profile };
}
async function logActivity(admin, actor, action, target, details = '') {
  try { await admin.from('activity_logs').insert({ actor_id: actor.id, actor_name: actor.username || actor.email || 'Admin', action, target, details }); } catch (error) { console.error('Activity log:', error); }
}
function livekitService() {
  const host = process.env.NEXT_PUBLIC_LIVEKIT_URL?.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  if (!host || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return null;
  return new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
}

export async function POST(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const { admin, user, profile } = auth;
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action === 'create') {
      const count = Math.min(Math.max(Number(body.count) || 1, 1), 20);
      const expiresMinutes = Math.min(Math.max(Number(body.expiresMinutes) || 30, 5), 10080);
      const created = [];
      for (let i = 0; i < count; i += 1) {
        const code = `CPX-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        const { data, error } = await admin.from('invites').insert({ code_hash: hashCode(code), code_preview: code.slice(-4), guest_name: body.guestName?.trim() || 'Convidado', type: 'convidado', expires_at: new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString(), created_by: user.id, used_at: null, revoked_at: null }).select('id,code_preview,guest_name,type,expires_at,created_at').single();
        if (error) throw error;
        created.push({ ...data, code });
      }
      await logActivity(admin, profile, 'invite_created', body.guestName?.trim() || 'Convidado', `${count} convite(s), validade de ${expiresMinutes} min`);
      return Response.json({ success: true, invites: created });
    }

    if (action === 'revoke-invite') {
      const { error } = await admin.from('invites').update({ revoked_at: new Date().toISOString() }).eq('id', body.id).is('used_at', null);
      if (error) throw error;
      await logActivity(admin, profile, 'invite_revoked', String(body.id));
      return Response.json({ success: true });
    }

    if (action === 'update-user') {
      if (!body.id || !['admin', 'membro'].includes(body.role) || !['ativo', 'suspenso'].includes(body.status)) return Response.json({ error: 'Dados de usuário inválidos.' }, { status: 400 });
      if (body.id === user.id && body.status === 'suspenso') return Response.json({ error: 'Você não pode suspender sua própria conta.' }, { status: 400 });
      if (body.id === user.id && body.role !== 'admin') return Response.json({ error: 'Você não pode retirar seu próprio cargo de administrador.' }, { status: 400 });
      const { data: target } = await admin.from('profiles').select('username').eq('id', body.id).maybeSingle();
      const { error } = await admin.from('profiles').update({ role: body.role, status: body.status }).eq('id', body.id);
      if (error) throw error;
      await logActivity(admin, profile, 'user_updated', target?.username || body.id, `cargo=${body.role}; status=${body.status}`);
      return Response.json({ success: true });
    }

    if (action === 'delete-user') {
      if (body.id === user.id) return Response.json({ error: 'Você não pode excluir sua própria conta.' }, { status: 400 });
      const { data: target } = await admin.from('profiles').select('username').eq('id', body.id).maybeSingle();
      const { error } = await admin.auth.admin.deleteUser(body.id);
      if (error) throw error;
      await logActivity(admin, profile, 'user_deleted', target?.username || body.id);
      return Response.json({ success: true });
    }

    if (action === 'create-channel') {
      const name = String(body.name || '').trim();
      if (!name || name.length > 50) return Response.json({ error: 'Nome de canal inválido.' }, { status: 400 });
      const payload = { name, is_active: true, guest_access: !!body.guest_access, is_waiting_room: !!body.is_waiting_room, category: String(body.category || 'GERAL').slice(0, 30), description: String(body.description || '').trim().slice(0, 150) || null, icon: String(body.icon || 'voice').slice(0, 20), sort_order: Math.max(0, Number(body.sort_order) || 0) };
      const { data, error } = await admin.from('channels').insert(payload).select().single();
      if (error) throw error;
      await logActivity(admin, profile, 'channel_created', name, `categoria=${payload.category}`);
      return Response.json({ success: true, channel: data });
    }

    if (action === 'update-channel') {
      const allowed = {};
      if (typeof body.is_active === 'boolean') allowed.is_active = body.is_active;
      if (typeof body.guest_access === 'boolean') allowed.guest_access = body.guest_access;
      if (typeof body.is_waiting_room === 'boolean') allowed.is_waiting_room = body.is_waiting_room;
      if (body.name) allowed.name = String(body.name).trim().slice(0, 50);
      if (body.category !== undefined) allowed.category = String(body.category || 'GERAL').trim().slice(0, 30) || 'GERAL';
      if (body.description !== undefined) allowed.description = String(body.description || '').trim().slice(0, 150) || null;
      if (body.icon !== undefined) allowed.icon = String(body.icon || 'voice').trim().slice(0, 20);
      if (body.sort_order !== undefined) allowed.sort_order = Math.max(0, Number(body.sort_order) || 0);
      const { data: target } = await admin.from('channels').select('name').eq('id', body.id).maybeSingle();
      const { error } = await admin.from('channels').update(allowed).eq('id', body.id);
      if (error) throw error;
      await logActivity(admin, profile, 'channel_updated', target?.name || body.id);
      return Response.json({ success: true });
    }

    if (action === 'delete-channel') {
      const { data: target } = await admin.from('channels').select('name').eq('id', body.id).maybeSingle();
      const { error } = await admin.from('channels').delete().eq('id', body.id);
      if (error) throw error;
      await logActivity(admin, profile, 'channel_deleted', target?.name || body.id);
      return Response.json({ success: true });
    }

    if (action === 'settings') {
      const maxUsers = body.maxUsers === null || body.maxUsers === 'ilimitado' ? null : Math.max(1, Math.min(Number(body.maxUsers), 1000));
      const payload = { id: 1, maintenance_mode: !!body.maintenanceMode, discord_logs: !!body.discordLogs, max_users: maxUsers, updated_at: new Date().toISOString() };
      const { error } = await admin.from('server_settings').upsert(payload);
      if (error) throw error;
      await logActivity(admin, profile, 'settings_updated', 'server', `manutencao=${payload.maintenance_mode}; limite=${payload.max_users ?? 'ilimitado'}`);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Ação desconhecida.' }, { status: 400 });
  } catch (error) {
    console.error('Admin API:', error);
    return Response.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const { admin } = auth;
    const [{ data: users, error: usersError }, { data: invites, error: invitesError }, { data: channels, error: channelsError }, { data: settings, error: settingsError }, { data: activities, error: activityError }] = await Promise.all([
      admin.from('profiles').select('id,username,role,status,presence_status,last_seen_at,created_at').order('created_at', { ascending: false }),
      admin.from('invites').select('id,code_preview,guest_name,type,expires_at,used_at,revoked_at,created_at').order('created_at', { ascending: false }).limit(100),
      admin.from('channels').select('*').order('sort_order', { ascending: true }),
      admin.from('server_settings').select('*').eq('id', 1).maybeSingle(),
      admin.from('activity_logs').select('id,actor_name,action,target,details,created_at').order('created_at', { ascending: false }).limit(30),
    ]);
    if (usersError || invitesError || channelsError || settingsError || activityError) throw usersError || invitesError || channelsError || settingsError || activityError;

    let online = 0;
    const service = livekitService();
    if (service && channels?.length) {
      const activeChannels = channels.filter((channel) => channel.is_active);
      const counts = await Promise.all(activeChannels.map(async (channel) => {
        try {
          return (await service.listParticipants(channel.name))?.length ?? 0;
        } catch (error) {
          if (error?.status === 404 || error?.code === 'not_found' || error?.code === 'NOT_FOUND') return 0;
          console.error(`Admin online stats (#${channel.name}):`, error);
          return 0;
        }
      }));
      online = counts.reduce((sum, value) => sum + value, 0);
    }
    const activeInvites = (invites || []).filter((invite) => !invite.used_at && !invite.revoked_at && new Date(invite.expires_at).getTime() > Date.now()).length;
    return Response.json({ users: users || [], invites: invites || [], channels: channels || [], activities: activities || [], settings: settings || { maintenance_mode: false, discord_logs: true, max_users: null }, stats: { users: users?.length || 0, online, channels: channels?.filter((channel) => channel.is_active).length || 0, activeInvites } });
  } catch (error) {
    return Response.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}
