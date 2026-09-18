import { createClient } from '@supabase/supabase-js';
import { getGuestTicketFromCookie, verifyGuestTicket } from './guestTicket';
import { getSupabaseAdmin } from './supabaseAdmin';

export async function getRequestActor(request) {
  const admin = getSupabaseAdmin();
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice(7);
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    );
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return { ok: false, status: 401, error: 'Sessão inválida ou expirada.' };
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id,username,role,status,presence_status,last_seen_at,must_change_password')
      .eq('id', user.id)
      .single();
    if (profileError || !profile) return { ok: false, status: 403, error: 'Perfil não encontrado.' };
    if (profile.status === 'suspenso') return { ok: false, status: 403, error: 'Sua conta está suspensa.' };
    return {
      ok: true,
      type: 'member',
      id: user.id,
      email: user.email || '',
      username: profile.username || user.email?.split('@')[0] || 'Membro',
      role: profile.role || 'membro',
      profile,
      admin,
    };
  }

  const ticket = getGuestTicketFromCookie(request);
  const payload = verifyGuestTicket(ticket);
  if (!payload) return { ok: false, status: 401, error: 'Sessão de convidado expirada ou inválida.' };
  const { data: guest, error } = await admin
    .from('guest_sessions')
    .select('jti,invite_id,username,expires_at,revoked_at')
    .eq('jti', payload.jti)
    .maybeSingle();
  if (error || !guest || guest.revoked_at || String(guest.invite_id) !== String(payload.inviteId) || new Date(guest.expires_at).getTime() <= Date.now()) {
    return { ok: false, status: 401, error: 'Sessão de convidado expirada ou revogada.' };
  }
  const { data: invite, error: inviteError } = await admin
    .from('invites')
    .select('room_name')
    .eq('id', guest.invite_id)
    .maybeSingle();
  if (inviteError || !invite) {
    return { ok: false, status: 401, error: 'Convite do convidado não encontrado.' };
  }
  return {
    ok: true,
    type: 'guest',
    id: `guest:${guest.jti}`,
    username: guest.username,
    role: 'convidado',
    guest: { ...guest, room_name: invite.room_name || null },
    admin,
  };
}

export function actorResponse(actor) {
  return Response.json({ error: actor.error }, { status: actor.status || 401 });
}
