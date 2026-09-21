import { getGuestTicketFromCookie, verifyGuestTicket } from './guestTicket';
import { getSupabaseAdmin } from './supabaseAdmin';
import { syncClerkProfile } from './clerkAuth';

export async function getRequestActor(request) {
  const clerkActor = await syncClerkProfile();
  if (clerkActor.ok || clerkActor.status === 403) return clerkActor;

  const admin = getSupabaseAdmin();
  const ticket = getGuestTicketFromCookie(request);
  const payload = verifyGuestTicket(ticket);
  if (!payload) return { ok: false, status: 401, error: 'Sessão inválida ou expirada.' };

  const { data: guest, error } = await admin
    .from('guest_sessions')
    .select('jti,invite_id,username,expires_at,revoked_at,current_room_name')
    .eq('jti', payload.jti)
    .maybeSingle();

  if (error || !guest || guest.revoked_at || String(guest.invite_id) !== String(payload.inviteId) || new Date(guest.expires_at).getTime() <= Date.now()) {
    return { ok: false, status: 401, error: 'Sessão de convidado expirada ou revogada.' };
  }

  const { data: invite, error: inviteError } = await admin.from('invites').select('room_name').eq('id', guest.invite_id).maybeSingle();
  if (inviteError || !invite) return { ok: false, status: 401, error: 'Convite do convidado não encontrado.' };

  return {
    ok: true,
    type: 'guest',
    id: `guest:${guest.jti}`,
    username: guest.username,
    role: 'convidado',
    guest: { ...guest, room_name: guest.current_room_name || invite.room_name || null, invite_room_name: invite.room_name || null },
    admin,
  };
}

export function actorResponse(actor) {
  return Response.json({ error: actor.error }, { status: actor.status || 401 });
}
