import crypto from 'crypto';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { createGuestTicket, DEFAULT_TTL_MS } from '../../../lib/guestTicket';

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export async function POST(request) {
  try {
    const { code } = await request.json();
    const normalized = normalizeCode(code);
    if (!normalized || normalized.length < 8 || normalized.length > 64) {
      return Response.json({ error: 'Código de convite inválido.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const now = new Date();
    const { data: invite, error: lookupError } = await admin
      .from('invites')
      .select('id,guest_name,type,expires_at,used_at,revoked_at,code_hash')
      .eq('code_hash', hashCode(normalized))
      .is('used_at', null)
      .is('revoked_at', null)
      .gt('expires_at', now.toISOString())
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!invite) return Response.json({ error: 'Código inválido, expirado, revogado ou já utilizado.' }, { status: 400 });

    const jti = crypto.randomUUID();
    const expiresAt = new Date(Math.min(new Date(invite.expires_at).getTime(), Date.now() + DEFAULT_TTL_MS));
    const username = String(invite.guest_name || `Convidado_${jti.slice(0, 6)}`).trim().slice(0, 32);

    // Consume the invite first. A concurrent request can only win if this row is still unused.
    const { data: consumed, error: consumeError } = await admin
      .from('invites')
      .update({ used_at: now.toISOString() })
      .eq('id', invite.id)
      .is('used_at', null)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle();

    if (consumeError) throw consumeError;
    if (!consumed) return Response.json({ error: 'Este convite acabou de ser utilizado. Gere outro convite.' }, { status: 409 });

    const { error: sessionError } = await admin.from('guest_sessions').insert({
      jti,
      invite_id: invite.id,
      username,
      expires_at: expiresAt.toISOString(),
    });
    if (sessionError) throw sessionError;

    const ticket = createGuestTicket({ jti, username, inviteId: invite.id, expiresAt });
    return Response.json({ success: true, ticket, username, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error('Validate invite:', error);
    return Response.json({ error: 'Erro interno ao validar o convite.' }, { status: 500 });
  }
}
