import crypto from 'crypto';

const TICKET_VERSION = 1;
const DEFAULT_TTL_MS = 15 * 60 * 1000;

function getSecret() {
  const secret = process.env.GUEST_TICKET_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('GUEST_TICKET_SECRET must be configured with at least 32 characters.');
  }
  return secret;
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function createGuestTicket({ jti, username, inviteId, expiresAt }) {
  if (!jti || !username || !inviteId || !expiresAt) throw new Error('Missing guest ticket fields.');
  const payload = JSON.stringify({
    v: TICKET_VERSION,
    jti,
    username,
    inviteId,
    exp: new Date(expiresAt).getTime(),
  });
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifyGuestTicket(ticket) {
  if (!ticket || typeof ticket !== 'string') return null;
  const parts = ticket.split('.');
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (data.v !== TICKET_VERSION || !data.jti || !data.username || !data.inviteId || !data.exp) return null;
    if (data.exp <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export { DEFAULT_TTL_MS };
