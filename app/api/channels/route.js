import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { verifyGuestTicket } from '../../../lib/guestTicket';

export async function GET(request) {
  try {
    const admin = getSupabaseAdmin();
    const auth = request.headers.get('authorization');
    const guestTicket = request.headers.get('x-guest-ticket');
    let role = null;

    if (auth?.startsWith('Bearer ')) {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data: { user }, error } = await supabase.auth.getUser(auth.slice(7));
      if (error || !user) return Response.json({ error: 'Sessão inválida.' }, { status: 401 });
      const { data: profile } = await admin.from('profiles').select('role,status').eq('id', user.id).single();
      if (!profile || profile.status === 'suspenso') return Response.json({ error: 'Acesso negado.' }, { status: 403 });
      role = profile.role || 'membro';
    } else if (guestTicket) {
      const payload = verifyGuestTicket(guestTicket);
      if (!payload) return Response.json({ error: 'Convite inválido.' }, { status: 401 });
      const { data: guest } = await admin.from('guest_sessions').select('expires_at,revoked_at').eq('jti', payload.jti).maybeSingle();
      if (!guest || guest.revoked_at || new Date(guest.expires_at).getTime() <= Date.now()) return Response.json({ error: 'Convite expirado.' }, { status: 401 });
      role = 'convidado';
    } else return Response.json({ error: 'Não autenticado.' }, { status: 401 });

    const { data: settings } = await admin.from('server_settings').select('maintenance_mode').eq('id', 1).maybeSingle();
    if (settings?.maintenance_mode && role !== 'admin') return Response.json({ error: 'Servidor em manutenção.' }, { status: 503 });

    let query = admin.from('channels').select('id,name,is_waiting_room,guest_access').eq('is_active', true).order('sort_order', { ascending: true });
    if (role === 'convidado') query = query.eq('guest_access', true);
    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ channels: data || [] });
  } catch (error) {
    console.error('Channels API:', error);
    return Response.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
