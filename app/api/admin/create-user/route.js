import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return Response.json({ error: 'Token não fornecido.' }, { status: 401 });
    const token = authHeader.slice(7);
    const admin = getSupabaseAdmin();
    const { data: { user: requester }, error: authError } = await admin.auth.getUser(token);
    if (authError || !requester) return Response.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });

    const { data: requesterProfile } = await admin.from('profiles').select('role,status').eq('id', requester.id).single();
    if (!requesterProfile || requesterProfile.role !== 'admin' || requesterProfile.status === 'suspenso') {
      return Response.json({ error: 'Apenas administradores ativos podem criar usuários.' }, { status: 403 });
    }

    const { email, password, username, role } = await request.json();
    if (!email || !password || !username || !['admin', 'membro'].includes(role)) return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
    if (String(username).trim().length < 2 || String(username).trim().length > 32) return Response.json({ error: 'Username deve ter entre 2 e 32 caracteres.' }, { status: 400 });
    if (String(password).length < 8) return Response.json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, { status: 400 });

    const { data: newUser, error: createError } = await admin.auth.admin.createUser({ email: String(email).trim().toLowerCase(), password, email_confirm: true });
    if (createError) return Response.json({ error: createError.message }, { status: 400 });

    const { error: profileError } = await admin.from('profiles').upsert({ id: newUser.user.id, username: String(username).trim(), role, status: 'ativo' }, { onConflict: 'id' });
    if (profileError) {
      await admin.auth.admin.deleteUser(newUser.user.id);
      throw profileError;
    }
    return Response.json({ success: true, user: { id: newUser.user.id, username: String(username).trim(), role } });
  } catch (error) {
    console.error('Create user:', error);
    return Response.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}
