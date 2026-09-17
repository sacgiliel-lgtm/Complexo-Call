import { createClient } from '@supabase/supabase-js';
import { createGuestTicket } from '../../../lib/guestTicket';
import { limitarTaxa } from '../../../lib/rateLimit';

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');

    // Limita tentativas por IP pra dificultar força bruta em cima dos códigos de convite
    const { permitido } = limitarTaxa(`convite:${ip || 'desconhecido'}`, { maxRequisicoes: 5, janelaMs: 10 * 60 * 1000 });
    if (!permitido) {
      return Response.json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }, { status: 429 });
    }

    const { code } = await request.json();

    if (!code) {
      return Response.json({ error: 'Código não fornecido' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Operação Atômica: Tenta dar UPDATE onde o código existe e ainda não foi usado (used = false).
    // Se outra requisição tentar ao mesmo tempo, apenas a primeira conseguirá alterar.
    const { data, error } = await supabase
      .from('invites')
      .update({ used: true })
      .eq('code', code)
      .eq('used', false)
      .select();

    if (error) {
      console.error(error);
      return Response.json({ error: 'Erro ao validar no banco de dados' }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return Response.json({ error: 'Código inválido, expirado ou já utilizado.' }, { status: 400 });
    }

    // Convite válido: emite um passe assinado de curta duração. É esse passe
    // (não mais o username cru) que o /api/token vai exigir pra liberar a sala.
    const username = `Visitante_${code.trim()}`;
    const ticket = createGuestTicket({ username }, 30 * 60 * 1000); // 30 minutos

    return Response.json({ success: true, invite: data[0], ticket, username });

  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
