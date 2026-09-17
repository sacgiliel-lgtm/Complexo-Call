// Rate limiting simples, em memória, por chave (normalmente IP + rota).
//
// AVISO IMPORTANTE: isso é "best-effort", não uma solução definitiva.
// Em serverless (Vercel), cada instância/região tem sua própria memória,
// e ela é zerada a cada cold start — então um atacante distribuído ou
// persistente ainda consegue passar por cima disso. Pra proteção robusta
// de verdade, o ideal é um contador compartilhado (ex: Upstash Redis,
// Vercel KV) entre todas as instâncias. Mesmo assim, isso aqui já barra
// abuso casual e scripts simples, então vale a pena manter.

const janelas = new Map();
const LIMITE_MAPA = 5000; // evita crescimento infinito em processos de longa duração

export function limitarTaxa(chave, { maxRequisicoes, janelaMs }) {
  const agora = Date.now();

  // Limpeza oportunista de entradas velhas quando o mapa cresce demais
  if (janelas.size > LIMITE_MAPA) {
    for (const [k, v] of janelas) {
      if (agora - v.inicioJanela > janelaMs) janelas.delete(k);
    }
  }

  const registro = janelas.get(chave);

  if (!registro || agora - registro.inicioJanela > janelaMs) {
    janelas.set(chave, { contagem: 1, inicioJanela: agora });
    return { permitido: true };
  }

  if (registro.contagem >= maxRequisicoes) {
    return { permitido: false, tempoRestanteMs: janelaMs - (agora - registro.inicioJanela) };
  }

  registro.contagem += 1;
  return { permitido: true };
}
