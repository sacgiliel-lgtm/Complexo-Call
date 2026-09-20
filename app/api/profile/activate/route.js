import { clerkClient } from '@clerk/nextjs/server';
import { getClerkIdentity, syncClerkProfile } from '../../../../lib/clerkAuth';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { logDiscordEvent } from '../../../../lib/discordLogger';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = String(body.username || '').trim();
    const password = typeof body.password === 'string' ? body.password : '';
    const invitedEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (username.length < 4 || username.length > 64) return Response.json({ error: 'O username deve ter entre 4 e 64 caracteres.' }, { status: 400 });
    if (password && (password.length < 8 || password.length > 128)) return Response.json({ error: 'A senha deve ter entre 8 e 128 caracteres.' }, { status: 400 });
    if (invitedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) return Response.json({ error: 'O e-mail do convite é inválido.' }, { status: 400 });

    const identity = await getClerkIdentity();
    if (!identity) return Response.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });

    const admin = getSupabaseAdmin();
    const client = await clerkClient();

    // O e-mail informado pelo fluxo de convite vem do próprio SignUp criado
    // a partir do ticket do Clerk. Só o aceitamos quando corresponde ao cadastro
    // pendente criado anteriormente pelo administrador.
    if (invitedEmail) {
      const { data: pendingProfile, error: pendingError } = await admin
        .from('profiles')
        .select('id,pending_email,clerk_user_id')
        .ilike('pending_email', invitedEmail)
        .maybeSingle();

      if (pendingError) {
        console.error('Activate account: pending profile lookup failed.', pendingError);
        return Response.json({ error: 'Não foi possível validar o convite de ativação.' }, { status: 500 });
      }

      if (!pendingProfile || (pendingProfile.clerk_user_id && pendingProfile.clerk_user_id !== identity.userId)) {
        return Response.json({ error: 'O e-mail do convite não corresponde a uma solicitação pendente desta conta.' }, { status: 403 });
      }

      const clerkUser = await client.users.getUser(identity.userId);
      const normalizedCurrent = clerkUser.emailAddresses?.find(
        (item) => String(item.emailAddress || '').trim().toLowerCase() === invitedEmail
      );

      if (!normalizedCurrent) {
        await client.emailAddresses.createEmailAddress({
          userId: identity.userId,
          emailAddress: invitedEmail,
          primary: true,
          verified: true,
        });
      } else {
        const isVerified = normalizedCurrent.verification?.status === 'verified';
        const isPrimary = normalizedCurrent.id === clerkUser.primaryEmailAddressId;
        if (!isVerified || !isPrimary) {
          await client.emailAddresses.updateEmailAddress(normalizedCurrent.id, {
            verified: true,
            primary: true,
          });
        }
      }
    }

    const actor = await syncClerkProfile();
    if (!actor.ok) return Response.json({ error: actor.error }, { status: actor.status || 401 });

    const { data: duplicate } = await actor.admin.from('profiles').select('id').ilike('username', username).neq('id', actor.id).maybeSingle();
    if (duplicate) return Response.json({ error: 'Esse username já está em uso. Escolha outro.' }, { status: 409 });
    const updates = { username };
    if (password) updates.password = password;
    try {
      await client.users.updateUser(actor.clerkUserId, updates);
    } catch (error) {
      const clerkCode = error?.errors?.[0]?.code;
      if (clerkCode === 'form_username_invalid_character') {
        return Response.json({ error: 'O Clerk recusou esse username por conter caracteres não permitidos.' }, { status: 422 });
      }
      if (clerkCode === 'form_username_invalid_length') {
        return Response.json({ error: 'O Clerk exige que o username tenha entre 4 e 64 caracteres.' }, { status: 422 });
      }
      throw error;
    }

    const { data: profile, error } = await actor.admin.from('profiles')
      .update({ username, pending_email: actor.email || null })
      .eq('id', actor.id)
      .select('username,role,status')
      .single();
    if (error) return Response.json({ error: 'Não foi possível concluir a ativação do perfil.' }, { status: 500 });

    await logDiscordEvent({
      action: 'account_activated',
      actor: { id: actor.id, email: actor.email, username, role: actor.role },
      target: username,
      details: 'Conta ativada/configurada pelo próprio usuário via Clerk.',
    });

    return Response.json({ success: true, profile });
  } catch (error) {
    console.error('Activate account:', error);
    return Response.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}
