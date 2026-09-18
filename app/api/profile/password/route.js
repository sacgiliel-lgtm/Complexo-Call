import { createClient } from '@supabase/supabase-js';
import { getRequestActor, actorResponse } from '../../../lib/requestAuth';

function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

export async function POST(request) {
  try {
    const actor = await getRequestActor(request);
    if (!actor.ok) return actorResponse(actor);
    if (actor.type !== 'member') return Response.json({ error: 'Convidados não podem alterar senha.' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    const force = actor.profile?.must_change_password === true;

    if (!validPassword(newPassword)) return Response.json({ error: 'A nova senha deve ter entre 8 e 128 caracteres.' }, { status: 400 });
    if (newPassword === currentPassword) return Response.json({ error: 'A nova senha precisa ser diferente da senha atual.' }, { status: 400 });

    if (!force) {
      if (!currentPassword) return Response.json({ error: 'Informe sua senha atual.' }, { status: 400 });
      const verifier = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        { auth: { persistSession: false } }
      );
      const { error: verifyError } = await verifier.auth.signInWithPassword({ email: actor.email, password: currentPassword });
      if (verifyError) return Response.json({ error: 'A senha atual está incorreta.' }, { status: 400 });
    }

    const { error: passwordError } = await actor.admin.auth.admin.updateUserById(actor.id, { password: newPassword });
    if (passwordError) return Response.json({ error: passwordError.message || 'Não foi possível alterar a senha.' }, { status: 400 });

    const { error: profileError } = await actor.admin
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', actor.id);
    if (profileError) return Response.json({ error: 'Senha alterada, mas não foi possível concluir a ativação da conta. Tente novamente.' }, { status: 500 });

    try {
      await actor.admin.from('activity_logs').insert({
        actor_id: actor.id,
        actor_name: actor.username || actor.email || 'Membro',
        action: 'password_changed',
        target: actor.username || actor.id,
        details: force ? 'primeiro acesso' : 'alteração pelo próprio usuário'
      });
    } catch {}

    return Response.json({ success: true, firstLoginCompleted: force });
  } catch (error) {
    console.error('Password API:', error);
    return Response.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}
