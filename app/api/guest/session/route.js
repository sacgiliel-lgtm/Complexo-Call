import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { getGuestTicketFromCookie, verifyGuestTicket } from '../../../lib/guestTicket';

export async function GET(request) {
  try {
    const ticket=getGuestTicketFromCookie(request);
    const payload=verifyGuestTicket(ticket);
    if(!payload)return Response.json({error:'Sessão de convidado expirada.'},{status:401});
    const admin=getSupabaseAdmin();
    const {data:guest,error}=await admin.from('guest_sessions').select('jti,invite_id,username,expires_at,revoked_at').eq('jti',payload.jti).maybeSingle();
    if(error||!guest||guest.revoked_at||String(guest.invite_id)!==String(payload.inviteId)||new Date(guest.expires_at).getTime()<=Date.now())return Response.json({error:'Sessão de convidado inválida.'},{status:401});
    return Response.json({username:guest.username,role:'convidado',expiresAt:guest.expires_at});
  }catch(error){console.error('Guest session:',error);return Response.json({error:'Erro interno.'},{status:500});}
}
