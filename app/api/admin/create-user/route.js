import crypto from 'crypto';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return Response.json({ error: 'Token não fornecido.' }, { status: 401 });
    const token = authHeader.slice(7);
    const admin = getSupabaseAdmin();
    const { data: { user: requester }, error: authError } = await admin.auth.getUser(token);
    if (authError || !requester) return Response.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });
    const { data: requesterProfile } = await admin.from('profiles').select('role,status,username').eq('id', requester.id).single();
    if (!requesterProfile || requesterProfile.role !== 'admin' || requesterProfile.status === 'suspenso') return Response.json({ error: 'Apenas administradores ativos podem criar usuários.' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = crypto.randomBytes(18).toString('base64url');
    const username = String(body.username || '').trim();
    const role = body.role;
    if (!email || !username || !['admin', 'membro'].includes(role)) return Response.json({ error: 'Preencha todos os campos corretamente.' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
    if (username.length < 2 || username.length > 32) return Response.json({ error: 'Username deve ter entre 2 e 32 caracteres.' }, { status: 400 });

    const { data: newUser, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError) return Response.json({ error: createError.message }, { status: 400 });
    const { error: profileError } = await admin.from('profiles').upsert({ id: newUser.user.id, username, role, status: 'ativo', presence_status: 'offline', must_change_password: true }, { onConflict: 'id' });
    if (profileError) {
      await admin.auth.admin.deleteUser(newUser.user.id);
      throw profileError;
    }
    try { await admin.from('activity_logs').insert({ actor_id: requester.id, actor_name: requesterProfile.username || requester.email || 'Admin', action: 'user_created', target: username, details: `cargo=${role}; email=${email}` }); } catch (logError) { console.error('Create user log:', logError); }
    return Response.json({ success: true, user: { id: newUser.user.id, username, role }, temporaryPassword: password });
  } catch (error) {
    console.error('Create user:', error);
    return Response.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}
