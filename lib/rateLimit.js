import crypto from 'crypto';

const buckets = new Map();
const MAX_BUCKETS = 10000;

export function limitarTaxa(chave, { maxRequisicoes, janelaMs }) {
  const now = Date.now();
  const current = buckets.get(chave);
  if (!current || now - current.startedAt >= janelaMs) {
    if (buckets.size > MAX_BUCKETS) {
      for (const [key, value] of buckets) {
        if (now - value.startedAt >= janelaMs) buckets.delete(key);
      }
    }
    buckets.set(chave, { count: 1, startedAt: now });
    return { permitido: true };
  }
  if (current.count >= maxRequisicoes) {
    return { permitido: false, tempoRestanteMs: janelaMs - (now - current.startedAt) };
  }
  current.count += 1;
  return { permitido: true };
}

export function hashRateLimitKey(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
