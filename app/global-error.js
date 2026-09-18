'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    fetch('/api/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'error',
        channel: 'global',
        target: 'Aplicação',
        details: error?.message || 'Erro global não identificado.',
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: '100vh', background: '#09070c', color: '#eee8f2', fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center' }}>
        <main style={{ maxWidth: 560, padding: 32, textAlign: 'center' }}>
          <h1>Ocorreu um erro inesperado</h1>
          <p>O CPX registrou o problema. Tente novamente.</p>
          <button type="button" onClick={() => reset()} style={{ marginTop: 16, padding: '10px 16px', borderRadius: 10, border: '1px solid #3b3045', background: '#17111c', color: '#eee8f2', cursor: 'pointer' }}>
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
