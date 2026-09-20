import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { logDiscordEvent } from '../../../../lib/discordLogger';

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Token não fornecido.' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const admin = getSupabaseAdmin();
    const { data: { user }, error: authError } = await admin.auth.getUser(token);

    if (authError || !user) {
      return Response.json({ error: 'Sessão inválida ou expirada. Abra novamente o link recebido por e-mail.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const username = String(body.username || '').trim();
    const password = typeof body.password === 'string' ? body.password : '';

    if (username.length < 2 || username.length > 32) {
      return Response.json({ error: 'O username deve ter entre 2 e 32 caracteres.' }, { status: 400 });
    }
    if (!/^[\p{L}\p{N} _.-]+$/u.test(username)) {
      return Response.json({ error: 'O username contém caracteres não permitidos.' }, { status: 400 });
    }
    if (password.length < 8) {
      return Response.json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, { status: 400 });
    }

    const { data: currentProfile, error: profileError } = await admin
      .from('profiles')
      .select('id,username,role,status,must_change_password')
      .eq('id', user.id)
      .single();

    if (profileError || !currentProfile) {
      return Response.json({ error: 'Perfil da conta não encontrado.' }, { status: 403 });
    }
    if (currentProfile.status === 'suspenso') {
      return Response.json({ error: 'Esta conta está suspensa.' }, { status: 403 });
    }

    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .neq('id', user.id)
      .maybeSingle();

    if (existing) {
      return Response.json({ error: 'Esse username já está em uso. Escolha outro.' }, { status: 409 });
    }

    const { error: usernameError } = await admin
      .from('profiles')
      .update({ username })
      .eq('id', user.id);

    if (usernameError) {
      return Response.json({ error: 'Não foi possível salvar o username.' }, { status: 500 });
    }

    const { error: passwordError } = await admin.auth.admin.updateUserById(user.id, { password });

    if (passwordError) {
      return Response.json({ error: 'O username foi salvo, mas não foi possível definir a senha. Tente novamente.' }, { status: 500 });
    }

    const { error: finalizeError } = await admin
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', user.id);

    if (finalizeError) {
      return Response.json({ error: 'Não foi possível concluir a ativação da conta. Tente novamente.' }, { status: 500 });
    }

    await logDiscordEvent({
      action: 'account_activated',
      actor: { id: user.id, email: user.email, username, role: currentProfile.role },
      target: username,
      details: 'Conta ativada pelo próprio usuário.',
    });

    return Response.json({
      success: true,
      profile: {
        username,
        role: currentProfile.role,
      },
    });
  } catch (error) {
    console.error('Activate account:', error);
    return Response.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}
