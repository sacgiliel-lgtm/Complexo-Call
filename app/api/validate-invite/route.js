import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
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

    return Response.json({ success: true, invite: data[0] });

  } catch (err) {
    return Response.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
