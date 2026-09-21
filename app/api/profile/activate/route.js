import { clerkClient } from '@clerk/nextjs/server';
import { getClerkIdentity, syncClerkProfile, getEmailLoginExternalId } from '../../../../lib/clerkAuth';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { logDiscordEvent } from '../../../../lib/discordLogger';
import crypto from 'crypto';

function getActivationSigningSecret() {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) throw new Error('CLERK_SECRET_KEY não está configurada.');
  return secret;
}

function verifyActivationToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;

  const [profileId, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!profileId || !Number.isSafeInteger(expiresAt) || expiresAt < Date.now() || !signature) return null;

  const payload = `${profileId}.${expiresAt}`;
  const expected = crypto
    .createHmac('sha256', getActivationSigningSecret())
    .update(payload)
    .digest('base64url');

  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  return { profileId, expiresAt };
}


export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = String(body.username || '').trim();
    const password = typeof body.password === 'string' ? body.password : '';
    const activationToken = typeof body.activationToken === 'string' ? body.activationToken.trim() : '';

    if (username.length < 4 || username.length > 64) return Response.json({ error: 'O username deve ter entre 4 e 64 caracteres.' }, { status: 400 });
    if (password && (password.length < 8 || password.length > 128)) return Response.json({ error: 'A senha deve ter entre 8 e 128 caracteres.' }, { status: 400 });

    const identity = await getClerkIdentity();
    if (!identity) return Response.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });

    const admin = getSupabaseAdmin();
    const client = await clerkClient();

    let invitedEmail = '';
    let pendingProfileId = '';

    if (activationToken) {
      const tokenData = verifyActivationToken(activationToken);
      if (!tokenData) {
        return Response.json({ error: 'O convite de ativação é inválido ou expirou. Solicite um novo convite ao administrador.' }, { status: 403 });
      }
      pendingProfileId = tokenData.profileId;
    } else {
      // O caminho principal usa a referência gravada pelo Clerk no usuário
      // a partir do publicMetadata do convite. O token da URL continua como
      // fallback para compatibilidade com convites já emitidos.
      const metadataProfileId = identity.user?.publicMetadata?.pendingProfileId;
      if (typeof metadataProfileId === 'string' && metadataProfileId.trim()) {
        pendingProfileId = metadataProfileId.trim();
      }
    }

    if (pendingProfileId) {
      const { data: pendingProfile, error: pendingError } = await admin
        .from('profiles')
        .select('id,pending_email,clerk_user_id,role')
        .eq('id', pendingProfileId)
        .maybeSingle();

      if (pendingError) {
        console.error('Activate account: pending profile lookup failed.', pendingError);
        return Response.json({ error: 'Não foi possível validar o convite de ativação.' }, { status: 500 });
      }

      if (
        !pendingProfile
        || !pendingProfile.pending_email
        || (pendingProfile.clerk_user_id && pendingProfile.clerk_user_id !== identity.userId)
      ) {
        return Response.json({ error: 'Este convite não corresponde a esta conta.' }, { status: 403 });
      }

      invitedEmail = String(pendingProfile.pending_email).trim().toLowerCase();

      // O convite e o perfil já estão vinculados pelo administrador. Agora
      // gravamos o ID Clerk no perfil antes de qualquer sincronização.
      const { data: existingLinkedProfile, error: existingLinkedProfileError } = await admin
        .from('profiles')
        .select('id')
        .eq('clerk_user_id', identity.userId)
        .neq('id', pendingProfile.id)
        .maybeSingle();

      if (existingLinkedProfileError) {
        console.error('Activate account: linked profile lookup failed.', existingLinkedProfileError);
        return Response.json({ error: 'Não foi possível validar o vínculo desta conta.' }, { status: 500 });
      }

      if (existingLinkedProfile) {
        return Response.json({ error: 'Esta conta Clerk já está vinculada a outro perfil.' }, { status: 409 });
      }

      const { error: linkProfileError } = await admin
        .from('profiles')
        .update({ clerk_user_id: identity.userId, pending_email: invitedEmail })
        .eq('id', pendingProfile.id);

      if (linkProfileError) {
        console.error('Activate account: failed to link pending profile.', linkProfileError);
        return Response.json({ error: 'Não foi possível vincular sua conta ao perfil de ativação.' }, { status: 500 });
      }

      const clerkUser = await client.users.getUser(identity.userId);
      const normalizedCurrent = clerkUser.emailAddresses?.find(
        (item) => String(item.emailAddress || '').trim().toLowerCase() === invitedEmail
      );

      if (!normalizedCurrent) {
        try {
          await client.emailAddresses.createEmailAddress({
            userId: identity.userId,
            emailAddress: invitedEmail,
            primary: true,
            verified: true,
          });
        } catch (error) {
          const clerkCode = error?.errors?.[0]?.code;
          if (clerkCode === 'form_identifier_exists') {
            return Response.json({
              error: 'O e-mail deste convite já está vinculado a outra conta no Clerk.',
            }, { status: 409 });
          }
          throw error;
        }
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

    if (invitedEmail) {
      const loginExternalId = getEmailLoginExternalId(invitedEmail);
      if (loginExternalId && actor.clerkUser?.externalId !== loginExternalId) {
        try {
          await client.users.updateUser(actor.clerkUserId, { externalId: loginExternalId });
        } catch (error) {
          console.warn('Activate account: could not set email login identifier.', {
            userId: actor.clerkUserId,
            error: error?.message || String(error),
          });
        }
      }
    }

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
      .update({ username })
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
