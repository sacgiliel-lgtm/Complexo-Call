import crypto from 'crypto';

const TICKET_VERSION = 1;
const DEFAULT_TTL_MS = 15 * 60 * 1000;

function secret() {
  const value = process.env.GUEST_TICKET_SECRET;
  if (!value || value.length < 32) throw new Error('GUEST_TICKET_SECRET must contain at least 32 characters.');
  return value;
}
function sign(payload) { return crypto.createHmac('sha256', secret()).update(payload).digest('base64url'); }
export function createGuestTicket({ jti, username, inviteId, expiresAt }) {
  const encoded = Buffer.from(JSON.stringify({ v:TICKET_VERSION,jti,username,inviteId,exp:new Date(expiresAt).getTime() }), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}
export function verifyGuestTicket(ticket) {
  if (!ticket || typeof ticket !== 'string') return null;
  const [encoded, signature] = ticket.split('.');
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const a=Buffer.from(signature), b=Buffer.from(expected);
  if (a.length!==b.length || !crypto.timingSafeEqual(a,b)) return null;
  try { const data=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')); if(data.v!==TICKET_VERSION||!data.jti||!data.username||!data.inviteId||!data.exp||data.exp<=Date.now())return null; return data; } catch { return null; }
}
export function getGuestTicketFromCookie(request) {
  const cookie=request.headers.get('cookie')||'';
  const match=cookie.match(/(?:^|;\s*)cpx_guest_ticket=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
export { DEFAULT_TTL_MS };
