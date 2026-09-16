import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    // 1. Recebe os dados do front-end e o token de segurança do usuário logado
    const { email, password, username, role } = await request.json();
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return Response.json({ error: 'Acesso bloqueado: Token não fornecido.' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');

    // 2. Instancia o Supabase com a Service Role Key (CHAVE MESTRA)
    // IMPORTANTE: Nunca use NEXT_PUBLIC_ na frente dessa variável no .env!
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY, 
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 3. Validação de Segurança: Garante que quem chamou a API é realmente um Admin
    const { data: { user: requesterUser }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
    
    if (verifyError || !requesterUser) {
      return Response.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });
    }

    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', requesterUser.id)
      .single();

    if (!adminProfile || adminProfile.role !== 'admin') {
      return Response.json({ error: 'Tentativa de invasão detectada. Apenas administradores podem executar esta ação.' }, { status: 403 });
    }

    // 4. Criação do Usuário no sistema Auth (Ignorando qualquer RLS)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true // Já confirma o e-mail automaticamente
    });

    if (createError) throw createError;

    // 5. Opcional: Atualiza o perfil na tabela 'profiles' (caso seu trigger demore ou precise forçar o role exato)
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ username: username, role: role })
      .eq('id', newUser.user.id);

    if (updateError) throw updateError;

    return Response.json({ success: true, message: 'Usuário cadastrado com sucesso no Complexo!' });

  } catch (error) {
    console.error('Erro na API de criação de usuário:', error);
    return Response.json({ error: error.message || 'Erro interno no servidor.' }, { status: 500 });
  }
}
