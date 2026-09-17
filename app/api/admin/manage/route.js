import crypto from 'crypto';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { createGuestTicket } from '../../../../lib/guestTicket';

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function getClient(request) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

async function requireAdmin(request) {
  const token = getClient(request);
  if (!token) return { error: Response.json({ error: 'Não autenticado.' }, { status: 401 }) };
  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return { error: Response.json({ error: 'Sessão inválida.' }, { status: 401 }) };
  const { data: profile } = await admin.from('profiles').select('role,status').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin' || profile.status === 'suspenso') {
    return { error: Response.json({ error: 'Apenas administradores ativos.' }, { status: 403 }) };
  }
  return { admin, user, profile };
}

export async function POST(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const { admin, user } = auth;
    const body = await request.json();
    const action = body.action;

    if (action === 'create') {
      const count = Math.min(Math.max(Number(body.count) || 1, 1), 20);
      const expiresMinutes = Math.min(Math.max(Number(body.expiresMinutes) || 30, 5), 10080);
      const created = [];
      for (let i = 0; i < count; i += 1) {
        const code = `CPX-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        const { data, error } = await admin.from('invites').insert({
          code_hash: hashCode(code),
          code_preview: code.slice(-4),
          guest_name: body.guestName?.trim() || 'Convidado',
          type: 'convidado',
          expires_at: new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString(),
          created_by: user.id,
          used_at: null,
          revoked_at: null,
        }).select('id,code_preview,guest_name,type,expires_at,created_at').single();
        if (error) throw error;
        created.push({ ...data, code });
      }
      return Response.json({ success: true, invites: created });
    }

    if (action === 'revoke-invite') {
      const { error } = await admin.from('invites').update({ revoked_at: new Date().toISOString() }).eq('id', body.id).is('used_at', null);
      if (error) throw error;
      return Response.json({ success: true });
    }

    if (action === 'update-user') {
      if (!body.id || !['admin', 'membro'].includes(body.role) || !['ativo', 'suspenso'].includes(body.status)) {
        return Response.json({ error: 'Dados de usuário inválidos.' }, { status: 400 });
      }
      if (body.id === user.id && body.status === 'suspenso') {
        return Response.json({ error: 'Você não pode suspender sua própria conta.' }, { status: 400 });
      }
      const { error } = await admin.from('profiles').update({ role: body.role, status: body.status }).eq('id', body.id);
      if (error) throw error;
      return Response.json({ success: true });
    }

    if (action === 'delete-user') {
      if (body.id === user.id) return Response.json({ error: 'Você não pode excluir sua própria conta.' }, { status: 400 });
      const { error } = await admin.auth.admin.deleteUser(body.id);
      if (error) throw error;
      return Response.json({ success: true });
    }

    if (action === 'create-channel') {
      const name = String(body.name || '').trim();
      if (!name || name.length > 50) return Response.json({ error: 'Nome de canal inválido.' }, { status: 400 });
      const { data, error } = await admin.from('channels').insert({ name, is_active: true, guest_access: false, is_waiting_room: false }).select().single();
      if (error) throw error;
      return Response.json({ success: true, channel: data });
    }

    if (action === 'update-channel') {
      const allowed = {};
      if (typeof body.is_active === 'boolean') allowed.is_active = body.is_active;
      if (typeof body.guest_access === 'boolean') allowed.guest_access = body.guest_access;
      if (typeof body.is_waiting_room === 'boolean') allowed.is_waiting_room = body.is_waiting_room;
      if (body.name) allowed.name = String(body.name).trim().slice(0, 50);
      const { error } = await admin.from('channels').update(allowed).eq('id', body.id);
      if (error) throw error;
      return Response.json({ success: true });
    }

    if (action === 'delete-channel') {
      const { error } = await admin.from('channels').delete().eq('id', body.id);
      if (error) throw error;
      return Response.json({ success: true });
    }

    if (action === 'settings') {
      const maxUsers = body.maxUsers === null || body.maxUsers === 'ilimitado' ? null : Math.max(1, Math.min(Number(body.maxUsers), 1000));
      const { error } = await admin.from('server_settings').upsert({ id: 1, maintenance_mode: !!body.maintenanceMode, discord_logs: !!body.discordLogs, max_users: maxUsers, updated_at: new Date().toISOString() });
      if (error) throw error;
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
    const [{ data: users, error: usersError }, { data: invites, error: invitesError }, { data: channels, error: channelsError }, { data: settings, error: settingsError }] = await Promise.all([
      admin.from('profiles').select('id,username,role,status,created_at').order('created_at', { ascending: false }),
      admin.from('invites').select('id,code_preview,guest_name,type,expires_at,used_at,revoked_at,created_at').order('created_at', { ascending: false }).limit(100),
      admin.from('channels').select('*').order('sort_order', { ascending: true }),
      admin.from('server_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    if (usersError || invitesError || channelsError || settingsError) throw usersError || invitesError || channelsError || settingsError;
    return Response.json({ users: users || [], invites: invites || [], channels: channels || [], settings: settings || { maintenance_mode: false, discord_logs: true, max_users: null } });
  } catch (error) {
    return Response.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}
