import { getGuestTicketFromCookie, verifyGuestTicket } from '../../../../lib/guestTicket';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request) {
  try {
    const ticket = getGuestTicketFromCookie(request);
    const payload = verifyGuestTicket(ticket);
    if (payload) {
      const admin = getSupabaseAdmin();
      await admin.from('guest_sessions').update({ revoked_at: new Date().toISOString() }).eq('jti', payload.jti);
    }
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', 'cpx_guest_ticket=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + (process.env.NODE_ENV === 'production' ? '; Secure' : ''));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...Object.fromEntries(headers.entries()) } });
  } catch (error) {
    console.error('Guest logout:', error);
    return Response.json({ error: 'Não foi possível encerrar a sessão.' }, { status: 500 });
  }
}
