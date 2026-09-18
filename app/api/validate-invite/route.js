import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { createGuestTicket, DEFAULT_TTL_MS } from '../../../lib/guestTicket';
import crypto from 'crypto';

const hashCode = code => crypto.createHash('sha256').update(code).digest('hex');
const normalize = code => String(code||'').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'');

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const code=normalize(body.code);
    const guestName=String(body.guestName || '').trim().replace(/\s+/g, ' ').slice(0, 32);
    if(!code||code.length<8||code.length>64)return Response.json({error:'Código de convite inválido.'},{status:400});
    if(!guestName||guestName.length<2)return Response.json({error:'Informe seu nome para entrar no convite.'},{status:400});
    const admin=getSupabaseAdmin();
    const {data:invite,error}=await admin.from('invites').select('id,guest_name,type,room_name,expires_at,used_at,revoked_at,code_hash').eq('code_hash',hashCode(code)).is('used_at',null).is('revoked_at',null).gt('expires_at',new Date().toISOString()).maybeSingle();
    if(error)throw error;
    if(!invite)return Response.json({error:'Código inválido, expirado, revogado ou já utilizado.'},{status:400});
    let roomName = null;
    if (invite.room_name) {
      const { data: invitedChannel, error: roomError } = await admin.from('channels').select('name,is_active,guest_access').eq('name', invite.room_name).maybeSingle();
      if (roomError) throw roomError;
      if (!invitedChannel || !invitedChannel.is_active || !invitedChannel.guest_access) {
        return Response.json({ error: 'A call deste convite não está disponível para convidados.' }, { status: 410 });
      }
      roomName = invitedChannel.name;
    }
    const jti=crypto.randomUUID();
    const expiresAt=new Date(Math.min(new Date(invite.expires_at).getTime(),Date.now()+DEFAULT_TTL_MS));
    const username=guestName;
    const {data:consumed,error:consumeError}=await admin.from('invites').update({used_at:new Date().toISOString(),guest_name:username}).eq('id',invite.id).is('used_at',null).is('revoked_at',null).select('id').maybeSingle();
    if(consumeError)throw consumeError;
    if(!consumed)return Response.json({error:'Este convite acabou de ser utilizado. Gere outro convite.'},{status:409});
    const {error:sessionError}=await admin.from('guest_sessions').insert({jti,invite_id:String(invite.id),username,expires_at:expiresAt.toISOString()});
    if(sessionError)throw sessionError;
    const ticket=createGuestTicket({jti,username,inviteId:String(invite.id),expiresAt});
    const response=Response.json({success:true,username,roomName,expiresAt:expiresAt.toISOString()});
    response.headers.set('Set-Cookie',`cpx_guest_ticket=${encodeURIComponent(ticket)}; Path=/; Max-Age=${Math.floor((expiresAt.getTime()-Date.now())/1000)}; HttpOnly; SameSite=Strict${process.env.NODE_ENV==='production'?'; Secure':''}`);
    return response;
  }catch(error){console.error('Validate invite:',error);return Response.json({error:'Erro interno ao validar o convite.'},{status:500});}
}
