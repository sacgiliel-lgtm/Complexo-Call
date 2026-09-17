import crypto from 'crypto';

// Este segredo NUNCA deve ter o prefixo NEXT_PUBLIC_ (precisa ficar só no servidor).
// Gere um valor aleatório longo, ex: `openssl rand -hex 32`.
const SECRET = process.env.GUEST_TICKET_SECRET;

function assinar(dado) {
  return crypto.createHmac('sha256', SECRET).update(dado).digest('base64url');
}

/**
 * Cria um "passe" temporário e assinado para um convidado que acabou de validar
 * um código de convite. O front-end guarda esse passe (sessionStorage) e manda
 * ele de volta pro /api/token — é a prova de que aquele convite foi mesmo validado.
 *
 * @param {object} payload - dados a incluir no passe (ex: { username })
 * @param {number} ttlMs - por quanto tempo o passe é válido (padrão: 30 min)
 */
export function createGuestTicket(payload, ttlMs = 30 * 60 * 1000) {
  if (!SECRET) {
    throw new Error('GUEST_TICKET_SECRET não configurado no .env.local');
  }

  const corpo = { ...payload, exp: Date.now() + ttlMs };
  const corpoCodificado = Buffer.from(JSON.stringify(corpo)).toString('base64url');
  const assinatura = assinar(corpoCodificado);

  return `${corpoCodificado}.${assinatura}`;
}

/**
 * Verifica um passe de convidado. Retorna o payload se for válido e ainda não
 * tiver expirado, ou `null` se for inválido/expirado/adulterado.
 */
export function verifyGuestTicket(ticket) {
  if (!SECRET || !ticket || typeof ticket !== 'string') return null;

  const partes = ticket.split('.');
  if (partes.length !== 2) return null;

  const [corpoCodificado, assinatura] = partes;
  const assinaturaEsperada = assinar(corpoCodificado);

  const bufAssinatura = Buffer.from(assinatura);
  const bufEsperada = Buffer.from(assinaturaEsperada);

  // Comparação em tempo constante pra evitar timing attack na assinatura
  if (bufAssinatura.length !== bufEsperada.length || !crypto.timingSafeEqual(bufAssinatura, bufEsperada)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(corpoCodificado, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload.exp || Date.now() > payload.exp) return null;

  return payload;
}
