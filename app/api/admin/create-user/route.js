import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { logDiscordEvent } from '../../../../lib/discordLogger';

function getSiteUrl(request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, '');
  return 'http://localhost:3000';
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return Response.json({ error: 'Token não fornecido.' }, { status: 401 });

    const token = authHeader.slice(7);
    const admin = getSupabaseAdmin();
    const { data: { user: requester }, error: authError } = await admin.auth.getUser(token);
    if (authError || !requester) return Response.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });

    const { data: requesterProfile } = await admin
      .from('profiles')
      .select('role,status,username')
      .eq('id', requester.id)
      .single();

    if (!requesterProfile || requesterProfile.role !== 'admin' || requesterProfile.status === 'suspenso') {
      return Response.json({ error: 'Apenas administradores ativos podem criar usuários.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const username = String(body.username || '').trim();
    const role = body.role;

    if (!email || !username || !['admin', 'membro'].includes(role)) {
      return Response.json({ error: 'Preencha todos os campos corretamente.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
    }
    if (username.length < 2 || username.length > 32) {
      return Response.json({ error: 'Username deve ter entre 2 e 32 caracteres.' }, { status: 400 });
    }

    const redirectTo = `${getSiteUrl(request)}/?activate=1`;
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        username,
        role,
      },
      redirectTo,
    });

    if (inviteError) {
      return Response.json({ error: inviteError.message }, { status: 400 });
    }

    const invitedUser = inviteData?.user;
    if (!invitedUser?.id) {
      return Response.json({ error: 'O Supabase não retornou o usuário convidado.' }, { status: 500 });
    }

    const { error: profileError } = await admin.from('profiles').upsert({
      id: invitedUser.id,
      username,
      role,
      status: 'ativo',
      presence_status: 'offline',
      must_change_password: true,
    }, { onConflict: 'id' });

    if (profileError) {
      await admin.auth.admin.deleteUser(invitedUser.id);
      throw profileError;
    }

    await logDiscordEvent({
      action: 'user_created',
      actor: { ...requesterProfile, id: requester.id, email: requester.email },
      target: username,
      details: `Cargo: ${role}; e-mail: ${email}; convite de ativação enviado`,
    });

    return Response.json({
      success: true,
      emailSent: true,
      user: {
        id: invitedUser.id,
        username,
        role,
        email,
      },
      message: `Usuário criado. O convite de ativação foi enviado para ${email}.`,
    });
  } catch (error) {
    console.error('Create user:', error);
    return Response.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}
